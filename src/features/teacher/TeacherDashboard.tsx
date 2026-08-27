"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { formatDuration, isToday, STAGE_LABELS, stageProgress } from "@/features/tracking/progress";
import { deleteTeam, getTeacherTeamDetail, listTeams } from "@/features/tracking/persistence";
import type { TeacherTeamDetail, TeamOverview } from "@/features/tracking/types";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type AuthState = "loading" | "signed_out" | "checking" | "authorized" | "denied";

const EVENT_LABELS: Record<string, string> = {
  run_started: "เริ่มภารกิจใหม่",
  run_resumed: "กลับมาทำภารกิจต่อ",
  stage_changed: "ไปยังขั้นถัดไป",
  route_event_tracked: "ติดตามเหตุการณ์ระหว่างขนส่ง",
  damage_finding_saved: "บันทึกร่องรอยและสาเหตุที่คาดว่าเกี่ยวข้อง",
  study_focus_changed: "เลือกหัวข้อที่ต้องศึกษา",
  exit_ticket_saved: "บันทึกคำตอบนักเรียน",
  exit_tickets_completed: "ตอบคำถามรายบุคคลครบแล้ว",
  compression_result_saved: "บันทึกผลทดสอบแรงกด",
  absorption_result_saved: "บันทึกผลทดสอบการดูดซับน้ำ",
  elasticity_result_saved: "บันทึกผลทดสอบความยืดหยุ่น",
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

export function TeacherDashboard() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [session, setSession] = useState<Session | null>(null);
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
  const configured = isSupabaseConfigured();

  const authorize = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    if (!nextSession) { setAuthState("signed_out"); return; }
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
    const client = getSupabaseClient();
    if (!client) return;
    void client.auth.getSession().then(({ data }) => authorize(data.session));
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => { void authorize(nextSession); });
    return () => data.subscription.unsubscribe();
  }, [authorize, configured]);

  const refresh = useCallback(async () => {
    if (authState !== "authorized") return;
    setLoadingData(true);
    setError("");
    try {
      const nextTeams = await listTeams();
      setTeams(nextTeams);
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
    if (statusFilter === "active" && !team.activeRun) return false;
    if (statusFilter === "completed" && (team.activeRun || team.completedRuns.length === 0)) return false;
    if (teamFilter && !team.name.toLocaleLowerCase("th").includes(teamFilter.toLocaleLowerCase("th"))) return false;
    if (dateFilter) {
      const latest = team.activeRun?.updatedAt ?? team.completedRuns[0]?.updatedAt ?? team.updatedAt;
      if (latest.slice(0, 10) !== dateFilter) return false;
    }
    return true;
  }), [dateFilter, statusFilter, teamFilter, teams]);

  const completedToday = teams.reduce((total, team) => total + team.completedRuns.filter((run) => run.completedAt && isToday(run.completedAt)).length, 0);
  const latestUpdate = teams.map((team) => team.updatedAt).sort().at(-1);

  const openDetail = async (team: TeamOverview) => {
    setSelectedTeam(team);
    setDetail(null);
    setLoadingData(true);
    setError("");
    try { setDetail(await getTeacherTeamDetail(team)); }
    catch (nextError) { setError(friendlyError(nextError)); }
    finally { setLoadingData(false); }
  };

  const confirmDeleteTeam = async () => {
    if (!deleteTarget || deletingTeamId) return;
    const teamId = deleteTarget.id;
    setDeletingTeamId(teamId);
    setError("");
    try {
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
  if (authState === "signed_out") return <TeacherLogin />;
  if (authState === "denied") return <TeacherDenied email={session?.user.email ?? ""} onSignOut={() => void getSupabaseClient()?.auth.signOut()} />;

  return <main className="teacher-dashboard-shell">
    <aside className="teacher-sidebar">
      <a className="teacher-brand" href={`${BASE_PATH}/`}><span>▣</span><div><b>กล่องแกร่ง</b><small>Teacher Dashboard</small></div></a>
      <nav><button className="active">⌂ ภาพรวมชั้นเรียน</button><button onClick={() => document.getElementById("teacher-team-list")?.scrollIntoView({ behavior: "smooth" })}>♟ ทีมทั้งหมด</button></nav>
      <div className="teacher-privacy-note"><b>ข้อมูลเปิดในหน้าเกม</b><span>โปรดใช้ชื่อเล่นของนักเรียนเท่านั้น</span></div>
      <div className="teacher-account"><span>{session?.user.email}</span><button onClick={() => void getSupabaseClient()?.auth.signOut()}>ออกจากระบบ</button></div>
    </aside>
    <section className="teacher-main">
      <header className="teacher-topbar"><div><p>ภาพรวมการเรียนรู้</p><h1>สวัสดีคุณครู 👋</h1><span>ติดตามสิ่งที่เด็ก ๆ กำลังคิด ทดลอง และบันทึก</span></div><button className="teacher-refresh" onClick={() => void refresh()} disabled={loadingData}>{loadingData ? "กำลังอัปเดต…" : "↻ อัปเดตข้อมูล"}</button></header>
      {error && <div className="teacher-error" role="alert">{error}</div>}
      <div className="teacher-kpi-grid">
        <article><i className="blue">♟</i><div><span>ทีมทั้งหมด</span><b>{teams.length}</b></div></article>
        <article><i className="orange">▶</i><div><span>กำลังทำภารกิจ</span><b>{teams.filter((team) => team.activeRun).length}</b></div></article>
        <article><i className="green">✓</i><div><span>สำเร็จวันนี้</span><b>{completedToday}</b></div></article>
        <article><i className="pink">◷</i><div><span>อัปเดตล่าสุด</span><b className="kpi-time">{latestUpdate ? new Date(latestUpdate).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "-"}</b></div></article>
      </div>
      <section className="teacher-teams-section" id="teacher-team-list">
        <header><div><h2>ความก้าวหน้าของแต่ละทีม</h2><p>ข้อมูลจะอัปเดตอัตโนมัติระหว่างที่เด็กทำกิจกรรม</p></div><div className="teacher-filters"><input aria-label="ค้นหาทีม" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} placeholder="ค้นหาชื่อทีม" /><select aria-label="กรองสถานะ" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">ทุกสถานะ</option><option value="active">กำลังทำ</option><option value="completed">ทำเสร็จแล้ว</option></select><input aria-label="กรองวันที่" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></div></header>
        {loadingData && teams.length === 0 ? <div className="teacher-empty">กำลังโหลดข้อมูลชั้นเรียน…</div> : filteredTeams.length === 0 ? <div className="teacher-empty"><b>ไม่พบทีมตามตัวกรอง</b><span>ลองเปลี่ยนสถานะ ชื่อทีม หรือวันที่</span></div> : <div className="teacher-team-grid">{filteredTeams.map((team) => <TeacherTeamCard key={team.id} team={team} onOpen={() => void openDetail(team)} onDelete={() => setDeleteTarget(team)} />)}</div>}
      </section>
    </section>
    {selectedTeam && <TeacherDetailPanel team={selectedTeam} detail={detail} loading={loadingData} onClose={() => { setSelectedTeam(null); setDetail(null); }} />}
    {deleteTarget && <DeleteTeamDialog team={deleteTarget} busy={deletingTeamId === deleteTarget.id} onCancel={() => { if (!deletingTeamId) setDeleteTarget(null); }} onConfirm={() => void confirmDeleteTeam()} />}
  </main>;
}

