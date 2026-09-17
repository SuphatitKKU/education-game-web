"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { formatDuration, isToday, runProgress, STAGE_LABELS } from "@/features/tracking/progress";
import { deleteTeam, getTeacherTeamDetail, listTeams } from "@/features/tracking/persistence";
import type { TeacherTeamDetail, TeamOverview } from "@/features/tracking/types";
import { studyTopicLabel } from "@/features/game/learning-topics";
import { BOX_MISSION_GOALS, RECAP } from "@/features/game/data";
import { AppIcon } from "@/components/AppIcon";
import {
  attendanceForRun,
  buildTeacherCsv,
  latestRunForMission,
  missionFilterLabel,
  missionNumberForRun,
  MISSION_LABELS,
  runsForMission,
  type DashboardMissionFilter,
} from "./teacher-report";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
// Convenience access for the classroom device. This is intentionally a simple
// front-end gate; Supabase email/password login remains available for teacher
// actions that require an authenticated account (for example deleting a team).
export const TEACHER_QUICK_ACCESS_CODE = "box1234";
const QUICK_ACCESS_STORAGE_KEY = "parcel-lab-teacher-quick-access-v1";
const AUTO_BACKUP_STORAGE_KEY = "parcel-lab-teacher-auto-backup-v1";

type AuthState = "loading" | "signed_out" | "checking" | "authorized" | "denied";

const EVENT_LABELS: Record<string, string> = {
  run_started: "เริ่มภารกิจใหม่",
  run_resumed: "กลับมาทำภารกิจต่อ",
  stage_changed: "ไปยังขั้นถัดไป",
  route_event_tracked: "ติดตามเหตุการณ์ระหว่างขนส่ง",
  damage_finding_saved: "บันทึกร่องรอยและสาเหตุที่คาดว่าเกี่ยวข้อง",
  box_mission_goal_changed: "เลือกภารกิจของกล่องพัสดุ",
  study_focus_changed: "เลือกหัวข้อที่ต้องศึกษา",
  exit_ticket_saved: "บันทึกคำตอบนักเรียน",
  exit_ticket_answer_changed: "ตอบหรือแก้ไขคำตอบรายบุคคล",
  mission2_connection_changed: "เชื่อมโยงผลทดลองกับส่วนของกล่อง",
  mission2_individual_answer_changed: "ตอบคำถามรายบุคคลภารกิจที่ 2",
  mission2_individual_answer_saved: "บันทึกคำตอบรายบุคคลภารกิจที่ 2",
  lab_answer_changed: "เลือกคำตอบระหว่างทดลอง",
  big_question_progress_saved: "บันทึกข้อสรุปสะสมจากระบบ",
  exit_tickets_completed: "ตอบคำถามรายบุคคลครบแล้ว",
  compression_result_saved: "บันทึกผลความต้านทานแรงกดทับ",
  absorption_result_saved: "บันทึกผลการดูดซับน้ำของวัสดุ",
  elasticity_result_saved: "บันทึกผลการยืดและคืนรูป (ไม่ใช่ผลแรงกระแทก)",
  impact_result_saved: "บันทึกผลสังเกตสิ่งของหลังตกกระแทก",
  recap_answer_saved: "บันทึกคำตอบแบบทบทวน",
  material_prediction_changed: "เลือกวัสดุสำหรับกล่อง",
  run_completed: "ทำภารกิจสำเร็จ",
  legacy_run_imported: "นำเข้าประวัติจากเครื่องเดิม",
};

const DAMAGE_LABELS: Record<string, string> = {
  dent: "รอยยุบด้านบน",
  wet: "คราบเปียกน้ำ",
  torn: "รอยฉีกขาด",
  corner: "มุมกล่องบุบ",
  cup: "แก้วด้านในเสียหาย",
};

function friendlyError(error: unknown): string {
  if (error instanceof Error) {
    if (/invalid login/i.test(error.message)) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    return error.message;
  }
  return "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

function hasRememberedQuickAccess(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(QUICK_ACCESS_STORAGE_KEY) === TEACHER_QUICK_ACCESS_CODE; }
  catch { return false; }
}

