"use client";

import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import {
  AVATARS, BOX_PARTS, COMPRESSION_FRAME_KEYS, DAMAGE_CAUSES, DAMAGES, EMPTY_SAVE, MATERIALS, RECAP, STORY,
  type CompressionFrameKey, type CompressionResult, type DamageCause, type ElasticityResult, type ExitTicket, type GameSave, type Stage, type TeamMember, type WaterAbsorptionResult,
} from "./data";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { hasLegacyData, markLegacyImported, markSupabaseCacheBound, readLegacyBundle, wasLegacyImported } from "@/features/tracking/legacy";
import {
  createTeam,
  flushOutbox,
  importLegacyBundle,
  listTeams,
  RevisionConflictError,
  saveCheckpoint,
  startOrResumeRun,
} from "@/features/tracking/persistence";
import { STAGE_LABELS, stageProgress } from "@/features/tracking/progress";
import type { ActiveRunRef, LearningEventInput, LegacyBundle, SaveIndicator, TeamOverview } from "@/features/tracking/types";
import { validateTeamDraft } from "@/features/tracking/validation";

const SAVE_KEY = "parcel-lab-web-save-v1";
const STATS_KEY = "parcel-lab-group-design-statistics-v1";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const LAB_ROOMS_ENABLED = false;
const PREDICTION_ENABLED = false;
const DISABLED_LAB_STAGES = new Set<Stage>(["testHub", "compression", "absorption", "elasticity", "recap"]);

function createRunId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function asset(path: string) {
  return `${BASE_PATH}/assets/${path}`;
}

function resumableStage(stage: Stage): Stage {
  return stage === "menu" || stage === "team" ? "mission" : stage;
}

function userFacingError(error: unknown, fallback: string) {
  const clean = (value: string) => value.split("\n")[0].trim().slice(0, 220);
  if (error instanceof Error && error.message) {
    if (/failed to fetch/i.test(error.message)) return "เชื่อมต่อ Supabase ไม่สำเร็จ กรุณาตรวจการเชื่อมต่ออินเทอร์เน็ตหรือ DNS";
    return clean(error.message);
  }
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === "string" ? clean(record.message) : "";
    if (/failed to fetch/i.test(message)) return "เชื่อมต่อ Supabase ไม่สำเร็จ กรุณาตรวจการเชื่อมต่ออินเทอร์เน็ตหรือ DNS";
    const details = typeof record.details === "string" ? clean(record.details) : "";
    const hint = typeof record.hint === "string" ? clean(record.hint) : "";
    const code = typeof record.code === "string" ? record.code : "";
    const parts = [message, details, hint].filter(Boolean);
    if (parts.length) return `${parts.join(" · ")}${code ? ` (${code})` : ""}`;
  }
  return fallback;
}

function playSound(name: string, enabled: boolean) {
  if (!enabled) return;
  const audio = new Audio(asset(`audio/${name}`));
  audio.volume = 0.55;
  void audio.play().catch(() => undefined);
}