function TeacherTeamCard({ team, onOpen, onDelete }: { team: TeamOverview; onOpen: () => void; onDelete: () => void }) {
  const run = team.activeRun ?? team.completedRuns[0];
  const progress = run ? stageProgress(run.currentStage) : 0;
  return <article className="teacher-team-card">
    <header><div className="teacher-avatar-stack">{team.members.slice(0, 5).map((member) => <img key={member.id ?? member.name} src={`${BASE_PATH}/assets/profiles/${member.avatar}.png`} alt="" />)}</div><span className={team.activeRun ? "active" : "complete"}>{team.activeRun ? "กำลังทำ" : team.completedRuns.length ? "ทำเสร็จแล้ว" : "ยังไม่เริ่ม"}</span></header>
    <h3>{team.name}</h3><p>{team.members.map((member) => member.name).join(" · ")}</p>
    <div className="teacher-progress-label"><span>{run ? STAGE_LABELS[run.currentStage] : "ยังไม่เริ่มภารกิจ"}</span><b>{progress}%</b></div><div className="teacher-progress"><i style={{ width: `${progress}%` }} /></div>
    <footer><div><span>ระยะเวลา</span><b>{run ? formatDuration(run.startedAt, run.completedAt) : "-"}</b></div><div><span>รอบที่ผ่านมา</span><b>{team.completedRuns.length}</b></div><div className="teacher-card-actions"><button className="teacher-detail-button" onClick={onOpen}>ดูรายละเอียด →</button><button className="teacher-delete-button" onClick={onDelete} aria-label={`ลบทีม ${team.name}`}>ลบทีม</button></div></footer>
  </article>;
}