function rememberQuickAccess(): void {
  try { window.localStorage.setItem(QUICK_ACCESS_STORAGE_KEY, TEACHER_QUICK_ACCESS_CODE); }
  catch { /* Safari private mode may deny localStorage; the current tab still works. */ }
}

function clearRememberedQuickAccess(): void {
  try { window.localStorage.removeItem(QUICK_ACCESS_STORAGE_KEY); }
  catch { /* Ignore storage failures while signing out. */ }
}

function backupFilename(prefix: string, extension: "json" | "csv"): string {
  const timestamp = new Date().toISOString().replace(/:/g, "-").replace(".000Z", "");
  return `${prefix}-${timestamp}.${extension}`;
}

function downloadFile(contents: string, type: string, filename: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function storeAutomaticBackup(teams: TeamOverview[]): string | null {
  const createdAt = new Date().toISOString();
  try {
    window.localStorage.setItem(AUTO_BACKUP_STORAGE_KEY, JSON.stringify({
      format: "parcel-lab-teacher-backup",
      version: 1,
      createdAt,
      source: "automatic-browser-snapshot",
      teams,
    }));
    return createdAt;
  } catch {
    return null;
  }
}

function readAutomaticBackupDate(): string | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AUTO_BACKUP_STORAGE_KEY) ?? "null") as { createdAt?: string } | null;
    return parsed?.createdAt ?? null;
  } catch {
    return null;
  }
}