export function GameApp() {
  const [save, setSave] = useState<GameSave>(EMPTY_SAVE);
  const [loaded, setLoaded] = useState(false);
  const [activeRun, setActiveRun] = useState<ActiveRunRef | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<TeamOverview | null>(null);
  const [saveIndicator, setSaveIndicator] = useState<SaveIndicator>("idle");
  const [legacyBundle, setLegacyBundle] = useState<LegacyBundle>({ save: null, statistics: [] });
  const bgmRef = useRef<HTMLAudioElement>(null);
  const pendingEventsRef = useRef<LearningEventInput[]>([]);
  const lastPersistedJsonRef = useRef("");
  const configured = isSupabaseConfigured();

  useEffect(() => {
    const legacy = readLegacyBundle();
    setLegacyBundle(legacy);
    const raw = localStorage.getItem(SAVE_KEY);
    if (!configured && raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<GameSave>;
        const savedStage = (parsed as { stage?: string }).stage;
        const restoredStage = savedStage === "design" ? "exitTicket" : (savedStage as Stage | undefined) ?? EMPTY_SAVE.stage;
        setSave({
          ...EMPTY_SAVE,
          ...parsed,
          stage: !PREDICTION_ENABLED && restoredStage === "prediction" ? "summary" : restoredStage,
          studyFocus: parsed.studyFocus ?? { compression: true, water: true, elasticity: true },
        });
      } catch { /* keep fresh save */ }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }, [loaded, save]);

  useEffect(() => {
    if (!loaded || !configured || !activeRun) return;
    const serialized = JSON.stringify(save);
    if (serialized === lastPersistedJsonRef.current) return;
    const timer = window.setTimeout(async () => {
      const events = pendingEventsRef.current.splice(0);
      setSaveIndicator("saving");
      try {
        const persisted = await saveCheckpoint(activeRun, save, events, save.stage === "summary");
        lastPersistedJsonRef.current = JSON.stringify(persisted.saveState);
        setActiveRun({ id: persisted.id, teamId: persisted.teamId, revision: persisted.revision });
        setSaveIndicator("saved");
      } catch (error) {
        if (error instanceof RevisionConflictError) {
          lastPersistedJsonRef.current = JSON.stringify(error.serverRun.saveState);
          setSave(error.serverRun.saveState);
          setActiveRun({ id: error.serverRun.id, teamId: error.serverRun.teamId, revision: error.serverRun.revision });
          setSaveIndicator("conflict");
        } else {
          pendingEventsRef.current.unshift(...events);
          setSaveIndicator("offline");
        }
      }
    }, save.stage === "summary" ? 50 : 800);
    return () => window.clearTimeout(timer);
  }, [activeRun, configured, loaded, save]);

  useEffect(() => {
    if (!configured) return;
    const onOnline = async () => {
      const persisted = await flushOutbox();
      if (!persisted) return;
      lastPersistedJsonRef.current = JSON.stringify(persisted.saveState);
      setActiveRun({ id: persisted.id, teamId: persisted.teamId, revision: persisted.revision });
      setSaveIndicator("saved");
    };
    window.addEventListener("online", onOnline);
    void onOnline();
    return () => window.removeEventListener("online", onOnline);
  }, [configured]);

  const patch = (next: Partial<GameSave>) => setSave((current) => {
    if (next.stage && next.stage !== current.stage && activeRun) {
      pendingEventsRef.current.push({ eventType: "stage_changed", stage: next.stage, payload: { from: current.stage, to: next.stage } });
    }
    if (next.studyFocus && next.studyFocus !== current.studyFocus) {
      pendingEventsRef.current.push({ eventType: "study_focus_changed", stage: next.stage ?? current.stage, payload: { selected: Object.keys(next.studyFocus).filter((key) => next.studyFocus?.[key]) } });
    }
    if (next.inspectionFindings && next.inspectionFindings !== current.inspectionFindings) {
      const latest = Object.entries(next.inspectionFindings).find(([damageId, cause]) => current.inspectionFindings[damageId] !== cause);
      if (latest) pendingEventsRef.current.push({ eventType: "damage_finding_saved", stage: "inspection", payload: { damageId: latest[0], cause: latest[1] } });
    }
    if (next.routeEvents && next.routeEvents !== current.routeEvents) {
      pendingEventsRef.current.push({ eventType: "route_event_tracked", stage: "mission", payload: { selected: Object.keys(next.routeEvents).filter((key) => next.routeEvents?.[key]) } });
    }
    if (next.compressionResults && next.compressionResults !== current.compressionResults) {
      pendingEventsRef.current.push({ eventType: "compression_result_saved", stage: next.stage ?? current.stage, payload: { materials: Object.keys(next.compressionResults) } });
    }
    if (next.absorptionResults && next.absorptionResults !== current.absorptionResults) {
      pendingEventsRef.current.push({ eventType: "absorption_result_saved", stage: next.stage ?? current.stage, payload: { materials: Object.keys(next.absorptionResults) } });
    }
    if (next.elasticityResults && next.elasticityResults !== current.elasticityResults) {
      pendingEventsRef.current.push({ eventType: "elasticity_result_saved", stage: next.stage ?? current.stage, payload: { materials: Object.keys(next.elasticityResults) } });
    }
    if (next.predictions && next.predictions !== current.predictions) {
      pendingEventsRef.current.push({ eventType: "material_prediction_changed", stage: next.stage ?? current.stage, payload: { selected: next.predictions } });
    }
    return { ...current, ...next };
  });
  const go = (stage: Stage) => patch({ stage });
  const toggleAudio = () => {
    const nextAudio = !save.audio;
    patch({ audio: nextAudio });
    if (nextAudio) void bgmRef.current?.play().catch(() => undefined);
  };
  const reset = () => {
    if (!configured) localStorage.removeItem(SAVE_KEY);
    setActiveRun(null);
    setSelectedTeam(null);
    lastPersistedJsonRef.current = "";
    setSave(EMPTY_SAVE);
  };
  const leaveRunToTeams = () => {
    setActiveRun(null);
    setSelectedTeam(null);
    lastPersistedJsonRef.current = "";
    setSave((current) => ({ ...current, stage: "team" }));
  };
  const openTeam = async (team: TeamOverview) => {
    const run = await startOrResumeRun(team);
    const serverState = { ...EMPTY_SAVE, ...run.saveState, team: team.members, stage: run.currentStage };
    const restored = { ...serverState, stage: resumableStage(run.currentStage) };
    setSelectedTeam(team);
    setActiveRun({ id: run.id, teamId: run.teamId, revision: run.revision });
    lastPersistedJsonRef.current = JSON.stringify(serverState);
    markSupabaseCacheBound();
    setSave(restored);
    setSaveIndicator("saved");
  };
  const createAndOpenTeam = async (name: string, members: TeamMember[]) => {
    const team = await createTeam(name, members);
    await openTeam(team);
  };
  const importAndOpenTeam = async (name: string) => {
    const team = await importLegacyBundle(name, legacyBundle);
    markLegacyImported();
    setLegacyBundle({ save: null, statistics: [] });
    await openTeam(team);
  };
  const startNewAttempt = async () => {
    if (!configured || !selectedTeam) {
      patch({ stage: "mission", runId: createRunId(), missionStudent: "", routeEvents: {}, inspectionFindings: {}, studyFocus: {}, exitTickets: {}, storyIndex: 0, inspectionIndex: 0, compressionIndex: 0, absorptionIndex: 0, elasticityIndex: 0, recapIndex: 0 });
      return;
    }
    const refreshed = (await listTeams()).find((team) => team.id === selectedTeam.id) ?? selectedTeam;
    await openTeam(refreshed);
  };
  const goBack = () => {
    if (labRoomsPaused) { go("exitTicket"); return; }
    if (save.stage === "team") { go("menu"); return; }
    if (save.stage === "mission") { leaveRunToTeams(); return; }
    if (save.stage === "story") {
      if (save.storyIndex > 0) patch({ storyIndex: save.storyIndex - 1 });
      else go("mission");
      return;
    }
    if (save.stage === "inspection") {
      if (save.inspectionIndex > 0) patch({ inspectionIndex: save.inspectionIndex - 1 });
      else patch({ stage: "story", storyIndex: STORY.length - 1 });
      return;
    }
    if (save.stage === "materials") { patch({ stage: "inspection", inspectionIndex: DAMAGES.length - 1 }); return; }
    if (save.stage === "studyFocus") { go("materials"); return; }
    if (save.stage === "exitTicket") { go("studyFocus"); return; }
    if (save.stage === "testHub") { go("exitTicket"); return; }
    if (save.stage === "compression") { go("testHub"); return; }
    if (save.stage === "absorption") { go("compression"); return; }
    if (save.stage === "elasticity") { go("absorption"); return; }
    if (save.stage === "recap") { go("elasticity"); return; }
    if (save.stage === "prediction") { go(LAB_ROOMS_ENABLED ? "recap" : "exitTicket"); return; }
    if (save.stage === "summary") { go(PREDICTION_ENABLED ? "prediction" : "exitTicket"); }
  };
  const saveExitTickets = (exitTickets: Record<string, ExitTicket>) => {
    const runId = save.runId || createRunId();
    try {
      const raw = localStorage.getItem(STATS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const records = Array.isArray(parsed) ? parsed : [];
      if (!records.some((record) => typeof record === "object" && record !== null && "runId" in record && record.runId === runId)) {
        records.push({ runId, submittedAt: new Date().toISOString(), members: save.team.map((member) => member.name), studyFocus: save.studyFocus, exitTickets });
        localStorage.setItem(STATS_KEY, JSON.stringify(records));
      }
    } catch { /* keep the game playable if browser storage is unavailable */ }
    pendingEventsRef.current.push({ eventType: "exit_tickets_completed", stage: "exitTicket", payload: { completed: save.team.length } });
    patch({ runId, exitTickets, stage: LAB_ROOMS_ENABLED ? "testHub" : PREDICTION_ENABLED ? "prediction" : "summary" });
  };
  const saveExitTicketDraft = (exitTickets: Record<string, ExitTicket>) => {
    const completed = Object.values(exitTickets).filter(isStructuredExitTicketComplete).length;
    pendingEventsRef.current.push({ eventType: "exit_ticket_saved", stage: "exitTicket", payload: { completed } });
    patch({ runId: save.runId || createRunId(), exitTickets });
  };
  const labRoomsPaused = !LAB_ROOMS_ENABLED && DISABLED_LAB_STAGES.has(save.stage);

  if (!loaded) return <main className="loading-screen">กำลังเตรียมห้องทดลอง…</main>;

  return (
    <main className="app-shell">
      <audio ref={bgmRef} className="game-bgm" src={asset("audio/happy_clappy_loop.ogg")} autoPlay loop muted={!save.audio} />
      <section className="game-frame" aria-live="polite">
        {save.stage === "menu" && <MainMenu onStart={() => go("team")} />}
        {labRoomsPaused && <LabRoomsPaused onContinue={() => go(PREDICTION_ENABLED ? "prediction" : "summary")} />}
        {!labRoomsPaused && save.stage === "team" && <TeamSetup initial={save.team} legacyBundle={legacyBundle} legacyAlreadyImported={wasLegacyImported()} onBack={() => go("menu")} onChoose={openTeam} onCreate={createAndOpenTeam} onImport={importAndOpenTeam} onLocalDone={(team) => patch({ team, runId: createRunId(), missionStudent: "", routeEvents: {}, inspectionFindings: {}, studyFocus: {}, exitTickets: {}, compressionResults: {}, absorptionResults: {}, elasticityResults: {}, stage: "mission", storyIndex: 0, inspectionIndex: 0 })} />}
        {!labRoomsPaused && save.stage === "mission" && <MissionRoute onBack={reset} onDone={() => go("story")} />}
        {!labRoomsPaused && save.stage === "story" && <ComicStory index={save.storyIndex} audio={save.audio} onIndex={(storyIndex) => patch({ storyIndex })} onDone={() => go("inspection")} />}
        {!labRoomsPaused && save.stage === "inspection" && <DamageInspection index={save.inspectionIndex} findings={save.inspectionFindings} audio={save.audio} onFinding={(inspectionFindings) => patch({ inspectionFindings })} onIndex={(inspectionIndex) => patch({ inspectionIndex })} onDone={() => go("materials")} />}
        {!labRoomsPaused && save.stage === "materials" && <MaterialGuide onBack={() => patch({ stage: "inspection", inspectionIndex: DAMAGES.length - 1 })} onDone={() => go("studyFocus")} />}
        {!labRoomsPaused && save.stage === "studyFocus" && <StudyFocusScreen values={save.studyFocus} onBack={() => go("materials")} onChange={(studyFocus) => patch({ studyFocus })} onDone={() => go("exitTicket")} />}
        {!labRoomsPaused && save.stage === "exitTicket" && <ExitTicketScreen team={save.team} initial={save.exitTickets} onBack={() => go("studyFocus")} onSaveDraft={saveExitTicketDraft} onDone={saveExitTickets} />}
        {!labRoomsPaused && save.stage === "testHub" && <TestHub onStart={() => go("compression")} />}
        {!labRoomsPaused && save.stage === "compression" && <CompressionLab save={save} onSave={(compressionResults, compressionIndex) => patch({ compressionResults, compressionIndex })} onDone={() => go("absorption")} />}
        {!labRoomsPaused && save.stage === "absorption" && <AbsorptionLab save={save} onSave={(absorptionResults, absorptionIndex) => patch({ absorptionResults, absorptionIndex })} onDone={() => go("elasticity")} />}
        {!labRoomsPaused && save.stage === "elasticity" && <ElasticityLab save={save} onSave={(elasticityResults, elasticityIndex) => patch({ elasticityResults, elasticityIndex })} onDone={() => go("recap")} />}
        {!labRoomsPaused && save.stage === "recap" && <Recap index={save.recapIndex} onIndex={(recapIndex) => patch({ recapIndex })} onDone={() => go(PREDICTION_ENABLED ? "prediction" : "summary")} />}
        {!labRoomsPaused && PREDICTION_ENABLED && save.stage === "prediction" && <Prediction labsEnabled={LAB_ROOMS_ENABLED} values={save.predictions} compressionResults={save.compressionResults} absorptionResults={save.absorptionResults} elasticityResults={save.elasticityResults} onChange={(predictions) => patch({ predictions })} onDone={() => go("summary")} />}
        {!labRoomsPaused && save.stage === "summary" && <Summary save={save} onReplay={() => void startNewAttempt()} onReset={reset} />}
        {(save.stage === "story" || save.stage === "inspection") && <button className="back-nav-button" onClick={(event) => { event.stopPropagation(); goBack(); }}>‹ ย้อนกลับ</button>}
        <button className="global-audio-button" aria-label={save.audio ? "ปิดเสียงเพลง" : "เปิดเสียงเพลง"} aria-pressed={save.audio} onClick={(event) => { event.stopPropagation(); toggleAudio(); }}>{save.audio ? "🔊" : "🔇"}</button>
        {configured && activeRun && <SaveStatusBadge status={saveIndicator} />}
      </section>
    </main>
  );
}

function MainMenu({ onStart }: { onStart: () => void }) {
  return (
    <div className="screen menu-screen">
      <img className="menu-cover" src={asset("menu/cover.png")} alt="เด็ก ๆ กำลังออกแบบกล่องในห้องประดิษฐ์" />
      <div className="menu-glass">
        <p className="menu-kicker">ภารกิจนักออกแบบ</p>
        <h1>กล่องแกร่ง</h1>
        <p>คิด · ทดลอง · สร้างให้แกร่ง!</p>
        <button className="button button-orange menu-play" onClick={onStart}><span>▶</span> เริ่มภารกิจ</button>
        <a className="teacher-entry-link" href={`${BASE_PATH}/teacher/`}>▣ Dashboard สำหรับครู</a>
      </div>
    </div>
  );
}

function TeamSetup({
  initial,
  legacyBundle,
  legacyAlreadyImported,
  onBack,
  onChoose,
  onCreate,
  onImport,
  onLocalDone,
}: {
  initial: TeamMember[];
  legacyBundle: LegacyBundle;
  legacyAlreadyImported: boolean;
  onBack: () => void;
  onChoose: (team: TeamOverview) => Promise<void>;
  onCreate: (name: string, team: TeamMember[]) => Promise<void>;
  onImport: (name: string) => Promise<void>;
  onLocalDone: (team: TeamMember[]) => void;
}) {
  const seed = initial.length >= 6 ? initial : Array.from({ length: 6 }, (_, index) => ({ name: "", avatar: AVATARS[index] }));
  const [members, setMembers] = useState<TeamMember[]>(seed);
  const [teamName, setTeamName] = useState("");
  const [legacyTeamName, setLegacyTeamName] = useState("");
  const [mode, setMode] = useState<"existing" | "create">(isSupabaseConfigured() ? "existing" : "create");
  const [teams, setTeams] = useState<TeamOverview[]>([]);
  const [historyTeam, setHistoryTeam] = useState<TeamOverview | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const configured = isSupabaseConfigured();
  const validation = validateTeamDraft(teamName, members, configured);
  const valid = validation.valid;
  const update = (index: number, next: Partial<TeamMember>) => setMembers((current) => current.map((m, i) => i === index ? { ...m, ...next } : m));
  const refresh = async () => {
    if (!configured) return;
    setLoading(true);
    setError("");
    try { setTeams(await listTeams()); }
    catch (nextError) { setError(userFacingError(nextError, "โหลดรายชื่อทีมไม่สำเร็จ")); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await action(); }
    catch (nextError) { setError(userFacingError(nextError, "ทำรายการไม่สำเร็จ")); }
    finally { setBusy(false); }
  };

  if (historyTeam) return <TeamHistory team={historyTeam} onBack={() => setHistoryTeam(null)} />;
  return (
    <div className={`screen team-screen${configured && mode === "create" ? " team-create-screen" : ""}`}>
      <img className="soft-bg" src={asset("menu/cover.png")} alt="" />
      <header className="team-header">
        <button className="button button-yellow compact" onClick={onBack}>กลับหน้าปก</button>
        <div><h1>เลือกทีมออกแบบกล่อง</h1><p>ทำภารกิจต่อจากเดิม หรือสร้างทีมใหม่ด้วยชื่อเล่นเท่านั้น</p></div>
        <div className="count-badge">{configured ? `${teams.length} ทีม` : "Local"}</div>
      </header>
      {configured && <nav className="team-mode-tabs" aria-label="เลือกวิธีจัดทีม">
        <button className={mode === "existing" ? "active" : ""} onClick={() => setMode("existing")}>ทีมเดิม</button>
        <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>＋ สร้างทีมใหม่</button>
      </nav>}
      {!configured && <div className="supabase-setup-note">ยังไม่ได้เชื่อม Supabase — เล่นและบันทึกในเครื่องนี้ได้ชั่วคราว</div>}
      {error && <div className="team-error" role="alert">{error}</div>}

      {configured && mode === "existing" ? <section className="existing-team-panel">
        {!legacyAlreadyImported && hasLegacyData(legacyBundle) && <article className="legacy-import-card">
          <div><b>พบข้อมูลการเล่นเดิมในเครื่องนี้</b><span>ตั้งชื่อทีมเพื่อนำความคืบหน้าและประวัติเข้าฐานข้อมูล</span></div>
          <input value={legacyTeamName} maxLength={60} onChange={(event) => setLegacyTeamName(event.target.value)} placeholder="ชื่อทีมสำหรับข้อมูลเดิม" />
          <button disabled={busy || !legacyTeamName.trim()} onClick={() => void runAction(() => onImport(legacyTeamName.trim()))}>นำเข้าข้อมูลเดิม</button>
        </article>}
        {loading ? <div className="team-list-state">กำลังโหลดรายชื่อทีม…</div> : teams.length === 0 ? <div className="team-list-state"><b>ยังไม่มีทีม</b><span>สร้างทีมแรกเพื่อเริ่มภารกิจ</span><button onClick={() => setMode("create")}>สร้างทีมใหม่</button></div> : <div className="existing-team-grid">
          {teams.map((team) => {
            const active = team.activeRun;
            const run = active ?? team.completedRuns[0];
            return <article className="existing-team-card" key={team.id}>
              <header><div className="team-avatar-stack">{team.members.slice(0, 4).map((member) => <img key={member.id ?? member.name} src={asset(`profiles/${member.avatar}.png`)} alt="" />)}</div><span className={active ? "status-active" : "status-ready"}>{active ? "กำลังทำ" : "พร้อมเริ่ม"}</span></header>
              <h2>{team.name}</h2>
              <p>{team.members.map((member) => member.name).join(" · ")}</p>
              <div className="team-card-progress"><i style={{ width: `${run ? stageProgress(run.currentStage) : 0}%` }} /></div>
              <small>{run ? `${STAGE_LABELS[run.currentStage]} · อัปเดต ${new Date(run.updatedAt).toLocaleString("th-TH")}` : "ยังไม่เคยทำภารกิจ"}</small>
              <footer>
                <button className="history-button" disabled={!team.completedRuns.length} onClick={() => setHistoryTeam(team)}>ดูประวัติ ({team.completedRuns.length})</button>
                <button className="resume-button" disabled={busy} onClick={() => void runAction(() => onChoose(team))}>{active ? "▶ ทำภารกิจต่อ" : "เริ่มภารกิจใหม่"}</button>
              </footer>
            </article>;
          })}
        </div>}
      </section> : <>
        <label className="team-name-field"><span>ชื่อทีม</span><input maxLength={60} value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="เช่น ทีมสายฟ้า" /></label>
        <div className="member-grid">
          {members.map((member, index) => (
            <article className="member-card" key={index}>
              <label className="avatar-picker">
                <img src={asset(`profiles/${member.avatar}.png`)} alt="ตัวละครที่เลือก" />
                <select aria-label={`ตัวละครสมาชิก ${index + 1}`} value={member.avatar} onChange={(event) => update(index, { avatar: event.target.value })}>
                  {AVATARS.map((avatar) => <option key={avatar} disabled={members.some((m, i) => i !== index && m.avatar === avatar)} value={avatar}>{avatar.replace("inventor_", "นักประดิษฐ์ ")}</option>)}
                </select>
              </label>
              <div className="member-fields"><b>สมาชิก {index + 1}</b><input maxLength={20} value={member.name} placeholder="ชื่อเล่น" onChange={(event) => update(index, { name: event.target.value })} /></div>
            </article>
          ))}
        </div>
        <footer className="team-footer">
          {members.length < 7 ? <button className="button button-yellow" onClick={() => setMembers([...members, { name: "", avatar: AVATARS[6] }])}>＋ เพิ่มสมาชิกคนที่ 7</button> : <button className="button button-white" onClick={() => setMembers(members.slice(0, 6))}>− ใช้ทีม 6 คน</button>}
          <span>{validation.message}</span>
          <button className="button button-orange" disabled={!valid || busy || (configured && !teamName.trim())} onClick={() => configured ? void runAction(() => onCreate(teamName.trim(), members)) : onLocalDone(members)}>ทีมพร้อมแล้ว</button>
        </footer>
      </>}
    </div>
  );
}

function TeamHistory({ team, onBack }: { team: TeamOverview; onBack: () => void }) {
  const [selectedRunId, setSelectedRunId] = useState(team.completedRuns[0]?.id ?? "");
  const run = team.completedRuns.find((item) => item.id === selectedRunId) ?? team.completedRuns[0];
  return <div className="screen team-history-screen">
    <header><button className="button button-yellow compact" onClick={onBack}>‹ กลับไปเลือกทีม</button><div><span>ประวัติย้อนหลัง</span><h1>{team.name}</h1></div></header>
    <div className="team-history-layout">
      <aside>{team.completedRuns.map((item, index) => <button className={item.id === run?.id ? "active" : ""} key={item.id} onClick={() => setSelectedRunId(item.id)}><b>ภารกิจครั้งที่ {team.completedRuns.length - index}</b><span>{new Date(item.completedAt ?? item.updatedAt).toLocaleString("th-TH")}</span></button>)}</aside>
      <section>{run ? <>
        <div className="history-summary"><div><span>สถานะ</span><b>ทำภารกิจสำเร็จ</b></div><div><span>ขั้นสุดท้าย</span><b>{STAGE_LABELS[run.currentStage]}</b></div><div><span>สมาชิก</span><b>{team.members.length} คน</b></div></div>
        <h2>สิ่งที่ทีมเลือกศึกษา</h2><div className="history-chip-list">{Object.entries(run.saveState.studyFocus ?? {}).filter(([, value]) => value).map(([key]) => <span key={key}>{key}</span>)}</div>
        <h2>คำตอบรายบุคคล</h2><div className="history-response-grid">{team.members.map((member, index) => { const ticket = run.saveState.exitTickets?.[`student-${index}`] ?? run.saveState.exitTickets?.[member.name]; return <article key={member.id ?? member.name}><b>{member.name}</b>{ticket ? <><p><i>K</i>{ticket.k || "-"}</p><p><i>P</i>{ticket.p || "-"}</p><p><i>V</i>{ticket.v || "-"}</p></> : <span>ไม่มีคำตอบที่บันทึกไว้</span>}</article>; })}</div>
      </> : <div className="team-list-state">ยังไม่มีประวัติที่ทำเสร็จ</div>}</section>
    </div>
  </div>;
}

function SaveStatusBadge({ status }: { status: SaveIndicator }) {
  const labels: Record<SaveIndicator, string> = {
    idle: "พร้อมบันทึก",
    saving: "กำลังบันทึก…",
    saved: "✓ บันทึกแล้ว",
    offline: "รอเชื่อมต่อ",
    conflict: "โหลดข้อมูลล่าสุดแล้ว",
  };
  return <div className={`save-status-badge ${status}`} role="status">{labels[status]}</div>;
}

function MissionRoute({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  return (
    <div className="screen mission-route-screen mission-briefing-screen">
      <img className="mission-route-bg" src={asset("menu/cover.png")} alt="" />
      <button className="mission-briefing-back" type="button" onClick={onBack}>‹ กลับหน้าปก</button>
      <main className="mission-briefing-card">
        <div className="mission-briefing-illustration" aria-hidden="true">
          <span className="mission-briefing-box">📦</span>
          <span className="mission-briefing-search">🔎</span>
        </div>
        <h1>ภารกิจนักสืบพัสดุ</h1>
        <p className="mission-briefing-copy">ติดตามเส้นทางของกล่อง แล้วค้นหาว่าเกิดความเสียหายอะไรขึ้นบ้าง</p>
        <button className="button button-orange mission-briefing-start" type="button" onClick={onDone}>
          เริ่มติดตามพัสดุ
          <b aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg></b>
        </button>
      </main>
    </div>
  );
}

function ComicStory({ index, audio, onIndex, onDone }: { index: number; audio: boolean; onIndex: (n: number) => void; onDone: () => void }) {
  const scene = STORY[index];
  const effects: Record<string, string> = {
    "shot_01_sender_packs.png": "01_paper_wrap.ogg",
    "shot_02_sender_seals.png": "02_tape_seal.ogg",
    "shot_03_rider_departure.png": "03_scooter_move.ogg",
    "shot_04_rain_damage.png": "04_rain.ogg",
    "shot_05_stack_pressure.png": "05_conveyor_pressure.ogg",
    "shot_06_corner_impact.png": "06_box_impact.ogg",
    "shot_07_friction_tear.png": "07_paper_friction.ogg",
    "shot_08_receiver_gets_box.png": "08_handoff.ogg",
    "shot_09_cracked_cup.png": "09_unpack.ogg",
    "shot_10_team_mission.png": "10_idea_chime.ogg",
  };
  const next = () => {
    playSound(effects[scene[0]], audio);
    if (index >= STORY.length - 1) onDone(); else onIndex(index + 1);
  };
  return (
    <div className="screen comic-screen" onClick={next} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") next(); }}>
      <img className="comic-image" src={asset(`cutscene/${scene[0]}`)} alt={scene[1]} />
      <div className="comic-progress">{index + 1} / {STORY.length}</div>
      <button className="comic-next-button" onClick={(event) => { event.stopPropagation(); next(); }} aria-label="ไปฉากถัดไป">
        <span>{index >= STORY.length - 1 ? "เริ่มสำรวจ" : "ถัดไป"}</span>
        <b aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m8 5 7 7-7 7" /></svg>
        </b>
      </button>
    </div>
  );
}

function DamageInspection({ index, findings, audio, onFinding, onIndex, onDone }: { index: number; findings: Record<string, DamageCause>; audio: boolean; onFinding: (findings: Record<string, DamageCause>) => void; onIndex: (n: number) => void; onDone: () => void }) {
  type ViewerMaterial = { name: string; pbrMetallicRoughness: { setBaseColorFactor: (color: string | number[]) => void } };
  type ViewerElement = HTMLElement & { model?: { materials: ViewerMaterial[] } };

  const defaultHint = "ลากเพื่อหมุนกล่อง แล้วแตะบริเวณที่คิดว่าถูก";
  const [hint, setHint] = useState(defaultHint);
  const [ready, setReady] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [located, setLocated] = useState(false);
  const viewerRef = useRef<ViewerElement | null>(null);
  useEffect(() => { void import("@google/model-viewer").then(() => setReady(true)); }, []);
  useEffect(() => {
    if (!ready || !viewerRef.current) return;
    const viewer = viewerRef.current;
    const hideInternalFocusFrame = () => {
      viewer.shadowRoot?.querySelector<HTMLElement>(".userInput")?.style.setProperty("outline", "none");
    };
    hideInternalFocusFrame();
    const finishLoading = () => {
      hideInternalFocusFrame();
      const cardboard = viewer.model?.materials.find((material) => material.name === "MAT_Cardboard_Fiber");
      cardboard?.pbrMetallicRoughness.setBaseColorFactor("#C9823E");
      setModelLoaded(true);
    };
    viewer.addEventListener("load", finishLoading);
    if (viewer.model) finishLoading();
    return () => viewer.removeEventListener("load", finishLoading);
  }, [ready]);
  useEffect(() => {
    const saved = Boolean(findings[DAMAGES[index].id]);
    setHint(saved ? "บันทึกข้อสังเกตจุดนี้แล้ว สามารถเปลี่ยนคำตอบหรือไปจุดถัดไปได้" : defaultHint);
    setLocated(saved);
  }, [findings, index]);
  const locateDamage = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setLocated(true);
    setHint(`พบ${DAMAGES[index].evidence}แล้ว เลือกสาเหตุที่คาดว่าเกี่ยวข้อง`);
    playSound("10_idea_chime.ogg", audio);
  };
  const damage = DAMAGES[index];
  const selectedCause = findings[damage.id];
  const saveCause = (cause: DamageCause) => {
    onFinding({ ...findings, [damage.id]: cause });
    setHint(`บันทึกแล้ว: ${damage.evidence} คาดว่าเกี่ยวข้องกับ${cause}`);
    playSound("10_idea_chime.ogg", audio);
  };
  const next = () => {
    if (!selectedCause) return;
    if (index >= DAMAGES.length - 1) onDone();
    else onIndex(index + 1);
  };
  return (
    <div className="screen inspection-screen">
      <img className="inspection-bg" src={asset("inspection/background.png")} alt="โต๊ะตรวจสอบกล่อง" />
      <div className="floating-question">{damage.title}</div>
      <div className="inspection-counter">{index + 1} / {DAMAGES.length}</div>
      <div className="model-stage">
        {ready && (
          <model-viewer
            ref={viewerRef}
            src={`${asset("models/damaged_box_blender.glb")}?v=blender-sculpt-6`}
            alt="กล่องพัสดุเปิดฝาออกครบทั้งสี่ด้าน เห็นวัสดุกันกระแทกและแก้วด้านในที่แตกร้าวและขอบบิ่น สามารถหมุนตรวจสอบและแตะตอบได้"
            camera-controls
            disable-pan
            disable-zoom
            touch-action="none"
            camera-orbit="24deg 48deg 7.8m"
            camera-target="0m -0.08m 0m"
            field-of-view="35deg"
            exposure="1.05"
            shadow-intensity="1"
            onClick={() => { if (!located) setHint(damage.hint); }}
          >
            {DAMAGES.map((spot) => {
              const active = spot.id === damage.id;
              return (
                <button
                  key={spot.id}
                  slot={`hotspot-${spot.id}`}
                  className={`damage-target ${active && located ? "is-located" : ""}`}
                  data-position={spot.position}
                  data-normal={spot.normal}
                  aria-label={active ? "เลือกบริเวณความเสียหายนี้" : undefined}
                  aria-hidden={!active}
                  tabIndex={active ? 0 : -1}
                  onClick={active ? locateDamage : (event) => { event.stopPropagation(); if (!located) setHint(damage.hint); }}
                >
                  {active && located ? "✓" : null}
                </button>
              );
            })}
          </model-viewer>
        )}
        {!modelLoaded && <div className="model-loading" role="status"><span className="loading-box" /><b>กำลังเตรียมกล่อง 3 มิติ…</b></div>}
        {located && <div className="inspection-success" role="status"><span>✓</span><div><b>พบร่องรอยแล้ว</b><small>{damage.evidence}</small></div></div>}
      </div>
      {located && (
        <aside className="inspection-cause-panel" aria-label={`เลือกสาเหตุที่คาดว่าเกี่ยวข้องกับ${damage.evidence}`}>
          <b>ร่องรอยนี้คาดว่าเกี่ยวข้องกับอะไร?</b>
          <span>เลือกจากหลักฐานที่สังเกตได้</span>
          <div>{DAMAGE_CAUSES.map((cause) => <button type="button" key={cause} aria-pressed={selectedCause === cause} onClick={() => saveCause(cause)}>{selectedCause === cause ? "✓ " : ""}{cause}</button>)}</div>
        </aside>
      )}
      <div className={`inspection-hint ${selectedCause ? "is-success" : ""}`}>{hint}</div>
      {selectedCause && <button className="inspection-next-button" onClick={next}>{index >= DAMAGES.length - 1 ? "สำรวจวัสดุ ›" : "จุดถัดไป ›"}</button>}
    </div>
  );
}

function LabRoomsPaused({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="screen lab-paused-screen">
      <img className="group-design-bg" src={asset("compression/lab_background.png")} alt="" />
      <div className="lab-paused-card">
        <span>ปิดชั่วคราว</span>
        <h1>ห้องทดลองถูกข้ามเพื่อให้เทสง่ายขึ้น</h1>
        <p>ตอนนี้ระบบจะให้ทำตอนที่ 1 แล้วไปหน้าเลือกวัสดุได้ทันที โดยไม่ต้องเล่นห้องแรงกด น้ำ และความยืดหยุ่น</p>
        <button className="button button-orange" onClick={onContinue}>ไปหน้าเลือกวัสดุ</button>
      </div>
    </div>
  );
}

const STUDY_TOPICS = [
  {
    id: "compression",
    title: "ความต้านทานแรงกดทับ",
    observation: "ดูการยุบหรือบุบเมื่อรับแรงกดเท่ากัน",
    purpose: "เพื่อเลือกวัสดุทำโครงกล่องที่ไม่ยุบง่าย",
  },
  {
    id: "elasticity",
    title: "ความสามารถในการลดความเสียหายจากแรงกระแทก",
    observation: "ดูความเสียหายของสิ่งของเมื่อรับแรงกระแทกเท่ากัน",
    purpose: "เพื่อเลือกวัสดุบุหรือวัสดุกันกระแทก",
  },
  {
    id: "water",
    title: "การดูดซับน้ำของวัสดุ",
    observation: "ดูปริมาณน้ำที่ซึมเข้าเนื้อวัสดุ เมื่อได้รับน้ำเท่ากัน",
    purpose: "เพื่อเลือกวัสดุที่ช่วยลดการเปียก",
  },
] as const;
type StudyTopicId = (typeof STUDY_TOPICS)[number]["id"];

function StudyTopicIllustration({ id }: { id: StudyTopicId }) {
  if (id === "compression") {
    return (
      <svg className="study-topic-illustration" viewBox="0 0 180 120" aria-hidden="true">
        <ellipse cx="90" cy="104" rx="58" ry="10" fill="#b8c9dd" opacity=".45" />
        <path d="M47 54 89 35l45 18-43 22Z" fill="#f4b35f" stroke="#9f5d2d" strokeWidth="3" strokeLinejoin="round" />
        <path d="m47 54 44 21v33L47 86Z" fill="#d78b3e" stroke="#9f5d2d" strokeWidth="3" strokeLinejoin="round" />
        <path d="m91 75 43-22v33l-43 22Z" fill="#eca750" stroke="#9f5d2d" strokeWidth="3" strokeLinejoin="round" />
        <path d="m71 45 43 20" stroke="#c97835" strokeWidth="3" opacity=".65" />
        <path d="M90 8v42" stroke="#075ba8" strokeWidth="15" strokeLinecap="round" />
        <path d="M90 8v42" stroke="#1d98f2" strokeWidth="9" strokeLinecap="round" />
        <path d="m72 41 18 21 18-21Z" fill="#1d98f2" stroke="#075ba8" strokeWidth="3" strokeLinejoin="round" />
        <path d="M34 37h11M39.5 31.5v11M139 27h9M143.5 22.5v9" stroke="#ffd94f" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "elasticity") {
    return (
      <svg className="study-topic-illustration" viewBox="0 0 180 120" aria-hidden="true">
        <ellipse cx="91" cy="104" rx="55" ry="9" fill="#b8c9dd" opacity=".35" />
        <path d="M58 27c18 5 43-8 64 2l-6 66c-20-8-39 6-59-2Z" fill="#d9a260" stroke="#925c31" strokeWidth="3" strokeLinejoin="round" />
        <path d="M65 35c14 4 31-5 46 0M64 48c17 6 29-5 46 1M62 63c16-5 34 8 48 0M60 78c18 4 31-7 48-1" fill="none" stroke="#b7793c" strokeWidth="3" strokeLinecap="round" opacity=".7" />
        <path d="M51 58H14m0 0 13-12M14 58l13 12M128 58h38m0 0-13-12m13 12-13 12" fill="none" stroke="#147b45" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M51 58H14m0 0 13-12M14 58l13 12M128 58h38m0 0-13-12m13 12-13 12" fill="none" stroke="#35bd72" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m58 30 7 12-8 10 8 13-7 12 6 15M121 31l-7 12 7 11-8 13 6 12-4 15" fill="none" stroke="#efc080" strokeWidth="4" />
      </svg>
    );
  }
  return (
    <svg className="study-topic-illustration" viewBox="0 0 180 120" aria-hidden="true">
      <ellipse cx="91" cy="106" rx="57" ry="8" fill="#b8c9dd" opacity=".45" />
      <path d="M44 92 90 82l51 10-47 14Z" fill="#dcecff" stroke="#6f9fc7" strokeWidth="3" strokeLinejoin="round" />
      <path d="M94 106v7l47-14v-7M44 92v7l50 14" fill="#bdd8ef" stroke="#6f9fc7" strokeWidth="3" strokeLinejoin="round" />
      <path d="M48 43c0-12 10-21 23-20 5-15 28-20 40-7 14-3 27 7 27 20 0 14-12 23-27 23H70c-13 0-22-6-22-16Z" fill="#7598b7" stroke="#486e91" strokeWidth="4" strokeLinejoin="round" />
      <path d="M59 66c0 8-12 8-12 0 0-4 6-12 6-12s6 8 6 12ZM91 72c0 9-13 9-13 0 0-4 6.5-13 6.5-13S91 68 91 72ZM124 65c0 8-12 8-12 0 0-4 6-12 6-12s6 8 6 12Z" fill="#36a9f7" />
      <path d="M65 79c0 6-9 6-9 0 0-3 4.5-9 4.5-9S65 76 65 79ZM112 82c0 6-9 6-9 0 0-3 4.5-9 4.5-9s4.5 6 4.5 9Z" fill="#67c7ff" />
      <path d="M69 28c8-9 23-12 35-4" fill="none" stroke="#a9c2d5" strokeWidth="5" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}
const MATERIAL_GUIDE_ORDER = ["corrugated_cardboard", "cardboard", "bubble_wrap", "closed_cell_pe_foam", "pe_sheet"] as const;
const STUDY_FOCUS_WARNING = "ลองพิจารณาอีกครั้งว่า กล่องยุบ สิ่งของเสียหาย และกล่องเปียก ต้องศึกษาสมบัติใดบ้าง";

const CORRUGATED_FEATURES = [
  {
    id: "top-liner",
    label: "แผ่นผิวบน",
    icon: "▰",
    detail: "แผ่นกระดาษเรียบอยู่ด้านบนของลอน ผิวค่อนข้างเรียบและเป็นชั้นนอกของแผ่นกระดาษลูกฟูก",
    position: "-1.65m 0.24m -0.65m",
    normal: "0 1 0",
    orbit: "28deg 54deg 7.2m",
    target: "-0.65m 0.08m 0m",
  },
  {
    id: "flute",
    label: "ลอน E ขนาดเล็ก",
    icon: "〰",
    detail: "ลอน E มีขนาดเล็กและเรียงถี่ อยู่ระหว่างแผ่นผิวสองด้าน ทำให้มองเห็นช่องอากาศต่อเนื่องตลอดแนว",
    position: "0m 0m 2.14m",
    normal: "0 0 1",
    orbit: "0deg 82deg 6.4m",
    target: "0m 0m 0.65m",
  },
  {
    id: "bottom-liner",
    label: "แผ่นผิวล่าง",
    icon: "▱",
    detail: "แผ่นกระดาษเรียบอยู่ใต้ลอน เมื่อมองจากด้านข้างจะเห็นโครงสร้างสามชั้น ได้แก่ แผ่นผิว ลอน และแผ่นผิว",
    position: "1.62m -0.2m 2.14m",
    normal: "0 0 1",
    orbit: "-28deg 76deg 7.2m",
    target: "0.65m -0.08m 0m",
  },
] as const;

const CORRUGATED_OVERVIEW = {
  label: "กระดาษลูกฟูกลอน E 3 ชั้น",
  icon: "📦",
  detail: "กระดาษลูกฟูกแบบ Single Wall ประกอบด้วยแผ่นผิวเรียบ 2 ชั้นและลอน E ขนาดเล็กอยู่ตรงกลาง ลากโมเดลเพื่อหมุน ใช้ล้อเมาส์หรือสองนิ้วเพื่อซูม แล้วกดป้ายเพื่อสำรวจแต่ละส่วน",
};

type MaterialExplorerFeature = {
  id: string;
  label: string;
  icon: string;
  detail: string;
  position: string;
  normal: string;
  orbit: string;
  target: string;
};

const PE_SHEET_FEATURES = [
  {
    id: "single-clear-sheet",
    label: "แผ่นเดี่ยวใสขุ่น",
    icon: "▱",
    detail: "ฟิล์ม PE เป็นแผ่นเดี่ยวบาง สีใสขุ่นหรือขาวน้ำนม แสงผ่านได้แต่ยังมองเห็นความขุ่นของเนื้อฟิล์ม",
    position: "-1.45m 0.08m -0.65m",
    normal: "0 1 0",
    orbit: "32deg 52deg 6.8m",
    target: "-0.65m 0m -0.3m",
  },
  {
    id: "thin-film",
    label: "แผ่นฟิล์มบางและยืดหยุ่น",
    icon: "⌁",
    detail: "แผ่น PE มีความบางและโค้งงอได้ เมื่อจับหรือวางบนพื้นผิวจะเปลี่ยนรูปตามการพับหรือการโค้ง",
    position: "1.75m 0.12m 1.2m",
    normal: "0 1 0",
    orbit: "12deg 64deg 6.6m",
    target: "1.25m 0.05m 0.85m",
  },
  {
    id: "smooth-surface",
    label: "ผิวเรียบและลื่น",
    icon: "◇",
    detail: "ผิวฟิล์มมีลักษณะเรียบและลื่น เมื่อสะท้อนแสงจะเห็นความเงาบนผิวบางส่วน",
    position: "0.15m 0.08m 0.35m",
    normal: "0 1 0",
    orbit: "-18deg 56deg 6.6m",
    target: "0m 0m 0.2m",
  },
] satisfies readonly MaterialExplorerFeature[];

const BUBBLE_WRAP_FEATURES = [
  {
    id: "air-bubbles",
    label: "ฟองอากาศเรียงเป็นแถว",
    icon: "◉",
    detail: "ฟองครึ่งทรงกลมขนาดใกล้เคียงกันเรียงต่อกันเป็นแถว ภายในแต่ละฟองมองเห็นเป็นช่องอากาศ",
    position: "-1.15m 0.22m 0.75m",
    normal: "0 1 0",
    orbit: "22deg 52deg 6.6m",
    target: "-0.75m 0.1m 0.7m",
  },
  {
    id: "base-film",
    label: "แผ่นฟิล์มเชื่อมฟอง",
    icon: "▱",
    detail: "แผ่นฟิล์มบางเชื่อมฟองอากาศแต่ละช่องเข้าด้วยกันเป็นแผ่นเดียว และสามารถโค้งงอได้",
    position: "0.25m 0.04m 1.72m",
    normal: "0 1 0",
    orbit: "-18deg 68deg 6.8m",
    target: "0.25m 0m 1.05m",
  },
  {
    id: "flexible-sheet",
    label: "แผ่นเดี่ยวโค้งห่อได้",
    icon: "⌁",
    detail: "วัสดุเป็นแผ่นเดี่ยวที่มีฟองทั่วทั้งแผ่น เมื่อยกขึ้นสามารถโค้งหรือม้วนได้",
    position: "1.95m 0.04m -0.95m",
    normal: "0 1 0",
    orbit: "42deg 62deg 6.8m",
    target: "1.2m 0m -0.55m",
  },
] satisfies readonly MaterialExplorerFeature[];

const PE_FOAM_FEATURES = [
  {
    id: "single-foam-sheet",
    label: "โฟม PE หนึ่งแผ่น",
    icon: "▰",
    detail: "โฟม EPE ชิ้นนี้เป็นแผ่นเดี่ยวสีขาว มีน้ำหนักเบาและมีความหนาเล็กน้อย",
    position: "-1.45m 0.2m -0.75m",
    normal: "0 1 0",
    orbit: "30deg 54deg 6.8m",
    target: "-0.65m 0m -0.35m",
  },
  {
    id: "closed-cell-surface",
    label: "ผิวเซลล์โฟมละเอียด",
    icon: "⠿",
    detail: "ผิวประกอบด้วยเซลล์ขนาดเล็กจำนวนมาก มองเห็นเป็นพื้นผิวละเอียดและมีเนื้อนุ่มเมื่อสัมผัส",
    position: "0.25m 0.2m 0.25m",
    normal: "0 1 0",
    orbit: "-16deg 48deg 5.3m",
    target: "0.15m 0.12m 0.15m",
  },
  {
    id: "soft-thin-edge",
    label: "ขอบหนาและนุ่ม",
    icon: "▬",
    detail: "ขอบแสดงความหนาของโฟมหนึ่งแผ่น เนื้อวัสดุมีลักษณะนุ่มและโค้งงอได้",
    position: "1.35m 0m 1.84m",
    normal: "0 0 1",
    orbit: "-20deg 78deg 5.8m",
    target: "0.8m 0m 1.25m",
  },
] satisfies readonly MaterialExplorerFeature[];

const CARDBOARD_FEATURES = [
  {
    id: "white-front",
    label: "ผิวหน้าสีขาว",
    icon: "▰",
    detail: "ด้านหน้าเป็นกระดาษสีขาว มีผิวเรียบและทึบแสง แตกต่างจากผิวสีเทาที่อยู่อีกด้านหนึ่ง",
    position: "-1.35m 0.16m -0.7m",
    normal: "0 1 0",
    orbit: "28deg 50deg 7m",
    target: "-0.7m 0.05m -0.3m",
  },
  {
    id: "gray-back",
    label: "ผิวหลังสีเทา",
    icon: "▱",
    detail: "ด้านหลังเป็นเยื่อกระดาษสีเทา เห็นเส้นใยและจุดเล็ก ๆ ของเนื้อกระดาษรีไซเคิล แต่ยังคงมีผิวเรียบและทึบแสง",
    position: "0.75m -0.03m 0.55m",
    normal: "0 -1 0",
    orbit: "-30deg 132deg 7m",
    target: "0.35m 0m 0.2m",
  },
  {
    id: "dense-edge",
    label: "ขอบกระดาษ 400 แกรม",
    icon: "▬",
    detail: "ขอบแสดงความหนาของกระดาษหน้าขาวหลังเทา 400 แกรม เนื้อกระดาษแน่นเป็นชั้นเดียว ไม่มีลอนหรือช่องอากาศ",
    position: "1.65m 0.1m 1.88m",
    normal: "0 0 1",
    orbit: "-18deg 78deg 6.1m",
    target: "0.9m 0.04m 1.25m",
  },
] satisfies readonly MaterialExplorerFeature[];

const KRAFT_PAPER_FEATURES = [
  {
    id: "natural-fiber-surface",
    label: "ผิวเส้นใยธรรมชาติ",
    icon: "≋",
    detail: "ผิวสีน้ำตาลธรรมชาติเกิดจากเยื่อกระดาษคราฟต์ มองเห็นเส้นใยละเอียดทั่วแผ่นและมีผิวด้าน ไม่มันวาว",
    position: "-1.35m 0.16m -0.55m",
    normal: "0 1 0",
    orbit: "28deg 50deg 6.8m",
    target: "-0.7m 0.05m -0.25m",
  },
  {
    id: "thin-kraft-edge",
    label: "ขอบแผ่นบาง",
    icon: "▬",
    detail: "กระดาษคราฟต์เป็นแผ่นเดี่ยวที่บางและน้ำหนักเบา ขอบไม่มีลอนหรือชั้นโฟมอยู่ภายใน",
    position: "1.55m 0.09m 1.88m",
    normal: "0 0 1",
    orbit: "-18deg 80deg 5.9m",
    target: "0.9m 0.02m 1.3m",
  },
  {
    id: "flexible-kraft-sheet",
    label: "โค้งงอได้",
    icon: "⌁",
    detail: "แม้เนื้อกระดาษจะคงรูปเป็นแผ่น แต่ยังโค้ง พับ หรือขยำเพื่อรองและเติมช่องว่างรอบสิ่งของได้",
    position: "1.8m 0.24m -1m",
    normal: "0 1 0",
    orbit: "42deg 60deg 6.7m",
    target: "1.15m 0.1m -0.65m",
  },
] satisfies readonly MaterialExplorerFeature[];

const WAX_PAPER_FEATURES = [
  {
    id: "wax-coated-surface",
    label: "ผิวเคลือบไขสองด้าน",
    icon: "◇",
    detail: "ชั้นไขพาราฟินเคลือบผิวกระดาษทั้งสองด้าน ทำให้ผิวเรียบลื่น มีเงาซาตินเล็กน้อย และช่วยให้น้ำกับไขมันซึมผ่านได้ยาก",
    position: "-1.35m 0.25m -0.55m",
    normal: "0 1 0",
    orbit: "28deg 50deg 6.7m",
    target: "-0.7m 0.1m -0.25m",
  },
  {
    id: "milky-translucency",
    label: "โปร่งแสงสีขาวนวล",
    icon: "◐",
    detail: "เนื้อกระดาษและชั้นไขยอมให้แสงผ่านได้บางส่วน จึงเห็นเป็นสีขาวนวลโปร่งแสง แต่ไม่ใสเหมือนแผ่นพลาสติก",
    position: "0.15m 0.18m 0.3m",
    normal: "0 1 0",
    orbit: "-16deg 54deg 6.2m",
    target: "0.1m 0.08m 0.2m",
  },
  {
    id: "very-flexible-sheet",
    label: "แผ่นบางโค้งงอได้มาก",
    icon: "⌁",
    detail: "กระดาษไขเป็นแผ่นบางและน้ำหนักเบา จึงโค้ง พับ หรือห่อรอบสิ่งของได้ง่ายโดยไม่ต้องทำเป็นแผ่นหนา",
    position: "1.8m 0.32m -1m",
    normal: "0 1 0",
    orbit: "42deg 60deg 6.6m",
    target: "1.15m 0.14m -0.65m",
  },
] satisfies readonly MaterialExplorerFeature[];

const MATERIAL_EXPLORERS = {
  corrugated_cardboard: {
    title: "กระดาษลูกฟูก",
    model: "models/corrugated_cardboard.glb",
    alt: "โมเดลกระดาษลูกฟูกสามมิติ แสดงแผ่นผิวบน ลอน E และแผ่นผิวล่าง",
    loading: "กำลังประกอบลอนกระดาษ 3 มิติ…",
    overview: CORRUGATED_OVERVIEW,
    features: CORRUGATED_FEATURES,
    orbit: "32deg 70deg 8m",
    target: "0m 0m 0m",
    minOrbit: "auto 10deg 5.2m",
    maxOrbit: "auto 165deg 12m",
  },
  pe_sheet: {
    title: "แผ่นพลาสติก PE",
    model: "models/pe_sheet.glb",
    alt: "โมเดลแผ่นพลาสติก PE ใสขุ่นสีขาวน้ำนมแบบแผ่นเดี่ยว ผิวเรียบ บาง และโค้งงอได้",
    loading: "กำลังเตรียมแผ่นฟิล์ม PE 3 มิติ…",
    overview: { label: "แผ่นฟิล์ม PE ใสขุ่น", icon: "▱", detail: "ฟิล์มพลาสติก PE สีขาวน้ำนมแบบแผ่นเดี่ยว ผิวเรียบลื่น บาง และโค้งพับได้" },
    features: PE_SHEET_FEATURES,
    orbit: "36deg 58deg 7.3m",
    target: "0m 0.04m 0m",
    minOrbit: "auto 10deg 5.2m",
    maxOrbit: "auto 165deg 13m",
  },
  bubble_wrap: {
    title: "แผ่นพลาสติกกันกระแทกชนิดฟองอากาศ",
    model: "models/bubble_wrap.glb",
    alt: "โมเดลแผ่นพลาสติกกันกระแทกชนิดฟองอากาศแบบแผ่นเดี่ยว มีฟองอากาศเรียงเป็นแถวทั้งสองด้าน",
    loading: "กำลังเติมอากาศในฟอง 3 มิติ…",
    overview: { label: "แผ่นพลาสติกที่มีฟองอากาศ", icon: "🫧", detail: "แผ่นฟิล์มเดี่ยวมีฟองอากาศขนาดใกล้เคียงกันเรียงต่อกันทั่วทั้งแผ่น" },
    features: BUBBLE_WRAP_FEATURES,
    orbit: "34deg 58deg 6.9m",
    target: "0m 0.08m 0.25m",
    minOrbit: "auto 10deg 4.8m",
    maxOrbit: "auto 165deg 12m",
  },
  closed_cell_pe_foam: {
    title: "แผ่นโฟม EPE",
    model: "models/pe_foam_sheet.glb",
    alt: "โมเดลแผ่นโฟม EPE สีขาวแบบหนึ่งแผ่น มีความหนาเล็กน้อย ขอบมน และผิวเซลล์ละเอียด",
    loading: "กำลังสร้างเซลล์โฟม EPE 3 มิติ…",
    overview: { label: "แผ่นโฟม EPE เซลล์ปิด", icon: "▰", detail: "โฟม EPE สีขาวหนึ่งแผ่น น้ำหนักเบา เนื้อนุ่ม และมีผิวเซลล์ละเอียด" },
    features: PE_FOAM_FEATURES,
    orbit: "34deg 60deg 7.1m",
    target: "0m 0m 0m",
    minOrbit: "auto 10deg 4.8m",
    maxOrbit: "auto 165deg 12m",
  },
  cardboard: {
    title: "กระดาษหน้าขาวหลังเทา 400 แกรม",
    model: "models/cardboard_gray_white_400gsm.glb",
    alt: "โมเดลกระดาษหน้าขาวหลังเทา 400 แกรมแบบหนึ่งแผ่น ด้านหน้าสีขาว ด้านหลังสีเทา และมีขอบบางทึบแสง",
    loading: "กำลังเตรียมกระดาษหน้าขาวหลังเทา 400 แกรมแบบ 3 มิติ…",
    overview: { label: "กระดาษหน้าขาวหลังเทา 400 แกรม", icon: "▰", detail: "กระดาษหนึ่งแผ่น ผิวหน้าสีขาว ผิวหลังสีเทา เนื้อแน่น เรียบ และทึบแสง" },
    features: CARDBOARD_FEATURES,
    orbit: "34deg 62deg 7.4m",
    target: "0m 0.04m 0m",
    minOrbit: "auto 10deg 4.9m",
    maxOrbit: "auto 165deg 12m",
  },
  kraft_paper: {
    title: "กระดาษคราฟต์",
    model: "models/kraft_paper_single_sheet.glb",
    alt: "โมเดลกระดาษคราฟต์สีน้ำตาลแบบหนึ่งแผ่น บาง มีผิวเส้นใยละเอียด และโค้งเป็นคลื่นเล็กน้อย",
    loading: "กำลังเตรียมเส้นใยกระดาษคราฟต์ 3 มิติ…",
    overview: { label: "กระดาษคราฟต์หนึ่งแผ่น", icon: "≋", detail: "กระดาษคราฟต์สีน้ำตาลหนึ่งแผ่น ผิวด้านมีเส้นใยละเอียด เนื้อบาง น้ำหนักเบา และโค้งงอได้" },
    features: KRAFT_PAPER_FEATURES,
    orbit: "34deg 60deg 7.2m",
    target: "0m 0.04m 0m",
    minOrbit: "auto 10deg 4.8m",
    maxOrbit: "auto 165deg 12m",
  },
  waxed_paper: {
    title: "กระดาษเคลือบไข",
    model: "models/wax_paper_single_sheet.glb",
    alt: "โมเดลกระดาษไขสีขาวนวลโปร่งแสงแบบหนึ่งแผ่น บางมาก มีผิวเคลือบไขละเอียด และโค้งเป็นคลื่น",
    loading: "กำลังเคลือบผิวกระดาษไข 3 มิติ…",
    overview: { label: "กระดาษไขเคลือบพาราฟิน", icon: "◐", detail: "กระดาษสีขาวนวลหนึ่งแผ่น เคลือบไขทั้งสองด้าน โปร่งแสง ผิวเรียบ และโค้งงอได้มาก" },
    features: WAX_PAPER_FEATURES,
    orbit: "34deg 58deg 7m",
    target: "0m 0.08m 0m",
    minOrbit: "auto 10deg 4.7m",
    maxOrbit: "auto 165deg 12m",
  },
} as const;

type MaterialExplorerId = keyof typeof MATERIAL_EXPLORERS;
function MaterialGuide({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const orderedMaterials = MATERIAL_GUIDE_ORDER
    .map((id) => MATERIALS.find((material) => material.id === id))
    .filter((material): material is (typeof MATERIALS)[number] => Boolean(material));
  type MaterialViewerElement = HTMLElement & {
    cameraOrbit?: string;
    cameraTarget?: string;
    loaded?: boolean;
    jumpCameraToGoal?: () => void;
  };
  const [exploringMaterial, setExploringMaterial] = useState<MaterialExplorerId | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelError, setModelError] = useState("");
  const [modelAttempt, setModelAttempt] = useState(0);
  const [selectedFeature, setSelectedFeature] = useState<string>("overview");
  const materialViewerRef = useRef<MaterialViewerElement | null>(null);
  const exploring = exploringMaterial !== null;
  const explorer = MATERIAL_EXPLORERS[exploringMaterial ?? "corrugated_cardboard"];
  const explorerFeatures = explorer.features as readonly MaterialExplorerFeature[];
  const selected = explorerFeatures.find((feature) => feature.id === selectedFeature) ?? explorer.overview;

  useEffect(() => {
    if (!exploring) return;
    void import("@google/model-viewer").then(() => setViewerReady(true));
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExploringMaterial(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [exploring]);

  useEffect(() => {
    if (!exploring || !viewerReady || !materialViewerRef.current) return;
    const viewer = materialViewerRef.current;
    const finishLoading = () => {
      setModelError("");
      setModelLoaded(true);
    };
    const failLoading = () => {
      setModelLoaded(false);
      setModelError("ยังเปิดโมเดลไม่ได้ ลองกดโหลดอีกครั้ง");
    };
    viewer.addEventListener("load", finishLoading);
    viewer.addEventListener("error", failLoading);
    if (viewer.loaded) finishLoading();
    return () => {
      viewer.removeEventListener("load", finishLoading);
      viewer.removeEventListener("error", failLoading);
    };
  }, [exploring, viewerReady, modelAttempt]);

  const openExplorer = (materialId: MaterialExplorerId) => {
    setSelectedFeature("overview");
    setModelLoaded(false);
    setModelError("");
    setModelAttempt((current) => current + 1);
    setExploringMaterial(materialId);
  };
  const retryModel = () => {
    setModelError("");
    setModelLoaded(false);
    setModelAttempt((current) => current + 1);
  };
  const focusFeature = (feature: MaterialExplorerFeature) => {
    setSelectedFeature(feature.id);
    const viewer = materialViewerRef.current;
    if (!viewer) return;
    viewer.cameraOrbit = feature.orbit;
    viewer.cameraTarget = feature.target;
    viewer.jumpCameraToGoal?.();
  };
  const resetExplorer = () => {
    setSelectedFeature("overview");
    const viewer = materialViewerRef.current;
    if (!viewer) return;
    viewer.cameraOrbit = explorer.orbit;
    viewer.cameraTarget = explorer.target;
    viewer.jumpCameraToGoal?.();
  };

  return (
    <div className="screen material-guide-screen">
      <img className="material-guide-bg" src={asset("compression/lab_background.png")} alt="" />
      <button className="material-guide-back-button" onClick={onBack}>‹ ย้อนกลับ</button>
      <header className="material-guide-header">
        <div>
          <h1>สำรวจวัสดุ</h1>
        </div>
      </header>
      <section className="material-guide-grid showing-five-materials" aria-label="ข้อมูลวัสดุ 5 ชนิดตามแผนการสอน">
        {orderedMaterials.map((material) => {
          const materialId = material.id as MaterialExplorerId;
          const hasExplorer = materialId in MATERIAL_EXPLORERS;
          return (
          <article key={material.id} className={hasExplorer ? "is-explorable" : undefined}>
            {hasExplorer ? (
              <button type="button" className="material-card-button" onClick={() => openExplorer(materialId)} aria-label={`เปิดสำรวจ${material.name}แบบ 3 มิติ`}>
                <img src={asset(`materials/${material.image}`)} alt="" />
                <div><h2>{material.name}</h2><span>หมุนดู 3D</span></div>
              </button>
            ) : (
              <>
                <img src={asset(`materials/${material.image}`)} alt={material.name} />
                <div><h2>{material.name}</h2></div>
              </>
            )}
          </article>
          );
        })}
      </section>
      <footer className="material-guide-footer">
        <button className="button button-orange" onClick={onDone}>ถัดไป</button>
      </footer>
      {exploring && (
        <section className="material-3d-overlay" role="dialog" aria-modal="true" aria-labelledby="material-3d-title">
          <header className="material-3d-header">
            <button type="button" className="material-3d-close" onClick={() => setExploringMaterial(null)}>‹ กลับไปดูวัสดุทั้งหมด</button>
            <div>
              <span>สำรวจแบบ 3 มิติ</span>
              <h1 id="material-3d-title">{explorer.title}</h1>
            </div>
          </header>
          <div className="material-3d-layout">
            <div className="material-3d-stage is-dark-material-stage">
              {viewerReady && (
                <model-viewer
                  key={modelAttempt}
                  ref={materialViewerRef}
                  src={`${asset(explorer.model)}?v=wax-paper-single-sheet-v21-${modelAttempt}`}
                  alt={explorer.alt}
                  camera-controls
                  touch-action="pan-y"
                  camera-orbit={explorer.orbit}
                  camera-target={explorer.target}
                  min-camera-orbit={explorer.minOrbit}
                  max-camera-orbit={explorer.maxOrbit}
                  field-of-view="32deg"
                  min-field-of-view="24deg"
                  max-field-of-view="48deg"
                  interpolation-decay="120"
                  exposure={exploringMaterial === "pe_sheet" || exploringMaterial === "bubble_wrap" || exploringMaterial === "waxed_paper" ? "1.22" : "1.08"}
                  shadow-intensity={exploringMaterial === "pe_sheet" || exploringMaterial === "bubble_wrap" || exploringMaterial === "waxed_paper" ? "0.08" : "1.15"}
                >
                  {explorerFeatures.map((feature, featureIndex) => (
                    <button
                      type="button"
                      key={feature.id}
                      slot={`hotspot-${feature.id}`}
                      className={`material-3d-hotspot ${selectedFeature === feature.id ? "is-active" : ""}`}
                      data-position={feature.position}
                      data-normal={feature.normal}
                      data-feature={feature.id}
                      data-pointer={featureIndex}
                      aria-pressed={selectedFeature === feature.id}
                      onClick={(event) => { event.stopPropagation(); focusFeature(feature); }}
                    >
                      <b>{feature.icon}</b><span>{feature.label}</span>
                    </button>
                  ))}
                </model-viewer>
              )}
              {!modelLoaded && !modelError && <div className="material-3d-loading" role="status"><span className="loading-box" /><b>{explorer.loading}</b></div>}
              {modelError && <div className="material-3d-error" role="alert"><span>⚠</span><b>{modelError}</b><button type="button" onClick={retryModel}>โหลดโมเดลอีกครั้ง</button></div>}
              <div className="material-3d-gesture-hint">ลากขึ้น–ลงเพื่อดูด้านบนและด้านล่าง · เลื่อนหรือหนีบเพื่อซูม</div>
            </div>
            <aside className="material-3d-info" aria-live="polite">
              <div className="material-3d-info-icon">{selected.icon}</div>
              <p>ส่วนที่กำลังสำรวจ</p>
              <h2>{selected.label}</h2>
              <div className="material-3d-part-buttons" aria-label={`เลือกส่วนของ${explorer.title}`}>
                {explorerFeatures.map((feature) => (
                  <button type="button" key={feature.id} className={selectedFeature === feature.id ? "is-active" : ""} aria-pressed={selectedFeature === feature.id} onClick={() => focusFeature(feature)}>
                    <span>{feature.icon}</span>{feature.label}
                  </button>
                ))}
              </div>
              <button type="button" className="material-3d-reset" onClick={resetExplorer}>↻ กลับไปดูทั้งแผ่น</button>
            </aside>
          </div>
        </section>
      )}
    </div>
  );
}

function StudyFocusScreen({ values, onBack, onChange, onDone }: { values: Record<string, boolean>; onBack: () => void; onChange: (values: Record<string, boolean>) => void; onDone: () => void }) {
  const [warning, setWarning] = useState("");
  const selectedCount = STUDY_TOPICS.filter((topic) => values[topic.id]).length;
  const complete = selectedCount === STUDY_TOPICS.length;
  const toggle = (id: string) => {
    setWarning("");
    onChange({ ...values, [id]: !values[id] });
  };
  const saveFocus = () => {
    if (!complete) {
      setWarning(STUDY_FOCUS_WARNING);
      return;
    }
    setWarning("");
    onDone();
  };
  return (
    <div className="screen study-focus-screen">
      <img className="material-guide-bg" src={asset("compression/lab_background.png")} alt="" />
      <button className="material-guide-back-button" onClick={onBack}>‹ ย้อนกลับ</button>
      <header className="study-focus-header">
        <div className="study-focus-question">
          <span>🔎 ภารกิจนักสืบวัสดุ</span>
          <h1>กล่องของเราต้องเจอทั้งแรงกด การตกหรือกระแทก และฝนระหว่างขนส่ง</h1>
          <p>เราควรศึกษาสมบัติอะไรบ้างนะ?</p>
        </div>
      </header>
      <div className="study-topic-title study-focus-title"><span>★</span> เลือกสมบัติที่จำเป็นต้องศึกษา</div>
      <section className="study-topic-panel study-focus-panel" aria-label="เลือกสมบัติที่ต้องศึกษา">
        {STUDY_TOPICS.map((topic) => (
          <button key={topic.id} className={`study-topic-card study-topic-${topic.id}${values[topic.id] ? " selected" : ""}`} aria-pressed={Boolean(values[topic.id])} onClick={() => toggle(topic.id)}>
            <span className="study-topic-check" aria-hidden="true">{values[topic.id] ? "✓" : "☆"}</span>
            <StudyTopicIllustration id={topic.id} />
            <b className="study-topic-name">{topic.title}</b>
            <span className="study-topic-observation">{topic.observation}</span>
            <span className="study-topic-purpose">{topic.purpose}</span>
            <span className="study-topic-tap">{values[topic.id] ? "เลือกแล้ว!" : "แตะเพื่อเลือก"}</span>
          </button>
        ))}
      </section>
      {warning && <div className="study-focus-warning" role="alert">{warning}</div>}
      <footer className="study-focus-footer">
        <div className="study-focus-progress" aria-live="polite">
          <span>เลือกแล้ว {selectedCount}/{STUDY_TOPICS.length} สมบัติ</span>
          <div aria-hidden="true">{STUDY_TOPICS.map((topic) => <i key={topic.id} className={values[topic.id] ? "filled" : ""}>★</i>)}</div>
        </div>
        <button className="button button-orange study-focus-save" onClick={saveFocus}>{complete ? "ครบแล้ว ไปต่อเลย! ›" : "เลือกให้ครบก่อนนะ"}</button>
      </footer>
    </div>
  );
}

const EMPTY_EXIT_TICKET: ExitTicket = { k: "", p: "", v: "" };

type MatchField = "k" | "p";
type MatchItem = { id: string; prompt: string; answer: string };

const KNOWLEDGE_MATCHES: MatchItem[] = [
  { id: "collapsed-box", prompt: "กล่องยุบ สัมพันธ์กับสมบัติ", answer: "ความต้านทานแรงกดทับ" },
  { id: "impact-damage", prompt: "สิ่งของภายในเสียหายจากแรงกระแทก สัมพันธ์กับสมบัติ", answer: "ความสามารถในการลดความเสียหายจากแรงกระแทก" },
  { id: "wet-box", prompt: "กล่องเปียก สัมพันธ์กับสมบัติ", answer: "การดูดซับน้ำของวัสดุ" },
];

const EXIT_ANSWER_ALIASES: Record<string, string> = {
  "ความสามารถในการช่วยลดความเสียหายจากแรงกระแทก": "ความสามารถในการลดความเสียหายจากแรงกระแทก",
  "การดูดซับน้ำและความสามารถในการป้องกันน้ำซึมผ่าน": "การดูดซับน้ำของวัสดุ",
};

const PROCESS_MATCHES: MatchItem[] = [
  { id: "dent-trace", prompt: "รอยยุบ คาดว่าเกิดจาก", answer: "แรงกด" },
  { id: "impact-trace", prompt: "รอยบุบหรือสิ่งของภายในเสียหาย คาดว่าเกิดจาก", answer: "แรงกระแทก" },
  { id: "wet-trace", prompt: "รอยเปียก คาดว่าเกิดจาก", answer: "น้ำ" },
];

function readMatches(value: string, items: MatchItem[]) {
  const matches: Record<string, string> = {};
  const lines = value.split("\n");
  items.forEach((item, index) => {
    const line = lines[index];
    const answer = items.map((entry) => entry.answer).find((option) => line?.includes(option)
      || Object.entries(EXIT_ANSWER_ALIASES).some(([legacy, current]) => current === option && line?.includes(legacy)));
    if (answer) matches[item.id] = answer;
  });
  return matches;
}

function writeMatches(items: MatchItem[], matches: Record<string, string>) {
  return items.map((item, index) => `${index + 1}. ${item.prompt} → ${matches[item.id] ?? "_____"}`).join("\n");
}

function readValueAnswer(value: string) {
  const choice = value.startsWith("ไม่เหมาะสม") ? "ไม่เหมาะสม" : value.startsWith("เหมาะสม") ? "เหมาะสม" : "";
  const reason = value.includes("เหตุผล:") ? value.slice(value.indexOf("เหตุผล:") + "เหตุผล:".length).trim() : "";
  return { choice, reason };
}

function writeValueAnswer(choice: string, reason: string) {
  return `${choice}\nเหตุผล: ${reason}`.trim();
}

function isStructuredExitTicketComplete(ticket?: ExitTicket) {
  if (!ticket) return false;
  const kMatches = readMatches(ticket.k, KNOWLEDGE_MATCHES);
  const pMatches = readMatches(ticket.p, PROCESS_MATCHES);
  const valueAnswer = readValueAnswer(ticket.v);
  return Object.keys(kMatches).length === KNOWLEDGE_MATCHES.length
    && Object.keys(pMatches).length === PROCESS_MATCHES.length
    && Boolean(valueAnswer.choice && valueAnswer.reason);
}

function exitTicketsAreEqual(first?: ExitTicket, second?: ExitTicket) {
  return first?.k === second?.k && first?.p === second?.p && first?.v === second?.v;
}

function MatchingQuestion({ field, questionNumber, instruction, items, value, selectedAnswer, onSelectAnswer, onChange }: { field: MatchField; questionNumber: number; instruction: string; items: MatchItem[]; value: string; selectedAnswer: string; onSelectAnswer: (answer: string) => void; onChange: (value: string) => void }) {
  const matches = readMatches(value, items);
  const usedAnswers = new Set(Object.values(matches));
  const answers = items.map((item) => item.answer);
  const assign = (itemId: string, answer: string) => {
    if (!answers.includes(answer)) return;
    const next = { ...matches };
    const sourceItemId = Object.entries(next).find(([, currentAnswer]) => currentAnswer === answer)?.[0];
    const replacedAnswer = next[itemId];
    if (sourceItemId && sourceItemId !== itemId) {
      if (replacedAnswer) next[sourceItemId] = replacedAnswer;
      else delete next[sourceItemId];
    }
    next[itemId] = answer;
    onChange(writeMatches(items, next));
    onSelectAnswer("");
  };
  const startDrag = (event: DragEvent<HTMLElement>, answer: string) => {
    event.dataTransfer.setData("text/plain", JSON.stringify({ field, answer }));
    event.dataTransfer.effectAllowed = "move";
    onSelectAnswer(answer);
  };
  const drop = (event: DragEvent<HTMLElement>, itemId: string) => {
    event.preventDefault();
    try {
      const dragged = JSON.parse(event.dataTransfer.getData("text/plain")) as { field?: string; answer?: string };
      if (dragged.field === field && dragged.answer) assign(itemId, dragged.answer);
    } catch {
      // Ignore drag data from outside this activity.
    }
  };
  const returnToBank = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    try {
      const dragged = JSON.parse(event.dataTransfer.getData("text/plain")) as { field?: string; answer?: string };
      if (dragged.field !== field || !dragged.answer) return;
      const next = { ...matches };
      const sourceItemId = Object.entries(next).find(([, answer]) => answer === dragged.answer)?.[0];
      if (sourceItemId) {
        delete next[sourceItemId];
        onChange(writeMatches(items, next));
      }
      onSelectAnswer("");
    } catch {
      // Ignore drag data from outside this activity.
    }
  };
  return (
    <section className={`matching-question matching-question-${field}`}>
      <header><strong>{questionNumber}</strong><h2><span>ข้อที่ {questionNumber}</span> {instruction}</h2></header>
      <div className="answer-bank" aria-label={`ตัวเลือกข้อที่ ${questionNumber}`} onDragOver={(event) => event.preventDefault()} onDrop={returnToBank}>
        <b>ตัวเลือก</b>
        {answers.filter((answer) => !usedAnswers.has(answer)).map((answer) => (
          <button type="button" key={answer} draggable onDragStart={(event) => startDrag(event, answer)} onClick={() => onSelectAnswer(selectedAnswer === answer ? "" : answer)} className={selectedAnswer === answer ? "selected" : ""}>{answer}</button>
        ))}
        {usedAnswers.size === answers.length && <span>ลากคำตอบจากช่องด้านล่างกลับมาวางที่นี่เพื่อเปลี่ยนใหม่</span>}
      </div>
      <div className="matching-prompts">
        {items.map((item, index) => {
          const answer = matches[item.id];
          return (
            <div className="matching-prompt" key={item.id}>
              <span><b>{index + 1}.</b> {item.prompt}</span>
              <button
                type="button"
                className={`answer-drop-zone${answer ? " filled" : ""}${selectedAnswer && !answer ? " ready" : ""}`}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
                onDrop={(event) => drop(event, item.id)}
                onClick={() => selectedAnswer ? assign(item.id, selectedAnswer) : answer ? onSelectAnswer(answer) : undefined}
                aria-label={answer ? `คำตอบ ${answer}` : `วางคำตอบของข้อ ${index + 1}`}
              >
                {answer ? <span draggable onDragStart={(event) => startDrag(event, answer)}>{answer}</span> : <em>วางคำตอบ</em>}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function exitTicketKey(index: number) {
  return `student-${index}`;
}

function normalizeExitTickets(initial: Record<string, ExitTicket>, team: TeamMember[]) {
  const normalized: Record<string, ExitTicket> = {};
  team.forEach((member, index) => {
    const key = exitTicketKey(index);
    const legacyTicket = initial[member.name];
    const ticket = initial[key] ?? legacyTicket;
    if (ticket) normalized[key] = ticket;
  });
  return normalized;
}

function ExitTicketScreen({ team, initial, onBack, onSaveDraft, onDone }: { team: TeamMember[]; initial: Record<string, ExitTicket>; onBack: () => void; onSaveDraft: (values: Record<string, ExitTicket>) => void; onDone: (values: Record<string, ExitTicket>) => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [values, setValues] = useState<Record<string, ExitTicket>>(() => normalizeExitTickets(initial, team));
  const [savedValues, setSavedValues] = useState<Record<string, ExitTicket>>(() => normalizeExitTickets(initial, team));
  const [selectedAnswers, setSelectedAnswers] = useState<Record<MatchField, string>>({ k: "", p: "" });
  const activeKey = exitTicketKey(activeIndex);
  const activeName = team[activeIndex]?.name ?? "นักเรียน";
  const current = values[activeKey] ?? EMPTY_EXIT_TICKET;
  const isTicketComplete = isStructuredExitTicketComplete;
  const complete = team.length > 0 && team.every((_, index) => {
    const key = exitTicketKey(index);
    return isTicketComplete(savedValues[key]) && exitTicketsAreEqual(values[key], savedValues[key]);
  });
  const currentReady = isTicketComplete(current);
  const savedCurrent = isTicketComplete(savedValues[activeKey]) && exitTicketsAreEqual(current, savedValues[activeKey]);
  const completedCount = team.filter((_, index) => isTicketComplete(savedValues[exitTicketKey(index)])).length;
  const update = (field: keyof ExitTicket, value: string) => {
    setValues((all) => ({ ...all, [activeKey]: { ...current, [field]: value } }));
  };
  const valueAnswer = readValueAnswer(current.v);
  const saveCurrent = () => {
    if (!currentReady) return;
    const nextDraftValues = { ...values, [activeKey]: current };
    const nextSavedValues = { ...savedValues, [activeKey]: current };
    setValues(nextDraftValues);
    setSavedValues(nextSavedValues);
    onSaveDraft(nextSavedValues);
    const nextStudentIndex = team.findIndex((_, index) => index !== activeIndex && !isTicketComplete(nextSavedValues[exitTicketKey(index)]));
    if (nextStudentIndex >= 0) setActiveIndex(nextStudentIndex);
  };
  const finish = () => {
    if (complete) onDone(savedValues);
  };
  useEffect(() => {
    const normalized = normalizeExitTickets(initial, team);
    setValues((currentValues) => ({ ...normalized, ...currentValues }));
    setSavedValues(normalized);
    setActiveIndex((index) => Math.min(index, Math.max(team.length - 1, 0)));
  }, [initial, team]);
  return (
    <div className="screen exit-ticket-screen">
      <img className="group-design-bg" src={asset("compression/lab_background.png")} alt="" />
      <button className="exit-back-button" onClick={onBack}>‹ ย้อนกลับ</button>
      <header className="exit-ticket-header">
        <h1>คำถามจากนักเรียนรายบุคคล</h1>
      </header>
      <section className="exit-ticket-layout">
        <aside className="student-tabs" aria-label="รายชื่อนักเรียน">
          <h2>👥 เลือกชื่อนักเรียน</h2>
          {team.map((member, index) => {
            const key = exitTicketKey(index);
            const done = isTicketComplete(savedValues[key]) && exitTicketsAreEqual(values[key], savedValues[key]);
            return <button key={`${index}-${member.name}`} className={activeIndex === index ? "active" : ""} onClick={() => { setActiveIndex(index); setSelectedAnswers({ k: "", p: "" }); }}><strong>{index + 1}</strong><img src={asset(`profiles/${member.avatar}.png`)} alt="" /><span>{member.name}</span><i>{done ? "✓" : ""}</i></button>;
          })}
          <div className="system-record-card">
            <b>▣ บันทึกของระบบ</b>
            <p>{complete ? "บันทึกครบทุกคนแล้ว ไปต่อได้เลย" : `บันทึกแล้ว ${completedCount}/${team.length} คน`}</p>
            <span>{complete ? "✓" : `${completedCount}/${team.length}`}</span>
          </div>
        </aside>
        <div className="kpv-card matching-kpv-card">
          <MatchingQuestion field="k" questionNumber={1} instruction="จากสถานการณ์ ให้จับคู่ปัญหาของกล่องพัสดุกับสมบัติของวัสดุที่ควรศึกษา" items={KNOWLEDGE_MATCHES} value={current.k} selectedAnswer={selectedAnswers.k} onSelectAnswer={(answer) => setSelectedAnswers((all) => ({ ...all, k: answer }))} onChange={(value) => update("k", value)} />
          <MatchingQuestion field="p" questionNumber={2} instruction="จากร่องรอยที่พบ ให้จับคู่ร่องรอยความเสียหายกับสาเหตุที่คาดว่าเกี่ยวข้อง" items={PROCESS_MATCHES} value={current.p} selectedAnswer={selectedAnswers.p} onSelectAnswer={(answer) => setSelectedAnswers((all) => ({ ...all, p: answer }))} onChange={(value) => update("p", value)} />
          <section className="value-question">
            <header><strong>3</strong><h2><span>ข้อที่ 3</span> ถ้ากล่องแข็งแรง แต่ใช้วัสดุมากเกินความจำเป็นและมีน้ำหนักมาก กล่องนั้นเหมาะสมหรือไม่ เพราะเหตุใด</h2></header>
            <div className="value-answer-controls">
              <div className="value-choice" role="group" aria-label="เลือกความเหมาะสม">
                {["เหมาะสม", "ไม่เหมาะสม"].map((choice) => <button type="button" key={choice} aria-pressed={valueAnswer.choice === choice} onClick={() => update("v", writeValueAnswer(choice, valueAnswer.reason))}>{valueAnswer.choice === choice ? "✓ " : ""}{choice}</button>)}
              </div>
              <label><span>อธิบายเหตุผล</span><textarea value={valueAnswer.reason} maxLength={240} onChange={(event) => update("v", writeValueAnswer(valueAnswer.choice, event.target.value))} placeholder="พิมพ์เหตุผลของนักเรียนที่นี่..." /></label>
            </div>
          </section>
          <div className="kpv-actions">
            <span>{activeName} · {savedCurrent ? "บันทึกแล้ว" : currentReady ? "พร้อมบันทึก" : "ตอบให้ครบทั้ง 3 ข้อก่อนบันทึก"}</span>
            <button className="button button-orange" disabled={!currentReady} onClick={saveCurrent}>บันทึกคำตอบคนนี้</button>
            {complete && <button className="button button-orange system-continue-button" onClick={finish}>ไปต่อ</button>}
          </div>
        </div>
      </section>
    </div>
  );
}

function TestHub({ onStart }: { onStart: () => void }) {
  return (
    <div className="screen test-hub-screen">
      <img className="group-design-bg" src={asset("compression/lab_background.png")} alt="" />
      <header className="test-hub-header">
        <span>ตอนที่ 2</span>
        <div><h1>ห้องทดสอบวัสดุ</h1><p>ทดลองทั้ง 3 ห้องก่อนตัดสินใจเลือกวัสดุสำหรับกล่อง</p></div>
      </header>
      <section className="test-room-grid" aria-label="ห้องทดสอบทั้งหมด">
        <article><span>01</span><h2>ห้องทดสอบแรงกด</h2><p>เพิ่มน้ำหนัก 1-3 ขวด แล้วดูการยุบและคืนตัว</p></article>
        <article><span>02</span><h2>ห้องทดสอบการดูดซับน้ำ</h2><p>หยดน้ำทีละระดับ แล้วดูว่าน้ำซึมเข้าเนื้อวัสดุหรือไม่</p></article>
        <article><span>03</span><h2>ห้องทดสอบความยืดหยุ่น</h2><p>ดึงวัสดุเท่า ๆ กัน แล้วดูว่าคืนรูปเดิมได้มากแค่ไหน</p></article>
      </section>
      <button className="button button-orange test-hub-start" onClick={onStart}>เริ่มทดสอบห้องที่ 1</button>
    </div>
  );
}

function CompressionLab({ save, onSave, onDone }: { save: GameSave; onSave: (r: Record<string, CompressionResult>, index: number) => void; onDone: () => void }) {
  const material = MATERIALS[Math.min(save.compressionIndex, MATERIALS.length - 1)];
  const [bottles, setBottles] = useState(0);
  const [released, setReleased] = useState(false);
  const sag = released ? material.residual : bottles ? material.sag[bottles - 1] : 0;
  const frameKey: CompressionFrameKey = released ? "released" : bottles === 0 ? "idle" : `load${bottles}` as CompressionFrameKey;
  const plateDrop = sag * .9375;
  const visibleBottles = released ? 0 : bottles;
  const selector = MATERIALS.slice(save.compressionIndex, save.compressionIndex + 3);
  const motionStyle = {
    "--material-motion-duration": `${released ? material.motion.releaseMs : material.motion.loadMs}ms`,
    "--material-motion-easing": material.motion.easing,
  } as CSSProperties;

  useEffect(() => {
    const nextMaterial = MATERIALS[save.compressionIndex + 1];
    [material, nextMaterial].filter((item): item is typeof material => Boolean(item)).forEach((item) => {
      COMPRESSION_FRAME_KEYS.forEach((key) => {
        const image = new Image();
        image.src = asset(`compression/materials/${item.testFrames[key]}`);
      });
    });
  }, [material, save.compressionIndex]);

  const addBottle = () => { if (bottles < 3 && !released) { setBottles((n) => n + 1); playSound("06_box_impact.ogg", save.audio); } };
  const reset = () => { setBottles(0); setReleased(false); };
  const action = () => {
    if (bottles < 3) return;
    if (!released) { setReleased(true); playSound("08_handoff.ogg", save.audio); return; }
    const result: CompressionResult = { materialId: material.id, measurements: [...material.sag], residual: material.residual, recovered: material.sag[2] - material.residual };
    const all = { ...save.compressionResults, [material.id]: result };
    const next = save.compressionIndex + 1;
    onSave(all, next);
    reset();
    if (next >= MATERIALS.length) onDone();
  };
  return (
    <div className="screen compression-screen">
      <img className="compression-bg" src={asset("compression/lab_background.png")} alt="ห้องทดลอง" />
      <div className="compression-wash" />
      <header className="compression-title"><span>ขั้นที่ 6/9</span><div><h1>ทดลองแรงกด</h1><p>เพิ่มน้ำหนัก แล้วดูว่ายุบแค่ไหน</p></div></header>
      <aside className="material-rail">
        {selector.map((item, slot) => <article className={`material-tile ${slot === 0 ? "active" : ""}`} key={item.id}><img src={asset(`materials/${item.image}`)} alt={item.name} /><span>{item.name}</span></article>)}
      </aside>
      <section className={`compression-machine effect-${material.motion.releaseEffect}`} style={motionStyle} aria-label="แท่นทดสอบแรงกด">
        <div className="bottles" style={{ top: `${3.5 + plateDrop}%` }}>{Array.from({ length: visibleBottles }, (_, i) => <img key={i} src={asset("compression/water_bottle.png")} alt="ขวดน้ำหนัก 500 กรัม" />)}</div>
        <div className="plate plate-top" style={{ top: `${44 + plateDrop}%` }} />
        <div className={`material-sprite-stack ${released ? "is-released" : ""}`}>
          {COMPRESSION_FRAME_KEYS.map((key) => {
            const active = key === frameKey;
            return <img key={key} className={`material-sprite ${active ? "active" : ""}`} src={asset(`compression/materials/${material.testFrames[key]}`)} alt={active ? `${material.name} สถานะยุบ ${sag} มิลลิเมตร` : ""} aria-hidden={!active} />;
          })}
        </div>
        <div className="plate plate-bottom" />
        <div className="ruler"><span className="ruler-body">{[0, 5, 10, 15, 20].map((n) => <i key={n} style={{ top: `${n * 5}%` }}>{n}</i>)}</span></div>
        <div className="measure-arrow" style={{ top: "56.5%", height: `${Math.max(1.5, plateDrop)}%` }}><b>{sag} มม.</b></div>
      </section>
      <aside className="measurement-card">
        <h2>ผลที่วัดได้</h2>
        <ResultBox tone="blue" icon="▣" value={`${visibleBottles} ขวด`} />
        <ResultBox tone="pink" icon="↓" value={`${sag} มม.`} />
        <ResultBox tone="green" icon="↻" value={released ? `คืน ${material.sag[2] - material.residual} มม.` : "รอดูการคืนตัว"} />
        <p className={`recovery-note ${released ? "shown" : ""}`}>{released ? `${material.releaseSummary} · เหลือรอยยุบ ${material.residual} มม.` : "ยกขวดออกเพื่อดูว่าวัสดุคืนตัวแค่ไหน"}</p>
        <small className="simulation-note">ชิ้นทดสอบเริ่มสูงเท่ากัน 20 มม. · 1 ขวด = 500 กรัม · ค่าจำลองเพื่อเปรียบเทียบ</small>
      </aside>
      <footer className="compression-actions">
        <button className="button button-yellow" disabled={bottles >= 3 || released} onClick={addBottle}>＋ เพิ่มขวด</button>
        <button className="button button-white" onClick={reset}>↶ เริ่มใหม่</button>
        <div className="test-stars">{[1, 2, 3].map((n) => <span className={bottles >= n ? "filled" : ""} key={n}>☆</span>)}</div>
        <button className="button button-orange record-button" disabled={bottles < 3} onClick={action}>{released ? "▣ บันทึกผล" : "ยกขวดออก"}</button>
      </footer>
    </div>
  );
}

function AbsorptionLab({ save, onSave, onDone }: { save: GameSave; onSave: (r: Record<string, WaterAbsorptionResult>, index: number) => void; onDone: () => void }) {
  const material = MATERIALS[Math.min(save.absorptionIndex, MATERIALS.length - 1)];
  const [drops, setDrops] = useState(0);
  const absorbed = drops ? material.waterDrops[drops - 1] : 0;
  const selector = MATERIALS.slice(save.absorptionIndex, save.absorptionIndex + 3);
  const wetLevel = drops ? Math.min(100, 18 + absorbed * 6) : 0;
  const addDrop = () => {
    if (drops < 3) {
      setDrops((value) => value + 1);
      playSound("04_rain.ogg", save.audio);
    }
  };
  const reset = () => setDrops(0);
  const record = () => {
    if (drops < 3) return;
    const result: WaterAbsorptionResult = { materialId: material.id, drops: [...material.waterDrops], absorbed: material.waterDrops[2], summary: material.waterSummary };
    const next = save.absorptionIndex + 1;
    onSave({ ...save.absorptionResults, [material.id]: result }, next);
    reset();
    if (next >= MATERIALS.length) onDone();
  };
  return (
    <div className="screen simple-lab-screen water-lab-screen">
      <img className="compression-bg" src={asset("compression/lab_background.png")} alt="" />
      <header className="compression-title"><span>ตอนที่ 2 · ห้อง 2/3</span><div><h1>ทดสอบการดูดซับน้ำ</h1><p>หยดน้ำเท่ากัน แล้วดูว่าวัสดุดูดน้ำมากแค่ไหน</p></div></header>
      <aside className="material-rail">{selector.map((item, slot) => <article className={`material-tile ${slot === 0 ? "active" : ""}`} key={item.id}><img src={asset(`materials/${item.image}`)} alt={item.name} /><span>{item.name}</span></article>)}</aside>
      <section className="simple-test-stage" aria-label="แท่นทดสอบการดูดซับน้ำ">
        <div className="drop-cloud">{Array.from({ length: drops }, (_, index) => <span key={index}>●</span>)}</div>
        <div className="sample-card">
          <img src={asset(`materials/${material.image}`)} alt={material.name} />
          <div className="wet-overlay" style={{ opacity: wetLevel / 100 }} />
        </div>
        <div className="water-meter"><i style={{ height: `${wetLevel}%` }} /><b>{absorbed} หน่วย</b></div>
      </section>
      <aside className="measurement-card simple-result-card">
        <h2>{material.name}</h2>
        <ResultBox tone="blue" icon="●" value={`${drops} หยด`} />
        <ResultBox tone="pink" icon="↓" value={`${absorbed} หน่วย`} />
        <p className="recovery-note shown">{drops === 3 ? material.waterSummary : "เพิ่มหยดน้ำให้ครบ 3 ครั้งเพื่อเปรียบเทียบ"}</p>
        <small className="simulation-note">ค่าดูดซับน้ำเป็นค่าจำลองเพื่อเปรียบเทียบในชั้นเรียน</small>
      </aside>
      <footer className="compression-actions">
        <button className="button button-yellow" disabled={drops >= 3} onClick={addDrop}>＋ เพิ่มหยดน้ำ</button>
        <button className="button button-white" onClick={reset}>↶ เริ่มใหม่</button>
        <div className="test-stars">{[1, 2, 3].map((n) => <span className={drops >= n ? "filled" : ""} key={n}>☆</span>)}</div>
        <button className="button button-orange record-button" disabled={drops < 3} onClick={record}>▣ บันทึกผล</button>
      </footer>
    </div>
  );
}

function ElasticityLab({ save, onSave, onDone }: { save: GameSave; onSave: (r: Record<string, ElasticityResult>, index: number) => void; onDone: () => void }) {
  const material = MATERIALS[Math.min(save.elasticityIndex, MATERIALS.length - 1)];
  const [pulls, setPulls] = useState(0);
  const [released, setReleased] = useState(false);
  const stretch = released ? material.elasticityResidual : pulls ? material.elasticityStretch[pulls - 1] : 0;
  const selector = MATERIALS.slice(save.elasticityIndex, save.elasticityIndex + 3);
  const stretchScale = 1 + stretch / 45;
  const pull = () => {
    if (pulls < 3 && !released) {
      setPulls((value) => value + 1);
      playSound("07_paper_friction.ogg", save.audio);
    }
  };
  const reset = () => { setPulls(0); setReleased(false); };
  const action = () => {
    if (pulls < 3) return;
    if (!released) {
      setReleased(true);
      playSound("10_idea_chime.ogg", save.audio);
      return;
    }
    const result: ElasticityResult = { materialId: material.id, stretch: [...material.elasticityStretch], residual: material.elasticityResidual, recovered: material.elasticityStretch[2] - material.elasticityResidual, summary: material.elasticitySummary };
    const next = save.elasticityIndex + 1;
    onSave({ ...save.elasticityResults, [material.id]: result }, next);
    reset();
    if (next >= MATERIALS.length) onDone();
  };
  return (
    <div className="screen simple-lab-screen elasticity-lab-screen">
      <img className="compression-bg" src={asset("compression/lab_background.png")} alt="" />
      <header className="compression-title"><span>ตอนที่ 2 · ห้อง 3/3</span><div><h1>ทดสอบความยืดหยุ่น</h1><p>ดึงวัสดุเท่า ๆ กัน แล้วดูว่าคืนรูปได้มากแค่ไหน</p></div></header>
      <aside className="material-rail">{selector.map((item, slot) => <article className={`material-tile ${slot === 0 ? "active" : ""}`} key={item.id}><img src={asset(`materials/${item.image}`)} alt={item.name} /><span>{item.name}</span></article>)}</aside>
      <section className="simple-test-stage" aria-label="แท่นทดสอบความยืดหยุ่น">
        <div className="pull-handle left">←</div>
        <div className={`elastic-sample ${released ? "released" : ""}`} style={{ transform: `scaleX(${stretchScale})` }}>
          <img src={asset(`materials/${material.image}`)} alt={material.name} />
        </div>
        <div className="pull-handle right">→</div>
        <div className="stretch-ruler"><span style={{ width: `${Math.max(4, stretch * 3)}%` }} /><b>{stretch} มม.</b></div>
      </section>
      <aside className="measurement-card simple-result-card">
        <h2>{material.name}</h2>
        <ResultBox tone="blue" icon="↔" value={`${pulls} ครั้ง`} />
        <ResultBox tone="pink" icon="＋" value={`${stretch} มม.`} />
        <ResultBox tone="green" icon="↻" value={released ? `คืน ${material.elasticityStretch[2] - material.elasticityResidual} มม.` : "รอดูการคืนตัว"} />
        <p className={`recovery-note ${released ? "shown" : ""}`}>{released ? material.elasticitySummary : "ดึงครบ 3 ครั้ง แล้วปล่อยเพื่อดูการคืนตัว"}</p>
        <small className="simulation-note">ค่าความยืดหยุ่นเป็นค่าจำลองเพื่อเปรียบเทียบในชั้นเรียน</small>
      </aside>
      <footer className="compression-actions">
        <button className="button button-yellow" disabled={pulls >= 3 || released} onClick={pull}>＋ ดึงวัสดุ</button>
        <button className="button button-white" onClick={reset}>↶ เริ่มใหม่</button>
        <div className="test-stars">{[1, 2, 3].map((n) => <span className={pulls >= n ? "filled" : ""} key={n}>☆</span>)}</div>
        <button className="button button-orange record-button" disabled={pulls < 3} onClick={action}>{released ? "▣ บันทึกผล" : "ปล่อยมือ"}</button>
      </footer>
    </div>
  );
}

function ResultBox({ tone, icon, value }: { tone: string; icon: string; value: string }) {
  return <div className={`result-box ${tone}`}><span>{icon}</span><b>{value}</b></div>;
}

function Recap({ index, onIndex, onDone }: { index: number; onIndex: (n: number) => void; onDone: () => void }) {
  const [message, setMessage] = useState("เลือกคำตอบของทีม");
  const item = RECAP[index];
  const choose = (choice: number) => {
    if (choice !== item.answer) { setMessage("ลองคิดจากสิ่งที่เพิ่งทดลองอีกครั้งนะ"); return; }
    setMessage("ถูกต้อง!");
    setTimeout(() => { setMessage("เลือกคำตอบของทีม"); if (index >= RECAP.length - 1) onDone(); else onIndex(index + 1); }, 500);
  };
  return <div className="screen recap-screen"><div className="quiz-card"><div className="step-pill">ขั้นที่ 7/9 · ทบทวน {index + 1}/{RECAP.length}</div><h1>{item.question}</h1><div className="quiz-choices">{item.choices.map((choice, i) => <button key={choice} onClick={() => choose(i)}>{choice}</button>)}</div><p>{message}</p></div></div>;
}

function Prediction({ labsEnabled, values, compressionResults, absorptionResults, elasticityResults, onChange, onDone }: { labsEnabled: boolean; values: Record<string, string>; compressionResults: Record<string, CompressionResult>; absorptionResults: Record<string, WaterAbsorptionResult>; elasticityResults: Record<string, ElasticityResult>; onChange: (v: Record<string, string>) => void; onDone: () => void }) {
  const complete = BOX_PARTS.every((part) => values[part]);
  return <div className="screen prediction-screen"><header><span>เลือกวัสดุ</span><div><h1>ทีมเราจะเลือกวัสดุอะไร?</h1><p>{labsEnabled ? "ใช้ผลที่วัดได้ช่วยตัดสินใจ ไม่มีคำตอบผิด" : "ห้องทดลองปิดชั่วคราว เลือกวัสดุจากการสำรวจตอนที่ 1 ได้เลย"}</p></div></header><div className="prediction-list">{BOX_PARTS.map((part) => {
    const selected = MATERIALS.find((m) => m.id === values[part]);
    const compression = selected ? compressionResults[selected.id] : undefined;
    const absorption = selected ? absorptionResults[selected.id] : undefined;
    const elasticity = selected ? elasticityResults[selected.id] : undefined;
    const report = !selected
      ? "รอเลือกวัสดุ"
      : !labsEnabled
        ? "เลือกไว้แล้ว · ห้องทดลองปิดชั่วคราว"
        : compression && absorption && elasticity
      ? `กด: ยุบ ${compression.measurements[2]} มม. · น้ำ: ซึม ${absorption.absorbed} หน่วย · ยืด: คืน ${elasticity.recovered} มม.`
      : "รอเลือกวัสดุ";
    return <label key={part}><b>{part}</b><select value={values[part] ?? ""} onChange={(event) => onChange({ ...values, [part]: event.target.value })}><option value="">เลือกวัสดุ</option>{MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><span>{report}</span></label>;
  })}</div><button className="button button-orange prediction-done" disabled={!complete} onClick={onDone}>บันทึกคำตอบทีม</button></div>;
}

function Summary({ save, onReplay, onReset }: { save: GameSave; onReplay: () => void; onReset: () => void }) {
  const names = save.team.map((m) => m.name).join(" · ");
  return <div className="screen summary-screen"><div className="summary-card"><div className="step-pill">จบกิจกรรมคาบที่ 1</div><div className="medal">🔎</div><h1>วิเคราะห์ปัญหาและกำหนดสมบัติที่ต้องศึกษาเรียบร้อยแล้ว</h1><p>{names}</p><section className="summary-next-lesson"><span>คาบต่อไป</span><h2>เราจะทดสอบสมบัติของวัสดุทั้ง 3 ด้าน</h2></section><div className="summary-actions"><button className="button button-yellow" onClick={onReplay}>เริ่มภารกิจรอบใหม่</button><button className="button button-white" onClick={onReset}>กลับหน้าปก</button></div></div></div>;
}