function DeleteTeamDialog({ team, busy, onCancel, onConfirm }: { team: TeamOverview; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="teacher-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="teacher-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-team-title">
      <div className="teacher-confirm-icon">!</div>
      <h2 id="delete-team-title">ลบทีม “{team.name}” หรือไม่?</h2>
      <p>สมาชิก ความคืบหน้า คำตอบ และประวัติภารกิจทั้งหมดของทีมนี้จะถูกลบถาวรและเรียกคืนไม่ได้</p>
      {team.activeRun && <strong>ทีมนี้กำลังทำภารกิจอยู่</strong>}
      <div><button className="teacher-cancel-delete" onClick={onCancel} disabled={busy}>ยกเลิก</button><button className="teacher-confirm-delete" onClick={onConfirm} disabled={busy}>{busy ? "กำลังลบ…" : "ลบทีมถาวร"}</button></div>
    </section>
  </div>;
}

function TeacherDetailPanel({ team, detail, loading, onClose }: { team: TeamOverview; detail: TeacherTeamDetail | null; loading: boolean; onClose: () => void }) {
  const [runId, setRunId] = useState(team.activeRun?.id ?? team.runs[0]?.id ?? "");
  const run = team.runs.find((item) => item.id === runId) ?? team.runs[0];
  const events = detail?.events.filter((event) => event.runId === run?.id) ?? [];
  const responses = detail?.responses.filter((response) => response.runId === run?.id) ?? [];
  return <div className="teacher-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="teacher-detail-panel" aria-label={`รายละเอียด ${team.name}`}>
    <header><div><span>รายละเอียดทีม</span><h2>{team.name}</h2><p>{team.members.map((member) => member.name).join(" · ")}</p></div><button aria-label="ปิด" onClick={onClose}>×</button></header>
    <label className="teacher-run-picker">รอบภารกิจ<select value={runId} onChange={(event) => setRunId(event.target.value)}>{team.runs.map((item, index) => <option value={item.id} key={item.id}>{item.status === "in_progress" ? "รอบปัจจุบัน" : `ประวัติรอบ ${team.runs.length - index}`} · {new Date(item.startedAt).toLocaleString("th-TH")}</option>)}</select></label>
    {loading && !detail ? <div className="teacher-empty">กำลังโหลดรายละเอียด…</div> : run ? <div className="teacher-detail-content">
      <div className="teacher-detail-summary"><div><span>สถานะ</span><b>{run.status === "in_progress" ? "กำลังทำ" : "สำเร็จแล้ว"}</b></div><div><span>ขั้นล่าสุด</span><b>{STAGE_LABELS[run.currentStage]}</b></div><div><span>เวลา</span><b>{formatDuration(run.startedAt, run.completedAt)}</b></div></div>
      <section><h3>คำตอบรายบุคคล</h3>{responses.length ? <div className="teacher-response-list">{responses.map((response) => <article key={response.id}><header><b>{response.memberName}</b><span>{new Date(response.savedAt).toLocaleString("th-TH")}</span></header><p><i>K</i>{response.k || "-"}</p><p><i>P</i>{response.p || "-"}</p><p><i>V</i>{response.v || "-"}</p></article>)}</div> : <div className="teacher-inline-empty">ยังไม่มีคำตอบรายบุคคล</div>}</section>
      <section><h3>ร่องรอยและสาเหตุที่ทีมคาดว่าเกี่ยวข้อง</h3><div className="teacher-chip-list">{Object.entries(run.saveState.inspectionFindings ?? {}).map(([damageId, cause]) => <span key={damageId}>{DAMAGE_LABELS[damageId] ?? damageId} → {cause}</span>)}{!Object.keys(run.saveState.inspectionFindings ?? {}).length && <em>ยังไม่ได้บันทึกร่องรอย</em>}</div></section>
      <section><h3>สิ่งที่ทีมเลือกศึกษา</h3><div className="teacher-chip-list">{Object.entries(run.saveState.studyFocus ?? {}).filter(([, selected]) => selected).map(([key]) => <span key={key}>{key}</span>)}{!Object.values(run.saveState.studyFocus ?? {}).some(Boolean) && <em>ยังไม่ได้เลือก</em>}</div></section>
      <section><h3>กิจกรรมตามลำดับเวลา</h3>{events.length ? <ol className="teacher-timeline">{events.map((event) => <li key={event.id}><i /><div><b>{EVENT_LABELS[event.eventType] ?? event.eventType}</b><span>{STAGE_LABELS[event.stage] ?? event.stage}</span><small>{event.memberName ? `${event.memberName} · ` : ""}{new Date(event.occurredAt).toLocaleString("th-TH")}</small></div></li>)}</ol> : <div className="teacher-inline-empty">ยังไม่มีกิจกรรมที่บันทึกไว้</div>}</section>
    </div> : <div className="teacher-empty">ทีมนี้ยังไม่เคยเริ่มภารกิจ</div>}
  </aside></div>;
}

function TeacherLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    const client = getSupabaseClient();
    if (!client) return;
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) setError(friendlyError(signInError));
    setBusy(false);
  };
  return <main className="teacher-auth-page"><div className="teacher-auth-card"><a href={`${BASE_PATH}/`}>← กลับไปหน้าเกม</a><div className="teacher-auth-icon">▣</div><p>ภารกิจกล่องแกร่ง</p><h1>Dashboard สำหรับครู</h1><span>เข้าสู่ระบบเพื่อติดตามการเรียนรู้ของเด็ก ๆ</span><form onSubmit={submit}><label>อีเมล<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>รหัสผ่าน<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <div role="alert">{error}</div>}<button disabled={busy}>{busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ Dashboard"}</button></form></div></main>;
}

function TeacherDenied({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return <main className="teacher-auth-page"><div className="teacher-auth-card teacher-denied"><div className="teacher-auth-icon">!</div><h1>บัญชีนี้ยังไม่มีสิทธิ์ครู</h1><p>{email}</p><span>เพิ่ม User ID ของบัญชีนี้ในตาราง teacher_profiles แล้วลองใหม่</span><button onClick={onSignOut}>ออกจากระบบ</button></div></main>;
}

function TeacherSetupRequired() {
  return <main className="teacher-auth-page"><div className="teacher-auth-card teacher-denied"><div className="teacher-auth-icon">⚙</div><h1>ยังไม่ได้เชื่อมฐานข้อมูล</h1><span>กำหนด NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ก่อนเปิด Dashboard</span><a href={`${BASE_PATH}/`}>กลับไปหน้าเกม</a></div></main>;
}

function TeacherLoading() {
  return <main className="teacher-auth-page"><div className="teacher-loader" /><p>กำลังเตรียม Dashboard…</p></main>;
}