export function TeacherDashboard() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [quickAccess, setQuickAccess] = useState(false);
  const [teams, setTeams] = useState<TeamOverview[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamOverview | null>(null);
  const [detail, setDetail] = useState<TeacherTeamDetail | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamOverview | null>(null);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("all");
  const [teamFilter, setTeamFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [missionFilter, setMissionFilter] = useState<DashboardMissionFilter>("all");
  const [exporting, setExporting] = useState<"csv" | "backup" | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

  const authorize = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    if (!nextSession) {
      const remembered = hasRememberedQuickAccess();
      setQuickAccess(remembered);
      setAuthState(remembered ? "authorized" : "signed_out");
      return;
    }
    setQuickAccess(false);
    const client = getSupabaseClient();
    if (!client) { setAuthState("signed_out"); return; }
    setAuthState("checking");
    const { data, error: profileError } = await client
      .from("teacher_profiles")
      .select("user_id")
      .eq("user_id", nextSession.user.id)
      .maybeSingle();
    if (profileError || !data) { setAuthState("denied"); return; }
    setAuthState("authorized");
  }, []);

  useEffect(() => {
    if (!configured) { setAuthState("signed_out"); return; }
    if (hasRememberedQuickAccess()) {
      setQuickAccess(true);
      setAuthState("authorized");
    }
    const client = getSupabaseClient();
    if (!client) return;
    void client.auth.getSession().then(({ data }) => authorize(data.session));
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => { void authorize(nextSession); });
    return () => data.subscription.unsubscribe();
  }, [authorize, configured]);

  useEffect(() => { setLastBackupAt(readAutomaticBackupDate()); }, []);

  const refresh = useCallback(async () => {
    if (authState !== "authorized") return;
    setLoadingData(true);
    setError("");
    try {
      const nextTeams = await listTeams();
      setTeams(nextTeams);
      const previousBackupAt = readAutomaticBackupDate();
      // A temporary empty response must not erase the last useful snapshot.
      setLastBackupAt(nextTeams.length > 0 || !previousBackupAt ? storeAutomaticBackup(nextTeams) : previousBackupAt);
      if (selectedTeam) {
        const refreshed = nextTeams.find((team) => team.id === selectedTeam.id) ?? null;
        setSelectedTeam(refreshed);
        if (refreshed) setDetail(await getTeacherTeamDetail(refreshed));
      }
    } catch (nextError) { setError(friendlyError(nextError)); }
    finally { setLoadingData(false); }
  }, [authState, selectedTeam]);

  useEffect(() => { void refresh(); }, [authState]);

  useEffect(() => {
    if (authState !== "authorized") return;
    const client = getSupabaseClient();
    if (!client) return;
    let timer: number | undefined;
    const scheduleRefresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), 300);
    };
    const channel = client.channel("teacher-learning-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "game_runs" }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "learning_events" }, scheduleRefresh)
      .subscribe();
    return () => { window.clearTimeout(timer); void client.removeChannel(channel); };
  }, [authState, refresh]);

  const filteredTeams = useMemo(() => teams.filter((team) => {
    const run = latestRunForMission(team, missionFilter);
    if (statusFilter === "active" && run?.status !== "in_progress") return false;
    if (statusFilter === "completed" && run?.status !== "completed") return false;
    if (teamFilter && !team.name.toLocaleLowerCase("th").includes(teamFilter.toLocaleLowerCase("th"))) return false;
    if (dateFilter) {
      const latest = run?.updatedAt ?? team.updatedAt;
      if (latest.slice(0, 10) !== dateFilter) return false;
    }
    return true;
  }), [dateFilter, missionFilter, statusFilter, teamFilter, teams]);

  const missionRuns = teams.reduce<TeamOverview["runs"]>((runs, team) => runs.concat(runsForMission(team, missionFilter)), []);
  const completedToday = missionRuns.filter((run) => run.completedAt && isToday(run.completedAt)).length;
  const sortedUpdates = missionRuns.map((run) => run.updatedAt).sort();
  const latestUpdate = sortedUpdates[sortedUpdates.length - 1];
  const attendanceTotals = teams.reduce((totals, team) => {
    const run = latestRunForMission(team, missionFilter);
    if (!run) return totals;
    attendanceForRun(team, run).forEach((member) => {
      if (member.present) totals.present += 1;
      else totals.absent += 1;
    });
    return totals;
  }, { present: 0, absent: 0 });

  const openDetail = async (team: TeamOverview) => {
    setSelectedTeam(team);
    setDetail(null);
    setLoadingData(true);
    setError("");
    try { setDetail(await getTeacherTeamDetail(team)); }
    catch (nextError) { setError(friendlyError(nextError)); }
    finally { setLoadingData(false); }
  };

  const exportCsv = () => {
    setExporting("csv");
    setError("");
    try {
      downloadFile(
        buildTeacherCsv(teams, missionFilter),
        "text/csv;charset=utf-8",
        backupFilename(`ข้อมูลนักเรียน-${missionFilterLabel(missionFilter).replace(/\s+/g, "-")}`, "csv"),
      );
    } catch (nextError) {
      setError(friendlyError(nextError));
    } finally {
      setExporting(null);
    }
  };

  const exportBackup = async (targetTeams: TeamOverview[] = teams) => {
    setExporting("backup");
    setError("");
    try {
      const details = await Promise.all(targetTeams.map(async (team) => {
        try { return await getTeacherTeamDetail(team); }
        catch { return { team, responses: [], events: [], note: "เก็บข้อมูลรอบและคำตอบจาก save_state ครบ แต่ดึงตารางเหตุการณ์เพิ่มเติมไม่ได้" }; }
      }));
      const createdAt = new Date().toISOString();
      downloadFile(JSON.stringify({
        format: "parcel-lab-teacher-backup",
        version: 1,
        createdAt,
        source: "manual-full-export",
        teams: details,
      }, null, 2), "application/json;charset=utf-8", backupFilename("สำรองข้อมูลกล่องแกร่ง", "json"));
      setLastBackupAt(createdAt);
    } catch (nextError) {
      setError(`สำรองข้อมูลไม่สำเร็จ จึงยังไม่ได้ดำเนินการต่อ: ${friendlyError(nextError)}`);
      throw nextError;
    } finally {
      setExporting(null);
    }
  };

  const confirmDeleteTeam = async () => {
    if (!deleteTarget || deletingTeamId) return;
    const teamId = deleteTarget.id;
    setDeletingTeamId(teamId);
    setError("");
    try {
      // A recoverable JSON copy is required before any destructive action.
      await exportBackup([deleteTarget]);
      await deleteTeam(teamId);
      setTeams((current) => current.filter((team) => team.id !== teamId));
      if (selectedTeam?.id === teamId) {
        setSelectedTeam(null);
        setDetail(null);
      }
      setDeleteTarget(null);
    } catch (nextError) {
      setError(friendlyError(nextError));
    } finally {
      setDeletingTeamId(null);
    }
  };

  if (!configured) return <TeacherSetupRequired />;
  if (authState === "loading" || authState === "checking") return <TeacherLoading />;
  if (authState === "signed_out") return <TeacherLogin onQuickAccess={() => { rememberQuickAccess(); setQuickAccess(true); setAuthState("authorized"); }} />;
  if (authState === "denied") return <TeacherDenied email={session?.user.email ?? ""} onSignOut={() => void getSupabaseClient()?.auth.signOut()} />;

  return <main className="teacher-dashboard-shell">
    <aside className="teacher-sidebar">
      <a className="teacher-brand" href={`${BASE_PATH}/`}><AppIcon name="box" /><div><b>กล่องแกร่ง</b><small>Teacher Dashboard</small></div></a>
      <nav><button className="active">⌂ ภาพรวมชั้นเรียน</button><button onClick={() => document.getElementById("teacher-team-list")?.scrollIntoView({ behavior: "smooth" })}>♟ ทีมทั้งหมด</button></nav>
      <div className="teacher-privacy-note"><b>ข้อมูลเปิดในหน้าเกม</b><span>โปรดใช้ชื่อเล่นของนักเรียนเท่านั้น</span></div>
      <div className="teacher-account"><span>{quickAccess ? "รหัสครูแบบเร็ว · โหมดดูข้อมูล" : session?.user.email}</span><button onClick={() => { if (quickAccess) { clearRememberedQuickAccess(); setQuickAccess(false); setAuthState("signed_out"); } else { void getSupabaseClient()?.auth.signOut(); } }}>ออกจากระบบ</button></div>
    </aside>
    <section className="teacher-main">
      <header className="teacher-topbar"><div><p>ภาพรวมการเรียนรู้</p><h1>สวัสดีคุณครู</h1><span>ติดตามการเข้าเรียน ความก้าวหน้า และคำตอบ แยกตามภารกิจ</span></div><div className="teacher-top-actions"><button className="teacher-refresh" onClick={() => void refresh()} disabled={loadingData}>{loadingData ? "กำลังอัปเดต…" : <><AppIcon name="refresh" /> อัปเดตข้อมูล</>}</button><button className="teacher-export-button" onClick={exportCsv} disabled={Boolean(exporting) || teams.length === 0}>{exporting === "csv" ? "กำลังส่งออก…" : "ส่งออก CSV / Excel"}</button><button className="teacher-backup-button" onClick={() => void exportBackup()} disabled={Boolean(exporting) || teams.length === 0}>{exporting === "backup" ? "กำลังสำรอง…" : "สำรองข้อมูลทั้งหมด"}</button></div></header>
      {error && <div className="teacher-error" role="alert">{error}</div>}
      <section className="teacher-mission-filter" aria-label="เลือกดูข้อมูลตามภารกิจ">
        <header><div><b>เลือกดูทีละภารกิจ</b><span>ข้อมูลด้านล่างจะเปลี่ยนตามภารกิจที่เลือก</span></div><small>{lastBackupAt ? `สำรองอัตโนมัติล่าสุด ${new Date(lastBackupAt).toLocaleString("th-TH")}` : "ยังไม่มีสำเนาในเครื่องนี้"}</small></header>
        <div><button className={missionFilter === "all" ? "active" : ""} onClick={() => setMissionFilter("all")}><b>ทั้งหมด</b><span>ภาพรวมทุกภารกิจ</span></button>{([1, 2, 3, 4, 5] as const).map((mission) => <button key={mission} className={missionFilter === mission ? "active" : ""} onClick={() => setMissionFilter(mission)}><b>ภารกิจ {mission}</b><span>{MISSION_LABELS[mission]}</span></button>)}</div>
      </section>
      <div className="teacher-kpi-grid">
        <article><i className="blue">♟</i><div><span>ทีมทั้งหมด</span><b>{teams.length}</b></div></article>
        <article><i className="orange"><AppIcon name="play" /></i><div><span>กำลังทำภารกิจ</span><b>{missionRuns.filter((run) => run.status === "in_progress").length}</b></div></article>
        <article><i className="green"><AppIcon name="check" /></i><div><span>สำเร็จวันนี้</span><b>{completedToday}</b></div></article>
        <article><i className="teal">✓</i><div><span>มาเรียน</span><b>{attendanceTotals.present}</b></div></article>
        <article><i className="red">–</i><div><span>ไม่มาเรียน</span><b>{attendanceTotals.absent}</b></div></article>
        <article><i className="pink">◷</i><div><span>อัปเดตล่าสุด</span><b className="kpi-time">{latestUpdate ? new Date(latestUpdate).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "-"}</b></div></article>
      </div>
      <section className="teacher-teams-section" id="teacher-team-list">
        <header><div><h2>{missionFilterLabel(missionFilter)}</h2><p>ข้อมูลจะอัปเดตอัตโนมัติระหว่างที่เด็กทำกิจกรรม</p></div><div className="teacher-filters"><input aria-label="ค้นหาทีม" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} placeholder="ค้นหาชื่อทีม" /><select aria-label="กรองสถานะ" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">ทุกสถานะ</option><option value="active">กำลังทำ</option><option value="completed">ทำเสร็จแล้ว</option></select><input aria-label="กรองวันที่" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></div></header>
        {loadingData && teams.length === 0 ? <div className="teacher-empty">กำลังโหลดข้อมูลชั้นเรียน…</div> : filteredTeams.length === 0 ? <div className="teacher-empty"><b>ไม่พบทีมตามตัวกรอง</b><span>ลองเปลี่ยนภารกิจ สถานะ ชื่อทีม หรือวันที่</span></div> : <div className="teacher-team-grid">{filteredTeams.map((team) => <TeacherTeamCard key={`${team.id}-${missionFilter}`} team={team} run={latestRunForMission(team, missionFilter)} missionFilter={missionFilter} canDelete={!quickAccess} onOpen={() => void openDetail(team)} onDelete={() => setDeleteTarget(team)} />)}</div>}
      </section>
    </section>
    {selectedTeam && <TeacherDetailPanel key={`${selectedTeam.id}-${missionFilter}`} team={selectedTeam} detail={detail} missionFilter={missionFilter} loading={loadingData} onClose={() => { setSelectedTeam(null); setDetail(null); }} />}
    {deleteTarget && <DeleteTeamDialog team={deleteTarget} busy={deletingTeamId === deleteTarget.id} onCancel={() => { if (!deletingTeamId) setDeleteTarget(null); }} onConfirm={() => void confirmDeleteTeam()} />}
  </main>;
}

function TeacherTeamCard({ team, run, missionFilter, canDelete, onOpen, onDelete }: { team: TeamOverview; run: TeamOverview["activeRun"]; missionFilter: DashboardMissionFilter; canDelete: boolean; onOpen: () => void; onDelete: () => void }) {
  const progress = run ? runProgress(run) : 0;
  const attendance = run ? attendanceForRun(team, run) : [];
  const presentCount = attendance.filter((member) => member.present).length;
  const missionRuns = runsForMission(team, missionFilter);
  return <article className="teacher-team-card">
    <header><div className="teacher-avatar-stack">{team.members.slice(0, 5).map((member) => <img key={member.id ?? member.name} src={`${BASE_PATH}/assets/profiles/${member.avatar}.png`} alt="" />)}</div><span className={run?.status === "in_progress" ? "active" : run ? "complete" : "not-started"}>{run?.status === "in_progress" ? "กำลังทำ" : run ? "ทำเสร็จแล้ว" : "ยังไม่เริ่ม"}</span></header>
    <h3>{team.name}</h3><p>{team.members.map((member) => member.name).join(" · ")}</p>
    {run && <div className="teacher-card-meta"><span>ภารกิจที่ {missionNumberForRun(run)}</span><span>มา {presentCount}/{attendance.length} คน</span></div>}
    <div className="teacher-progress-label"><span>{run ? STAGE_LABELS[run.currentStage] : "ยังไม่เริ่มภารกิจ"}</span><b>{progress}%</b></div><div className="teacher-progress"><i style={{ width: `${progress}%` }} /></div>
    <footer><div><span>ระยะเวลา</span><b>{run ? formatDuration(run.startedAt, run.completedAt) : "-"}</b></div><div><span>รอบในตัวกรองนี้</span><b>{missionRuns.length}</b></div><div className="teacher-card-actions"><button className="teacher-detail-button" onClick={onOpen}>ดูรายละเอียด →</button>{canDelete && <button className="teacher-delete-button" onClick={onDelete} aria-label={`ลบทีม ${team.name}`}>ลบทีม</button>}</div></footer>
  </article>;
}

function DeleteTeamDialog({ team, busy, onCancel, onConfirm }: { team: TeamOverview; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="teacher-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="teacher-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-team-title">
      <div className="teacher-confirm-icon">!</div>
      <h2 id="delete-team-title">ลบทีม “{team.name}” หรือไม่?</h2>
      <p>ระบบจะดาวน์โหลดไฟล์สำรองของทีมนี้ก่อน แล้วจึงลบสมาชิก ความคืบหน้า คำตอบ และประวัติภารกิจออกจากฐานข้อมูล</p>
      {team.activeRun && <strong>ทีมนี้กำลังทำภารกิจอยู่</strong>}
      <div><button className="teacher-cancel-delete" onClick={onCancel} disabled={busy}>ยกเลิก</button><button className="teacher-confirm-delete" onClick={onConfirm} disabled={busy}>{busy ? "กำลังลบ…" : "ลบทีมถาวร"}</button></div>
    </section>
  </div>;
}

function TeacherDetailPanel({ team, detail, missionFilter, loading, onClose }: { team: TeamOverview; detail: TeacherTeamDetail | null; missionFilter: DashboardMissionFilter; loading: boolean; onClose: () => void }) {
  const candidateRuns = runsForMission(team, missionFilter);
  const [runId, setRunId] = useState(candidateRuns[0]?.id ?? "");
  const run = candidateRuns.find((item) => item.id === runId) ?? candidateRuns[0];
  const events = detail?.events.filter((event) => event.runId === run?.id) ?? [];
  const attendance = run ? attendanceForRun(team, run) : [];
  const storedResponses = detail?.responses.filter((response) => response.runId === run?.id) ?? [];
  const missionTwoResponses = run && missionNumberForRun(run) === 2 ? attendance.flatMap((member, index) => {
    const tickets = run.saveState.mission2Assessments ?? {};
    const ticket = member.id ? tickets[`member-${member.id}`] : tickets[`student-${member.position ?? index}`] ?? tickets[member.name];
    if (!ticket) return [];
    return [{ id: `mission2-${run.id}-${member.id ?? index}`, runId: run.id, memberId: member.id ?? `student-${index}`, memberName: member.name, k: ticket.k, p: ticket.p, v: ticket.v, savedAt: run.updatedAt }];
  }) : [];
  const responses = missionTwoResponses.length ? missionTwoResponses : storedResponses;
  const presentCount = attendance.filter((member) => member.present).length;
  return <div className="teacher-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="teacher-detail-panel" aria-label={`รายละเอียด ${team.name}`}>
    <header><div><span>{missionFilterLabel(missionFilter)}</span><h2>{team.name}</h2><p>{team.members.map((member) => member.name).join(" · ")}</p></div><button aria-label="ปิด" onClick={onClose}><AppIcon name="x" /></button></header>
    {candidateRuns.length > 0 && <label className="teacher-run-picker">รอบภารกิจ<select value={runId} onChange={(event) => setRunId(event.target.value)}>{candidateRuns.map((item, index) => <option value={item.id} key={item.id}>ภารกิจที่ {missionNumberForRun(item)} · {item.status === "in_progress" ? "รอบปัจจุบัน" : `ประวัติรอบ ${candidateRuns.length - index}`} · {new Date(item.startedAt).toLocaleString("th-TH")}</option>)}</select></label>}
    {loading && !detail ? <div className="teacher-empty">กำลังโหลดรายละเอียด…</div> : run ? <div className="teacher-detail-content">
      <div className="teacher-detail-summary"><div><span>ภารกิจ</span><b>ภารกิจที่ {missionNumberForRun(run)}</b></div><div><span>สถานะ</span><b>{run.status === "in_progress" ? "กำลังทำ" : "สำเร็จแล้ว"}</b></div><div><span>ขั้นล่าสุด</span><b>{STAGE_LABELS[run.currentStage]}</b></div><div><span>เวลา</span><b>{formatDuration(run.startedAt, run.completedAt)}</b></div></div>
      <section className="teacher-attendance-section"><h3>การเข้าเรียนประจำภารกิจ <span>มา {presentCount}/{attendance.length} คน</span></h3><div className="teacher-attendance-list">{attendance.map((member, index) => <article className={member.present ? "present" : "absent"} key={member.id ?? `${member.name}-${index}`}><img src={`${BASE_PATH}/assets/profiles/${member.avatar}.png`} alt="" /><div><b>{(member.position ?? index) + 1}. {member.name}</b><span>{member.present ? "มาเรียน" : "ไม่มาเรียน"}</span></div></article>)}</div></section>
      <section><h3>คำตอบรายบุคคล</h3>{responses.length ? <div className="teacher-response-list">{responses.map((response) => <article key={response.id}><header><b>{response.memberName}</b><span>{new Date(response.savedAt).toLocaleString("th-TH")}</span></header><p><i>K</i>{response.k || "-"}</p><p><i>P</i>{response.p || "-"}</p><p><i>V</i>{response.v || "-"}</p></article>)}</div> : <div className="teacher-inline-empty">ยังไม่มีคำตอบรายบุคคล</div>}</section>
      <section><h3>คำตอบจากหน้าหมุนกล่อง 3 มิติ</h3><div className="teacher-chip-list">{Object.entries(run.saveState.inspectionFindings ?? {}).map(([damageId, cause]) => <span key={damageId}>{DAMAGE_LABELS[damageId] ?? damageId} → {cause}</span>)}{!Object.keys(run.saveState.inspectionFindings ?? {}).length && <em>ยังไม่ได้บันทึกคำตอบ</em>}</div></section>
      <section><h3>ภารกิจของกล่องที่ทีมเลือก</h3><div className="teacher-chip-list">{BOX_MISSION_GOALS.filter((goal) => run.saveState.boxMissionGoals?.[goal.id]).map((goal) => <span key={goal.id}>{goal.label}</span>)}{!Object.values(run.saveState.boxMissionGoals ?? {}).some(Boolean) && <em>ยังไม่ได้เลือก</em>}</div></section>
      <section><h3>สิ่งที่ทีมเลือกศึกษา</h3><div className="teacher-chip-list">{Object.entries(run.saveState.studyFocus ?? {}).filter(([, selected]) => selected).map(([key]) => <span key={key}>{studyTopicLabel(key)}</span>)}{!Object.values(run.saveState.studyFocus ?? {}).some(Boolean) && <em>ยังไม่ได้เลือก</em>}</div></section>
      {Object.keys(run.saveState.recapAnswers ?? {}).length > 0 && <section><h3>คำตอบร่วมกันหลังการทดลอง</h3><div className="teacher-recap-list">{Object.entries(run.saveState.recapAnswers).map(([questionIndex, choices]) => { const item = RECAP[Number(questionIndex)]; return <article key={questionIndex}><b>{item?.question ?? `คำถามที่ ${Number(questionIndex) + 1}`}</b><span>{choices.map((choice) => item?.choices[choice]?.label ?? `ตัวเลือก ${choice + 1}`).join(" → ")}</span></article>; })}</div></section>}
      <section><h3>กิจกรรมตามลำดับเวลา</h3>{events.length ? <ol className="teacher-timeline">{events.map((event) => <li key={event.id}><i /><div><b>{EVENT_LABELS[event.eventType] ?? event.eventType}</b><span>{STAGE_LABELS[event.stage] ?? event.stage}</span><small>{event.memberName ? `${event.memberName} · ` : ""}{new Date(event.occurredAt).toLocaleString("th-TH")}</small></div></li>)}</ol> : <div className="teacher-inline-empty">ยังไม่มีกิจกรรมที่บันทึกไว้</div>}</section>
    </div> : <div className="teacher-empty">ทีมนี้ยังไม่เคยเริ่มภารกิจ</div>}
  </aside></div>;
}

function TeacherLogin({ onQuickAccess }: { onQuickAccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [quickCode, setQuickCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [quickError, setQuickError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    const client = getSupabaseClient();
    if (!client) return;
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) setError(friendlyError(signInError));
    setBusy(false);
  };
  const submitQuick = (event: FormEvent) => {
    event.preventDefault();
    setQuickError(quickCode.trim().toLowerCase() === TEACHER_QUICK_ACCESS_CODE ? "" : "รหัสครูไม่ถูกต้อง");
    if (quickCode.trim().toLowerCase() !== TEACHER_QUICK_ACCESS_CODE) return;
    onQuickAccess();
  };
  return <main className="teacher-auth-page"><div className="teacher-auth-card"><a href={`${BASE_PATH}/`}>← กลับไปหน้าเกม</a><div className="teacher-auth-icon"><AppIcon name="box" /></div><p>ภารกิจกล่องแกร่ง</p><h1>Dashboard สำหรับครู</h1><span>ติดตามสิ่งที่เด็ก ๆ กำลังคิด ทดลอง และบันทึก</span><section className="teacher-quick-login"><h2>เข้าด้วยรหัสครูแบบเร็ว</h2><p>เหมาะสำหรับเครื่องประจำห้องเรียน ระบบจะจำสิทธิ์ไว้ในเครื่องนี้</p><form onSubmit={submitQuick}><label>รหัสครู<input type="password" inputMode="text" autoComplete="current-password" placeholder="เช่น box1234" required value={quickCode} onChange={(event) => setQuickCode(event.target.value)} /></label>{quickError && <div role="alert">{quickError}</div>}<button>เข้าสู่ Dashboard</button></form></section><details className="teacher-account-login"><summary>ใช้บัญชี Supabase แทน</summary><form onSubmit={submit}><label>อีเมล<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>รหัสผ่าน<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <div role="alert">{error}</div>}<button disabled={busy}>{busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ Dashboard"}</button></form></details></div></main>;
}

function TeacherDenied({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return <main className="teacher-auth-page"><div className="teacher-auth-card teacher-denied"><div className="teacher-auth-icon">!</div><h1>บัญชีนี้ยังไม่มีสิทธิ์ครู</h1><p>{email}</p><span>เพิ่ม User ID ของบัญชีนี้ในตาราง teacher_profiles แล้วลองใหม่</span><button onClick={onSignOut}>ออกจากระบบ</button></div></main>;
}

function TeacherSetupRequired() {
  return <main className="teacher-auth-page"><div className="teacher-auth-card teacher-denied"><div className="teacher-auth-icon"><AppIcon name="settings" /></div><h1>ยังไม่ได้เชื่อมฐานข้อมูล</h1><span>กำหนด NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ก่อนเปิด Dashboard</span><a href={`${BASE_PATH}/`}>กลับไปหน้าเกม</a></div></main>;
}

function TeacherLoading() {
  return <main className="teacher-auth-page"><div className="teacher-loader" /><p>กำลังเตรียม Dashboard…</p></main>;
}
