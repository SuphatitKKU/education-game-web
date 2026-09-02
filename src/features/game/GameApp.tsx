"use client";

import { readValueAnswer, writeValueAnswer } from "./exit-ticket-values";

import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  AVATARS, BOX_PARTS, DAMAGE_CAUSES, DAMAGES, EMPTY_SAVE, MATERIALS, RECAP, STORY,
  type CompressionResult, type DamageCause, type ElasticityResult, type ExitTicket, type GameSave, type Stage, type TeamMember, type WaterAbsorptionResult,
} from "./data";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { hasLegacyData, markLegacyImported, markSupabaseCacheBound, readLegacyBundle, wasLegacyImported } from "@/features/tracking/legacy";
import {
  createTeam,
  flushOutbox,
  importLegacyBundle,
  listTeams,
  RevisionConflictError,
  queueCheckpoint,
  readOutbox,
  startOrResumeRun,
  updateTeamMembers,
} from "@/features/tracking/persistence";
import { STAGE_LABELS, stageProgress } from "@/features/tracking/progress";
import type { ActiveRunRef, LegacyBundle, SaveIndicator, TeamOverview } from "@/features/tracking/types";
import { answerEvents } from "@/features/tracking/answer-events";
import { validateTeamDraft } from "@/features/tracking/validation";
import { allLabsComplete, LAB_MATERIALS, LAB_ROOMS, LAB_ROOMS_ENABLED, LAB_STAGES, labResultCount, openLabPatch, type LabRoom } from "./labs";
import { STUDY_TOPICS, studyTopicLabel } from "./learning-topics";
import { CompressionLab } from "./CompressionLab";
import { ImpactLab } from "./ImpactLab";
import { AbsorptionLab } from "./AbsorptionLab";
import { resumeLabStage } from "./impact";
import { MissionOverview, type MissionNumber } from "./MissionOverview";
import { attendingMembers, exitTicketKey, reconcileExitTickets } from "./team-attendance";
import {
  BubbleWrapContinuousZoom,
  CardboardContinuousZoom,
  CorrugatedContinuousZoom,
  FoamContinuousZoom,
  MATERIAL_MICROSCOPES,
  MaterialMicroscope,
  materialScaleForZoom,
  PeSheetContinuousZoom,
  type MaterialMicroscopeId,
  type MaterialScale,
  type MicroscopeFeature,
} from "./MaterialMicroscope";

const SAVE_KEY = "parcel-lab-web-save-v1";
const STATS_KEY = "parcel-lab-group-design-statistics-v1";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const PREDICTION_ENABLED = false;
const DISABLED_LAB_STAGES = new Set<Stage>(LAB_STAGES);
const MISSION_ONE_BIG_QUESTION_PROGRESS = "เราทราบแล้วว่าต้องศึกษาสมบัติ 3 ด้าน แต่ยังไม่ทราบว่าวัสดุชนิดใดเหมาะกับแต่ละหน้าที่";

const MISSION_ONE_PHASES: Partial<Record<Stage, { step: number; label: string; icon: string }>> = {
  mission: { step: 1, label: "เกริ่นภารกิจ", icon: "🗺️" },
  story: { step: 2, label: "ติดตามสถานการณ์ 9 ฉาก", icon: "🎬" },
  inspection: { step: 3, label: "สำรวจร่องรอย", icon: "🔎" },
  materials: { step: 4, label: "สำรวจวัสดุ", icon: "🧱" },
  studyFocus: { step: 5, label: "เลือกสมบัติที่ต้องศึกษา", icon: "⭐" },
  exitTicket: { step: 6, label: "คำถามรายบุคคล", icon: "✏️" },
  mission1Complete: { step: 7, label: "ทำภารกิจสำเร็จ", icon: "🎉" },
};

function createRunId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function asset(path: string) {
  return `${BASE_PATH}/assets/${path}`;
}

function resumableStage(stage: Stage): Stage {
  return stage === "menu" || stage === "overview" || stage === "team" ? "mission" : resumeLabStage(stage);
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

const STORY_SOUND_BY_IMAGE: Record<string, string> = {
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

const storyAudioCache = new Map<string, HTMLAudioElement>();
let activeStoryAudio: HTMLAudioElement | null = null;
let activeStorySoundName = "";

function getStoryAudio(name: string) {
  const cached = storyAudioCache.get(name);
  if (cached) return cached;
  const clip = new Audio(asset(`audio/${name}`));
  clip.preload = "auto";
  clip.volume = 0.55;
  clip.load();
  storyAudioCache.set(name, clip);
  return clip;
}

function preloadStorySounds() {
  Object.values(STORY_SOUND_BY_IMAGE).forEach((name) => getStoryAudio(name));
}

function stopStorySound() {
  if (activeStoryAudio) {
    activeStoryAudio.pause();
    activeStoryAudio.currentTime = 0;
  }
  activeStoryAudio = null;
  activeStorySoundName = "";
}

async function playStorySound(name: string, enabled: boolean) {
  stopStorySound();
  if (!enabled) return;
  const clip = getStoryAudio(name);
  activeStoryAudio = clip;
  activeStorySoundName = name;
  clip.currentTime = 0;
  try {
    await clip.play();
  } catch {
    if (activeStoryAudio === clip) stopStorySound();
  }
}

export function GameApp() {
  const [save, setSave] = useState<GameSave>(EMPTY_SAVE);
  const [loaded, setLoaded] = useState(false);
  const [labPreview, setLabPreview] = useState(false);
  const [selectedMission, setSelectedMission] = useState<MissionNumber>(1);
  const [animateMission2Unlock, setAnimateMission2Unlock] = useState(false);
  const [activeRun, setActiveRun] = useState<ActiveRunRef | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<TeamOverview | null>(null);
  const [saveIndicator, setSaveIndicator] = useState<SaveIndicator>("idle");
  const [legacyBundle, setLegacyBundle] = useState<LegacyBundle>({ save: null, statistics: [] });
  const bgmRef = useRef<HTMLAudioElement>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const syncTimerRef = useRef<number | undefined>(undefined);
  const completedRunRef = useRef<string | null>(null);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("preview") === "mission1-complete") {
      setSave({ ...EMPTY_SAVE, stage: "mission1Complete", mission1Completed: true, bigQuestionProgress: { mission1: MISSION_ONE_BIG_QUESTION_PROGRESS } });
      setLoaded(true);
      return;
    }
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
          stage: !PREDICTION_ENABLED && restoredStage === "prediction" ? "summary" : resumeLabStage(restoredStage),
          studyFocus: parsed.studyFocus ?? { compression: true, water: true, elasticity: true },
        });
      } catch { /* keep fresh save */ }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    const isPreview = new URLSearchParams(window.location.search).get("preview") === "mission1-complete";
    if (loaded && !isPreview) localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }, [loaded, save]);

  const syncAnswers = async (runId?: string) => {
    try {
      const persisted = await flushOutbox(runId);
      if (!persisted || activeRunIdRef.current !== persisted.id) return;
      setActiveRun({ id: persisted.id, teamId: persisted.teamId, revision: persisted.revision });
      if (persisted.status === "completed") completedRunRef.current = persisted.id;
      setSaveIndicator(readOutbox().some((item) => item.run.id === persisted.id) ? "saving" : "saved");
    } catch (error) {
      if (!runId || activeRunIdRef.current === runId) setSaveIndicator(error instanceof RevisionConflictError ? "conflict" : "offline");
    }
  };

  useEffect(() => {
    if (!configured) return;
    const retry = () => { void syncAnswers(activeRunIdRef.current ?? undefined); };
    const timer = window.setInterval(retry, 10000);
    window.addEventListener("online", retry);
    window.addEventListener("pagehide", retry);
    retry();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", retry);
      window.removeEventListener("pagehide", retry);
    };
  }, [configured]);

  const patch = (next: Partial<GameSave>) => {
    const current = saveRef.current;
    const merged = { ...current, ...next };
    saveRef.current = merged;
    setSave(merged);
    if (!activeRun || completedRunRef.current === activeRun.id || ["menu", "overview", "team"].includes(merged.stage)) return;
    const events = answerEvents(current, next);
    try {
      queueCheckpoint(activeRun, merged, events, merged.stage === "mission1Complete" || merged.stage === "summary");
      setSaveIndicator("saving");
    } catch {
      setSaveIndicator("offline");
    }
    // Durable queue is written synchronously above. Debounce only the network.
    window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => { void syncAnswers(activeRun.id); }, 350);
  };
  const go = (stage: Stage) => patch({ stage });
  const toggleAudio = () => {
    const nextAudio = !save.audio;
    patch({ audio: nextAudio });
    if (nextAudio) void bgmRef.current?.play().catch(() => undefined);
  };
  const reset = () => {
    if (!configured) localStorage.removeItem(SAVE_KEY);
    activeRunIdRef.current = null;
    setActiveRun(null);
    setSelectedTeam(null);
    setSave(EMPTY_SAVE);
  };
  const leaveRunToTeams = () => {
    activeRunIdRef.current = null;
    setActiveRun(null);
    setSelectedTeam(null);
    setSave((current) => ({ ...current, stage: "team" }));
  };
  const openTeam = async (team: TeamOverview) => {
    // Finish/recover this team's durable queue before loading server state.
    for (const queued of readOutbox().filter((item) => item.run.teamId === team.id)) await flushOutbox(queued.run.id);
    const sessionMembers = attendingMembers(team.members);
    if (!sessionMembers.length) throw new Error("เลือกสมาชิกที่มาเรียนอย่างน้อย 1 คน");
    const attendingTeam = { ...team, members: sessionMembers };
    const run = await startOrResumeRun(attendingTeam);
    const exitTickets = reconcileExitTickets(run.saveState.team ?? [], sessionMembers, run.saveState.exitTickets ?? {});
    const serverState = { ...EMPTY_SAVE, ...run.saveState, team: sessionMembers, exitTickets, stage: run.currentStage };
    const restored = { ...serverState, stage: selectedMission === 2 ? "testHub" as const : resumableStage(run.currentStage) };
    setSelectedTeam(team);
    activeRunIdRef.current = run.id;
    setActiveRun({ id: run.id, teamId: run.teamId, revision: run.revision });
    completedRunRef.current = null;
    markSupabaseCacheBound();
    setSave(restored);
    saveRef.current = restored;
    queueCheckpoint({ id: run.id, teamId: run.teamId, revision: run.revision }, restored);
    setSaveIndicator("saving");
    void syncAnswers(run.id);
  };
  const createAndOpenTeam = async (name: string, members: TeamMember[]) => {
    const team = await createTeam(name, members);
    await openTeam(team);
  };
  const updateExistingTeam = async (teamId: string, members: TeamMember[]) => updateTeamMembers(teamId, members);
  const importAndOpenTeam = async (name: string) => {
    const team = await importLegacyBundle(name, legacyBundle);
    markLegacyImported();
    setLegacyBundle({ save: null, statistics: [] });
    await openTeam(team);
  };
  const startNewAttempt = async () => {
    if (!configured || !selectedTeam) {
      patch({ ...EMPTY_SAVE, team: save.team, audio: save.audio, stage: "mission", runId: createRunId() });
      return;
    }
    const refreshed = (await listTeams()).find((team) => team.id === selectedTeam.id) ?? selectedTeam;
    await openTeam(refreshed);
  };
  const openMission = (mission: MissionNumber) => {
    setSelectedMission(mission);
    go("team");
  };
  const goBack = () => {
    if (labRoomsPaused) { go("exitTicket"); return; }
    if (save.stage === "overview") { go("menu"); return; }
    if (save.stage === "team") { go("overview"); return; }
    if (save.stage === "mission") { leaveRunToTeams(); return; }
    if (save.stage === "story") {
      if (save.storyIndex > 0) patch({ storyIndex: save.storyIndex - 1 });
      else go("mission");
      return;
    }
    if (save.stage === "inspection") { patch({ stage: "story", storyIndex: STORY.length - 1 }); return; }
    if (save.stage === "materials") { go("inspection"); return; }
    if (save.stage === "studyFocus") { go("materials"); return; }
    if (save.stage === "exitTicket") { go("studyFocus"); return; }
    if (save.stage === "testHub") { go("exitTicket"); return; }
    if (save.stage === "compression") { go("testHub"); return; }
    if (save.stage === "absorption" || save.stage === "impact" || save.stage === "elasticity") { go("testHub"); return; }
    if (save.stage === "recap") { go("testHub"); return; }
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
    playSound("10_idea_chime.ogg", save.audio);
    patch({ runId, exitTickets, mission1Completed: true, stage: "mission1Complete" });
  };
  const saveExitTicketDraft = (exitTickets: Record<string, ExitTicket>, exitTicketConfirmations: Record<string, ExitTicket>) => {
    patch({ runId: save.runId || createRunId(), exitTickets, exitTicketConfirmations });
  };
  const persistExitTicketAnswers = (exitTickets: Record<string, ExitTicket>) => {
    patch({ runId: save.runId || createRunId(), exitTickets });
  };
  const labRoomsPaused = !LAB_ROOMS_ENABLED && DISABLED_LAB_STAGES.has(save.stage);

  if (!loaded) return <main className="loading-screen">กำลังเตรียมห้องทดลอง…</main>;
  if (labPreview) return <LabPreview audio={save.audio} onClose={() => setLabPreview(false)} />;

  return (
    <main className="app-shell">
      <audio ref={bgmRef} className="game-bgm" src={asset("audio/happy_clappy_loop.ogg")} autoPlay loop muted={!save.audio} />
      <section className="game-frame" aria-live="polite">
        {save.stage === "menu" && <MainMenu onStart={() => go("overview")} onLabs={() => setLabPreview(true)} />}
        {save.stage === "overview" && <MissionOverview mission2Unlocked={save.mission1Completed} mission1Answer={save.bigQuestionProgress.mission1} animateMission2Unlock={animateMission2Unlock} onUnlockAnimationDone={() => setAnimateMission2Unlock(false)} onBack={() => go("menu")} onSelect={openMission} />}
        {labRoomsPaused && <LabRoomsPaused onContinue={() => go(PREDICTION_ENABLED ? "prediction" : "summary")} />}
        {!labRoomsPaused && save.stage === "team" && <TeamSetup initial={save.team} legacyBundle={legacyBundle} legacyAlreadyImported={wasLegacyImported()} onBack={() => go("overview")} onChoose={openTeam} onCreate={createAndOpenTeam} onUpdate={updateExistingTeam} onImport={importAndOpenTeam} onLocalDone={(team) => patch({ ...EMPTY_SAVE, team, audio: save.audio, runId: createRunId(), stage: selectedMission === 2 ? "testHub" : "mission" })} />}
        {!labRoomsPaused && save.stage === "mission" && <MissionRoute onBack={reset} onDone={() => {
          const firstScene = STORY[save.storyIndex] ?? STORY[0];
          void playStorySound(STORY_SOUND_BY_IMAGE[firstScene[0]], save.audio).then(() => go("story"));
        }} />}
        {!labRoomsPaused && save.stage === "story" && <ComicStory index={save.storyIndex} audio={save.audio} onIndex={(storyIndex) => patch({ storyIndex })} onDone={() => go("inspection")} />}
        {!labRoomsPaused && save.stage === "inspection" && <DamageInspection findings={save.inspectionFindings} audio={save.audio} onFinding={(inspectionFindings) => patch({ inspectionFindings })} onReset={() => patch({ inspectionFindings: {}, inspectionIndex: 0 })} onDone={() => go("materials")} />}
        {!labRoomsPaused && save.stage === "materials" && <MaterialGuide onBack={() => go("inspection")} onDone={() => go("studyFocus")} />}
        {!labRoomsPaused && save.stage === "studyFocus" && <StudyFocusScreen values={save.studyFocus} onBack={() => go("materials")} onChange={(studyFocus) => patch({ studyFocus })} onDone={() => patch({ stage: "exitTicket", bigQuestionProgress: { ...save.bigQuestionProgress, mission1: MISSION_ONE_BIG_QUESTION_PROGRESS } })} />}
        {!labRoomsPaused && save.stage === "exitTicket" && <ExitTicketScreen key={save.runId} team={save.team} initial={save.exitTickets} confirmations={save.exitTicketConfirmations} onBack={() => go("studyFocus")} onAnswerChange={persistExitTicketAnswers} onSaveDraft={saveExitTicketDraft} onDone={saveExitTickets} />}
        {!labRoomsPaused && save.stage === "mission1Complete" && <MissionOneComplete onHome={() => { setAnimateMission2Unlock(true); go("overview"); }} />}
        {!labRoomsPaused && <LabScreens save={save} onPatch={patch} onBack={leaveRunToTeams} onComplete={() => patch({ stage: "recap", recapIndex: 0 })} />}
        {!labRoomsPaused && save.stage === "recap" && <Recap index={save.recapIndex} answers={save.recapAnswers} onAnswer={(recapAnswers) => patch({ recapAnswers })} onIndex={(recapIndex) => patch({ recapIndex })} onDone={() => go(PREDICTION_ENABLED ? "prediction" : "summary")} />}
        {!labRoomsPaused && PREDICTION_ENABLED && save.stage === "prediction" && <Prediction labsEnabled={LAB_ROOMS_ENABLED} values={save.predictions} compressionResults={save.compressionResults} absorptionResults={save.absorptionResults} elasticityResults={save.elasticityResults} onChange={(predictions) => patch({ predictions })} onDone={() => go("summary")} />}
        {!labRoomsPaused && save.stage === "summary" && <Summary save={save} onReplay={() => void startNewAttempt()} onReset={reset} />}
        {(save.stage === "story" || save.stage === "inspection") && <button className="back-nav-button" onClick={(event) => { event.stopPropagation(); goBack(); }}>‹ ย้อนกลับ</button>}
        {MISSION_ONE_PHASES[save.stage] && <MissionOneProgress stage={save.stage} />}
        <button className="global-audio-button" aria-label={save.audio ? "ปิดเสียงเพลง" : "เปิดเสียงเพลง"} aria-pressed={save.audio} onClick={(event) => { event.stopPropagation(); toggleAudio(); }}>{save.audio ? "🔊" : "🔇"}</button>
        {configured && activeRun && <SaveStatusBadge status={saveIndicator} />}
      </section>
    </main>
  );
}

function MissionOneProgress({ stage }: { stage: Stage }) {
  const phase = MISSION_ONE_PHASES[stage];
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    if (!expanded) return;
    const timer = window.setTimeout(() => setExpanded(false), 3800);
    return () => window.clearTimeout(timer);
  }, [expanded, stage]);

  if (!phase) return null;
  const percent = Math.round((phase.step / 7) * 100);
  return (
    <aside className={`mission-one-progress mission-one-progress-${stage} ${expanded ? "is-expanded" : "is-collapsed"}`} role="status" aria-label={`ภารกิจที่ 1 ช่วงที่ ${phase.step} จาก 7 ${phase.label}`}>
      {expanded ? <div className="mission-one-progress-details">
        <div className="mission-one-progress-heading"><span>ภารกิจที่ 1</span><b>ช่วงที่ {phase.step}/7</b></div>
        <strong><span aria-hidden="true">{phase.icon}</span>{phase.label}</strong>
        <div className="mission-one-progress-track" role="progressbar" aria-label="ความคืบหน้าภารกิจที่ 1" aria-valuemin={1} aria-valuemax={7} aria-valuenow={phase.step}>
          <i style={{ width: `${percent}%` }} />
        </div>
      </div> : <button className="mission-one-progress-toggle" type="button" aria-label={`เปิดดูความคืบหน้า ช่วงที่ ${phase.step} จาก 7`} onClick={() => setExpanded(true)}>
        <span aria-hidden="true">•••</span>
      </button>}
    </aside>
  );
}

function MainMenu({ onStart, onLabs }: { onStart: () => void; onLabs: () => void }) {
  return (
    <div className="screen menu-screen">
      <img className="menu-cover" src={asset("menu/cover-labs.png")} alt="เด็ก ๆ กำลังออกแบบกล่องในห้องประดิษฐ์" />
      <div className="menu-glass">
        <p className="menu-kicker">ภารกิจนักออกแบบ</p>
        <h1>กล่องแกร่ง</h1>
        <p>คิด ทดลอง สร้างให้แกร่ง!</p>
        <button className="button button-orange menu-play" onClick={onStart}><span>▶</span> เริ่มภารกิจ</button>
        <a className="teacher-entry-link" href={`${BASE_PATH}/teacher/`}>▣ Dashboard สำหรับครู</a>
      </div>
    </div>
  );
}

function MissionOneComplete({ onHome }: { onHome: () => void }) {
  return (
    <div className="screen mission-complete-screen">
      <div className="mission-complete-rays" aria-hidden="true" />
      <div className="mission-complete-confetti" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
      </div>
      <section className="mission-complete-card" aria-labelledby="mission-complete-title">
        <span className="mission-complete-pill">✓ ภารกิจที่ 1 สำเร็จ</span>
        <div className="mission-complete-mascot-wrap" aria-hidden="true">
          <span>★</span><span>✦</span>
          <div className="mission-complete-mascot" style={{ backgroundImage: `url(${asset("mascot/parcel-guide-sprite.png")})` }} />
        </div>
        <p className="mission-complete-kicker">เก่งมาก นักสืบกล่องพัสดุ!</p>
        <h1 id="mission-complete-title">ทำภารกิจที่ 1 เสร็จแล้ว</h1>
        <p className="mission-complete-copy">ทุกคนสืบร่องรอยความเสียหาย สำรวจวัสดุ และตอบคำถามครบแล้ว</p>
        <div className="mission-complete-reward">
          <span aria-hidden="true">🔓</span>
          <div><b>รางวัลใหม่กำลังรออยู่</b><small>กลับไปที่หน้าภารกิจเพื่อปลดล็อกภารกิจที่ 2</small></div>
        </div>
        <button className="button button-orange mission-complete-home" type="button" onClick={onHome}>
          กลับหน้าภารกิจ <span aria-hidden="true">›</span>
        </button>
      </section>
    </div>
  );
}

type RosterDraftMember = TeamMember & { draftKey: string; present: boolean };

function TeamSetup({
  initial,
  legacyBundle,
  legacyAlreadyImported,
  onBack,
  onChoose,
  onCreate,
  onUpdate,
  onImport,
  onLocalDone,
}: {
  initial: TeamMember[];
  legacyBundle: LegacyBundle;
  legacyAlreadyImported: boolean;
  onBack: () => void;
  onChoose: (team: TeamOverview) => Promise<void>;
  onCreate: (name: string, team: TeamMember[]) => Promise<void>;
  onUpdate: (teamId: string, team: TeamMember[]) => Promise<TeamOverview>;
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
  const [editingTeam, setEditingTeam] = useState<TeamOverview | null>(null);
  const [rosterDraft, setRosterDraft] = useState<RosterDraftMember[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(isSupabaseConfigured());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const configured = isSupabaseConfigured();
  const validation = validateTeamDraft(teamName, members, configured);
  const valid = validation.valid;
  const update = (index: number, next: Partial<TeamMember>) => setMembers((current) => current.map((m, i) => i === index ? { ...m, ...next } : m));
  const attendanceKey = (member: TeamMember) => member.id ?? `${member.name}|${member.avatar}`;
  const isPresent = (teamId: string, member: TeamMember) => attendance[teamId]?.[attendanceKey(member)] !== false;
  const openRosterEditor = (team: TeamOverview) => {
    setError("");
    setEditingTeam(team);
    setRosterDraft(team.members.map((member, index) => ({
      ...member,
      draftKey: member.id ?? `member-${index}-${Date.now()}`,
      present: isPresent(team.id, member),
    })));
  };
  const updateRosterDraft = (draftKey: string, next: Partial<RosterDraftMember>) => setRosterDraft((current) => current.map((member) => member.draftKey === draftKey ? { ...member, ...next } : member));
  const rosterMembers = rosterDraft.map(({ draftKey: _draftKey, present: _present, ...member }, position) => ({ ...member, position }));
  const rosterValidation = validateTeamDraft(editingTeam?.name ?? "", rosterMembers, true);
  const rosterChanged = Boolean(editingTeam) && JSON.stringify(rosterMembers.map(({ id, name, avatar }) => ({ id, name: name.trim(), avatar }))) !== JSON.stringify(editingTeam?.members.map(({ id, name, avatar }) => ({ id, name, avatar })));
  const addRosterMember = () => {
    const avatar = AVATARS.find((item) => !rosterDraft.some((member) => member.avatar === item));
    if (!avatar || rosterDraft.length >= 7) return;
    setRosterDraft((current) => [...current, { draftKey: `new-${Date.now()}`, name: "", avatar, present: true }]);
  };
  const saveRosterEditor = async () => {
    if (!editingTeam || !rosterValidation.valid || !rosterDraft.some((member) => member.present)) return;
    setBusy(true);
    setError("");
    try {
      const savedTeam = rosterChanged ? await onUpdate(editingTeam.id, rosterMembers) : editingTeam;
      const nextAttendance: Record<string, boolean> = {};
      savedTeam.members.forEach((member) => {
        const draft = rosterDraft.find((item) => item.id === member.id)
          ?? rosterDraft.find((item) => item.name.trim() === member.name && item.avatar === member.avatar);
        nextAttendance[attendanceKey(member)] = draft?.present !== false;
      });
      setAttendance((current) => ({ ...current, [editingTeam.id]: nextAttendance }));
      if (rosterChanged) await refresh();
      setEditingTeam(null);
    } catch (nextError) {
      setError(userFacingError(nextError, "บันทึกรายชื่อสมาชิกไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  };
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
        <button className="button button-yellow compact" disabled={busy} onClick={onBack}>‹ กลับหน้าภารกิจ</button>
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
            const findingCount = Object.keys(run?.saveState.inspectionFindings ?? {}).length;
            const presentCount = team.members.filter((member) => isPresent(team.id, member)).length;
            const sessionTeam = { ...team, members: team.members.map((member) => ({ ...member, present: isPresent(team.id, member) })) };
            return <article className="existing-team-card" key={team.id}>
              <header><div className="team-avatar-stack">{team.members.slice(0, 4).map((member) => <img className={isPresent(team.id, member) ? "" : "is-absent"} key={member.id ?? member.name} src={asset(`profiles/${member.avatar}.png`)} alt="" />)}</div><span className={active ? "status-active" : "status-ready"}>{active ? "กำลังทำ" : "พร้อมเริ่ม"}</span></header>
              <h2>{team.name}</h2>
              <p>{team.members.map((member) => member.name).join(" · ")}</p>
              <div className="team-attendance-summary"><b>มาเรียน {presentCount}/{team.members.length} คน</b><span>{presentCount === team.members.length ? "มาครบ" : `ขาด ${team.members.length - presentCount} คน`}</span></div>
              <div className="team-card-progress"><i style={{ width: `${run ? stageProgress(run.currentStage) : 0}%` }} /></div>
              <small>{run ? `${STAGE_LABELS[run.currentStage]} · อัปเดต ${new Date(run.updatedAt).toLocaleString("th-TH")}` : "ยังไม่เคยทำภารกิจ"}</small>
              {run && <small className="team-card-answer-summary">คำตอบจากกล่อง 3 มิติ {findingCount}/{DAMAGES.length} ร่องรอย</small>}
              <footer>
                <button className="manage-team-button" disabled={busy} onClick={() => openRosterEditor(team)}>⚙ จัดการสมาชิก</button>
                <button className="history-button" disabled={!team.runs.length} onClick={() => setHistoryTeam(team)}>ดูคำตอบ ({team.runs.length})</button>
                <button className="resume-button" disabled={busy || presentCount === 0} onClick={() => void runAction(() => onChoose(sessionTeam))}>{active ? "▶ ทำภารกิจต่อ" : "เริ่มภารกิจใหม่"}</button>
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

      {editingTeam && (
        <div className="team-editor-backdrop" role="presentation" onClick={() => !busy && setEditingTeam(null)}>
          <section className="team-editor-modal" role="dialog" aria-modal="true" aria-labelledby="team-editor-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><span>👥 ทีมเดิม</span><h2 id="team-editor-title">จัดการสมาชิก · {editingTeam.name}</h2><p>แก้ไขสมาชิก 6–7 คน และเลือกผู้ที่มาเรียนวันนี้</p></div>
              <button type="button" aria-label="ปิดหน้าจัดการสมาชิก" disabled={busy} onClick={() => setEditingTeam(null)}>×</button>
            </header>
            {editingTeam.activeRun && <div className="team-editor-notice">แก้ไขรายชื่อได้เลย คำตอบที่บันทึกไว้ของสมาชิกเดิมจะยังอยู่</div>}
            {error && <div className="team-editor-error" role="alert">{error}</div>}
            <div className="team-editor-list">
              {rosterDraft.map((member, index) => (
                <article className={member.present ? "is-present" : "is-absent"} key={member.draftKey}>
                  <strong>{index + 1}</strong>
                  <label className="team-editor-avatar">
                    <img src={asset(`profiles/${member.avatar}.png`)} alt="" />
                    <select aria-label={`ตัวละครของ ${member.name || `สมาชิก ${index + 1}`}`} value={member.avatar} disabled={busy} onChange={(event) => updateRosterDraft(member.draftKey, { avatar: event.target.value })}>
                      {AVATARS.map((avatar) => <option key={avatar} value={avatar} disabled={rosterDraft.some((item) => item.draftKey !== member.draftKey && item.avatar === avatar)}>{avatar.replace("inventor_", "นักประดิษฐ์ ")}</option>)}
                    </select>
                  </label>
                  <label className="team-editor-name"><span>ชื่อเล่น</span><input maxLength={20} value={member.name} disabled={busy} onChange={(event) => updateRosterDraft(member.draftKey, { name: event.target.value })} /></label>
                  <button type="button" className={`attendance-toggle ${member.present ? "present" : "absent"}`} aria-pressed={member.present} disabled={busy} onClick={() => updateRosterDraft(member.draftKey, { present: !member.present })}><i>{member.present ? "✓" : "×"}</i><span>{member.present ? "มาเรียน" : "ไม่มา"}</span></button>
                  <button type="button" className="remove-roster-member" aria-label={`ลบ ${member.name || `สมาชิก ${index + 1}`}`} disabled={busy || rosterDraft.length <= 6} onClick={() => setRosterDraft((current) => current.filter((item) => item.draftKey !== member.draftKey))}>🗑 ลบ</button>
                </article>
              ))}
            </div>
            <footer>
              <div>
                <button type="button" className="add-roster-member" disabled={busy || rosterDraft.length >= 7} onClick={addRosterMember}>＋ เพิ่มสมาชิก</button>
                <small>ทีมต้องมี 6–7 คน ผู้ที่เลือก “ไม่มา” จะไม่แสดงในหน้าคำถาม</small>
              </div>
              <span className={rosterValidation.valid && rosterDraft.some((member) => member.present) ? "valid" : "invalid"}>{!rosterDraft.some((member) => member.present) ? "เลือกคนที่มาอย่างน้อย 1 คน" : rosterValidation.message}</span>
              <button type="button" className="button button-orange" disabled={busy || !rosterValidation.valid || !rosterDraft.some((member) => member.present)} onClick={() => void saveRosterEditor()}>{busy ? "กำลังบันทึก…" : "บันทึกและใช้รายชื่อนี้"}</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function TeamHistory({ team, onBack }: { team: TeamOverview; onBack: () => void }) {
  const [selectedRunId, setSelectedRunId] = useState(team.runs[0]?.id ?? "");
  const run = team.runs.find((item) => item.id === selectedRunId) ?? team.runs[0];
  const runMembers = run?.saveState.team?.length ? run.saveState.team : team.members;
  return <div className="screen team-history-screen">
    <header><button className="button button-yellow compact" onClick={onBack}>‹ กลับไปเลือกทีม</button><div><span>คำตอบและประวัติทีม</span><h1>{team.name}</h1></div></header>
    <div className="team-history-layout">
      <aside>{team.runs.map((item, index) => <button className={item.id === run?.id ? "active" : ""} key={item.id} onClick={() => setSelectedRunId(item.id)}><b>{item.status === "in_progress" ? "รอบที่กำลังทำ" : `ภารกิจครั้งที่ ${team.runs.length - index}`}</b><span>{new Date(item.completedAt ?? item.updatedAt).toLocaleString("th-TH")}</span></button>)}</aside>
      <section>{run ? <>
        <div className="history-summary"><div><span>สถานะ</span><b>{run.status === "in_progress" ? "กำลังทำภารกิจ" : "ทำภารกิจสำเร็จ"}</b></div><div><span>ขั้นล่าสุด</span><b>{STAGE_LABELS[run.currentStage]}</b></div><div><span>สมาชิก</span><b>{runMembers.length} คน</b></div></div>
        <h2>คำตอบจากหน้าหมุนกล่อง 3 มิติ</h2><div className="history-chip-list history-inspection-list">{Object.entries(run.saveState.inspectionFindings ?? {}).map(([damageId, cause]) => <span key={damageId}>{DAMAGES.find((damage) => damage.id === damageId)?.label ?? damageId} → {cause}</span>)}{!Object.keys(run.saveState.inspectionFindings ?? {}).length && <em>ยังไม่มีคำตอบ</em>}</div>
        <h2>สิ่งที่ทีมเลือกศึกษา</h2><div className="history-chip-list">{Object.entries(run.saveState.studyFocus ?? {}).filter(([, value]) => value).map(([key]) => <span key={key}>{studyTopicLabel(key)}</span>)}{!Object.values(run.saveState.studyFocus ?? {}).some(Boolean) && <em>ยังไม่ได้เลือก</em>}</div>
        <h2>คำตอบรายบุคคล</h2><div className="history-response-grid">{runMembers.map((member, index) => { const legacyKey = `student-${member.position ?? index}`; const ticket = run.saveState.exitTickets?.[exitTicketKey(member, index)] ?? run.saveState.exitTickets?.[legacyKey] ?? run.saveState.exitTickets?.[member.name]; return <article key={member.id ?? member.name}><b>{member.name}</b>{ticket ? <><p><i>K</i>{ticket.k || "-"}</p><p><i>P</i>{ticket.p || "-"}</p><p><i>V</i>{ticket.v || "-"}</p></> : <span>ไม่มีคำตอบที่บันทึกไว้</span>}</article>; })}</div>
        {Object.keys(run.saveState.recapAnswers ?? {}).length > 0 && <><h2>คำตอบแบบทบทวนหลังการทดลอง</h2><div className="history-recap-list">{Object.entries(run.saveState.recapAnswers).map(([questionIndex, choices]) => { const item = RECAP[Number(questionIndex)]; return <article key={questionIndex}><b>{item?.question ?? `คำถามที่ ${Number(questionIndex) + 1}`}</b><span>{choices.map((choice) => item?.choices[choice] ?? `ตัวเลือก ${choice + 1}`).join(" → ")}</span></article>; })}</div></>}
      </> : <div className="team-list-state">ยังไม่มีรอบภารกิจ</div>}</section>
    </div>
  </div>;
}

function SaveStatusBadge({ status }: { status: SaveIndicator }) {
  const labels: Record<SaveIndicator, string> = {
    idle: "พร้อมบันทึก",
    saving: "กำลังบันทึก…",
    saved: "✓ บันทึกในฐานข้อมูลแล้ว",
    offline: "ยังส่งไม่สำเร็จ · รอลองใหม่",
    conflict: "ข้อมูลชนกับอีกเครื่อง · เก็บคำตอบรอไว้",
  };
  return <div className={`save-status-badge ${status}`} role="status">{labels[status]}</div>;
}

function MissionRoute({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  useEffect(() => preloadStorySounds(), []);
  return (
    <div className="screen mission-route-screen mission-briefing-screen">
      <img className="mission-route-bg" src={asset("menu/cover.png")} alt="" />
      <button className="mission-briefing-back" type="button" onClick={onBack}>‹ กลับหน้าปก</button>
      <main className="mission-briefing-card">
        <div className="mission-briefing-illustration" aria-hidden="true">
          <img className="mission-briefing-box" src={asset("menu/mission-briefing-box.png")} alt="" />
          <span className="mission-briefing-search">🔎</span>
        </div>
        <h1>ภารกิจนักสืบกล่องพัสดุ</h1>
        <p className="mission-briefing-copy">ติดตามเส้นทางของกล่อง แล้วค้นหาว่าเกิดความเสียหายอะไรขึ้นบ้าง</p>
        <button className="button button-orange mission-briefing-start" type="button" onClick={onDone}>
          เริ่มติดตามพัสดุ
          <b aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg></b>
        </button>
      </main>
    </div>
  );
}

const TALKING_FACE_POSITIONS: Record<string, string> = {
  attentive: "50% 0%",
  focused: "0% 0%",
  excited: "100% 100%",
  worried: "50% 100%",
  strained: "0% 50%",
  shocked: "0% 50%",
  relieved: "0% 0%",
  sad: "0% 50%",
  encouraging: "100% 0%",
};

function ComicStory({ index, audio, onIndex, onDone }: { index: number; audio: boolean; onIndex: (n: number) => void; onDone: () => void }) {
  const scene = STORY[index];
  const [typedNarration, setTypedNarration] = useState("");
  const [talking, setTalking] = useState(false);
  const [alternateFace, setAlternateFace] = useState(false);
  const typingTimerRef = useRef<number | null>(null);
  const typingRunRef = useRef(0);
  const advancingRef = useRef(false);

  useEffect(() => {
    const soundName = STORY_SOUND_BY_IMAGE[scene[0]];
    if (!audio) stopStorySound();
    else if (activeStorySoundName !== soundName) void playStorySound(soundName, true);
  }, [audio, scene]);

  useEffect(() => () => stopStorySound(), []);

  useEffect(() => {
    advancingRef.current = false;
  }, [index]);

  useEffect(() => {
    const runId = typingRunRef.current + 1;
    typingRunRef.current = runId;
    const narrationGlyphs = Array.from(scene[1]);
    let narrationIndex = 0;
    let cancelled = false;
    let timer = 0;
    const schedule = (callback: () => void, delay: number) => {
      timer = window.setTimeout(callback, delay);
      typingTimerRef.current = timer;
    };

    setTypedNarration("");
    setTalking(true);

    const typeNarration = () => {
      if (cancelled || typingRunRef.current !== runId) return;
      narrationIndex += 1;
      setTypedNarration(narrationGlyphs.slice(0, narrationIndex).join(""));
      if (narrationIndex < narrationGlyphs.length) schedule(typeNarration, 30);
      else {
        typingTimerRef.current = null;
        setTalking(false);
      }
    };

    schedule(typeNarration, 420);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (typingTimerRef.current === timer) typingTimerRef.current = null;
    };
  }, [index, scene]);

  useEffect(() => {
    if (!talking) {
      setAlternateFace(false);
      return;
    }
    const timer = window.setInterval(() => setAlternateFace((current) => !current), 260);
    return () => window.clearInterval(timer);
  }, [talking]);

  const textComplete = typedNarration === scene[1];
  const mascotPosition = alternateFace ? TALKING_FACE_POSITIONS[scene[3]] ?? scene[4] : scene[4];
  const next = () => {
    if (advancingRef.current) return;
    if (!textComplete) {
      typingRunRef.current += 1;
      if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
      setTypedNarration(scene[1]);
      setTalking(false);
      return;
    }
    if (index >= STORY.length - 1) {
      stopStorySound();
      onDone();
      return;
    }
    advancingRef.current = true;
    const nextIndex = index + 1;
    const nextScene = STORY[nextIndex];
    void playStorySound(STORY_SOUND_BY_IMAGE[nextScene[0]], audio).then(() => onIndex(nextIndex));
  };
  return (
    <div className="screen comic-screen" onClick={next} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") next(); }}>
      <img className="comic-image" src={asset(`cutscene/${scene[0]}`)} alt={scene[1]} />
      <div className="comic-progress">{index + 1} / {STORY.length}</div>
      <section key={scene[0]} className={`comic-narrator comic-narrator-${scene[3]} ${talking ? "is-talking" : "is-finished"}`} aria-label={`คำอธิบายสถานการณ์ที่ ${index + 1}: ${scene[1]}`}>
        <div
          className="comic-mascot-sprite"
          style={{ backgroundImage: `url(${asset("mascot/parcel-guide-sprite.png")})`, backgroundPosition: mascotPosition }}
          aria-hidden="true"
        />
        <div className="comic-speech-bubble" aria-hidden="true">
          <span className="comic-speaker"><b aria-hidden="true">●</b> สถานการณ์ {index + 1}</span>
          <p className={talking && typedNarration !== scene[1] ? "is-typing" : ""}>{typedNarration}</p>
        </div>
      </section>
      <button className="comic-next-button" onClick={(event) => { event.stopPropagation(); next(); }} aria-label="ไปฉากถัดไป">
        <span>{index >= STORY.length - 1 ? "เริ่มสำรวจ" : "ถัดไป"}</span>
        <b aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m8 5 7 7-7 7" /></svg>
        </b>
      </button>
    </div>
  );
}

function DamageInspection({ findings, audio, onFinding, onReset, onDone }: { findings: Record<string, DamageCause>; audio: boolean; onFinding: (findings: Record<string, DamageCause>) => void; onReset: () => void; onDone: () => void }) {
  type ViewerMaterial = { name: string; pbrMetallicRoughness: { setBaseColorFactor: (color: string | number[]) => void } };
  type ViewerElement = HTMLElement & { model?: { materials: ViewerMaterial[] } };

  const [ready, setReady] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [discoveredIds, setDiscoveredIds] = useState<string[]>(() => DAMAGES.filter((damage) => Boolean(findings[damage.id])).map((damage) => damage.id));
  const [activeDamageId, setActiveDamageId] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const viewerRef = useRef<ViewerElement | null>(null);
  const celebrationTimerRef = useRef<number | null>(null);
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
    setDiscoveredIds((current) => {
      const savedIds = DAMAGES.filter((damage) => Boolean(findings[damage.id])).map((damage) => damage.id);
      const missingIds = savedIds.filter((id) => !current.includes(id));
      return missingIds.length ? [...current, ...missingIds] : current;
    });
  }, [findings]);
  useEffect(() => () => {
    if (celebrationTimerRef.current !== null) window.clearTimeout(celebrationTimerRef.current);
  }, []);
  const celebrate = () => {
    setCelebrating(false);
    if (celebrationTimerRef.current !== null) window.clearTimeout(celebrationTimerRef.current);
    window.requestAnimationFrame(() => setCelebrating(true));
    celebrationTimerRef.current = window.setTimeout(() => setCelebrating(false), 1350);
  };
  const activeDamage = DAMAGES.find((damage) => damage.id === activeDamageId) ?? null;
  const selectedCause = activeDamage ? findings[activeDamage.id] : undefined;
  const answerRequired = Boolean(activeDamage && !selectedCause);
  const locateDamage = (damageId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (answerRequired && damageId !== activeDamageId) return;
    const isNew = !discoveredIds.includes(damageId);
    setActiveDamageId(damageId);
    if (isNew) {
      setDiscoveredIds((current) => [...current, damageId]);
      celebrate();
      playSound("10_idea_chime.ogg", audio);
    }
  };
  const completedCount = DAMAGES.filter((damage) => Boolean(findings[damage.id])).length;
  const saveCause = (cause: DamageCause) => {
    if (!activeDamage) return;
    onFinding({ ...findings, [activeDamage.id]: cause });
    celebrate();
    playSound("10_idea_chime.ogg", audio);
  };
  const resetInspection = () => {
    setDiscoveredIds([]);
    setActiveDamageId(null);
    setCelebrating(false);
    onReset();
  };
  return (
    <div className="screen inspection-screen">
      <img className="inspection-bg" src={asset("inspection/background.png")} alt="โต๊ะตรวจสอบกล่อง" />
      <div className="floating-question">หมุนกล่องแล้วหาความเสียหายที่เกิดขึ้นกับกล่องพัสดุ!</div>
      <aside className="inspection-discovery-panel" aria-label={`ค้นพบความเสียหายแล้ว ${discoveredIds.length} จาก ${DAMAGES.length} จุด`}>
        <div><span>ค้นพบแล้ว</span><strong>{discoveredIds.length}/{DAMAGES.length}</strong></div>
        <ol>{DAMAGES.map((damage) => {
          const discovered = discoveredIds.includes(damage.id);
          const locked = answerRequired && activeDamageId !== damage.id;
          return <li key={damage.id}><button type="button" data-damage={damage.id} disabled={!discovered || locked} className={`${discovered ? "is-discovered" : "is-undiscovered"} ${activeDamageId === damage.id ? "is-active" : ""}`} aria-label={discovered ? `เปิดคำตอบของ${damage.label}` : "ความเสียหายที่ยังไม่ค้นพบ"} onClick={() => setActiveDamageId(damage.id)}><b aria-hidden="true" /><span>{discovered ? damage.label : "ยังไม่ค้นพบ"}</span></button></li>;
        })}</ol>
        {discoveredIds.length > 0 && <button type="button" className="inspection-reset-button" disabled={answerRequired} onClick={resetInspection}>↻ เริ่มสำรวจใหม่</button>}
      </aside>
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
          >
            {DAMAGES.map((spot) => {
              const discovered = discoveredIds.includes(spot.id);
              const active = spot.id === activeDamageId;
              const locked = answerRequired && !active;
              return (
                <button
                  key={spot.id}
                  slot={`hotspot-${spot.id}`}
                  className={`damage-target ${discovered ? "is-solved" : ""} ${active ? "is-active" : ""}`}
                  data-damage={spot.id}
                  data-position={spot.position}
                  data-normal={spot.normal}
                  aria-label={discovered ? `ตรวจสอบ${spot.label}อีกครั้ง` : "ตรวจสอบบริเวณนี้"}
                  disabled={locked}
                  tabIndex={discovered ? -1 : 0}
                  onClick={(event) => locateDamage(spot.id, event)}
                >
                  {discovered && <span className="damage-marker-label">{spot.label}</span>}
                </button>
              );
            })}
          </model-viewer>
        )}
        {!modelLoaded && <div className="model-loading" role="status"><span className="loading-box" /><b>กำลังเตรียมกล่อง 3 มิติ…</b></div>}
      </div>
      {activeDamage && (
        <aside data-damage={activeDamage.id} className={`inspection-cause-panel ${answerRequired ? "is-required" : "is-answered"}`} aria-label={`เลือกสาเหตุที่คาดว่าเกี่ยวข้องกับ${activeDamage.evidence}`}>
          <b>ร่องรอยนี้คาดว่าเกี่ยวข้องกับอะไร?</b>
          <div>{DAMAGE_CAUSES.map((cause) => <button type="button" key={cause} aria-pressed={selectedCause === cause} onClick={() => saveCause(cause)}>{selectedCause === cause ? "✓ " : ""}{cause}</button>)}</div>
          <small role="status">{answerRequired ? "ต้องตอบคำถามนี้ก่อนค้นหาจุดถัดไป" : "บันทึกคำตอบแล้ว สำรวจจุดต่อไปได้"}</small>
        </aside>
      )}
      <div className={`inspection-mascot-guide ${celebrating ? "is-celebrating" : ""}`} aria-hidden="true">
        <div className="inspection-mascot-sprite" style={{ backgroundImage: `url(${asset("mascot/parcel-guide-sprite.png")})`, backgroundPosition: celebrating ? "100% 100%" : "0% 0%" }} />
      </div>
      {completedCount === DAMAGES.length && <button className="inspection-next-button" onClick={onDone}>สำรวจวัสดุ ›</button>}
    </div>
  );
}

function LabRoomsPaused({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="screen lab-paused-screen">
      <img className="group-design-bg" src={asset("compression/lab_background.png")} alt="" />
      <div className="lab-paused-card">
        <span>ปิดชั่วคราว</span>
        <h1>ห้องทดลองพักใช้งานชั่วคราว</h1>
        <p>บันทึกสิ่งที่ได้สำรวจ แล้วไปสรุปภารกิจได้เลย</p>
        <button className="button button-orange" onClick={onContinue}>ไปสรุปภารกิจ</button>
      </div>
    </div>
  );
}

type StudyTopicId = (typeof STUDY_TOPICS)[number]["id"];

function StudyTopicIllustration({ id }: { id: StudyTopicId }) {
  const labIcon = id === "compression" ? "compression" : id === "elasticity" ? "impact" : "absorption";
  return <img className="study-topic-illustration" src={asset(`menu/lab-room-${labIcon}.png`)} alt="" aria-hidden="true" />;
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
  detail: "กระดาษลูกฟูกมีแผ่นเรียบ 2 แผ่นประกบลอนกระดาษไว้ตรงกลาง ช่องอากาศในลอนช่วยรับแรงกดและลดแรงกระแทก จึงทำให้กล่องแข็งแรงแต่มีน้ำหนักเบา",
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
    description: "ทำจากกระดาษเรียบ 2 ชั้น มีลอนกระดาษและช่องอากาศอยู่ตรงกลาง ลอนช่วยรับแรงกดและลดแรงกระแทก จึงแข็งแรงแต่น้ำหนักเบา",
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
    description: "เป็นพลาสติกแผ่นบาง ผิวเรียบและโค้งงอได้ น้ำซึมผ่านได้ยาก จึงช่วยห่อสิ่งของและป้องกันความชื้น",
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
    description: "ฟองอากาศเล็ก ๆ ทำหน้าที่เหมือนเบาะ เมื่อถูกกระแทก อากาศในฟองจะช่วยกระจายแรงและป้องกันสิ่งของ",
    model: "models/bubble_wrap.glb?v=3",
    alt: "โมเดลแผ่นพลาสติกกันกระแทกชนิดฟองอากาศแบบแผ่นเดี่ยว มีฟองอากาศเรียงเป็นแถวเฉพาะด้านบนและด้านล่างเรียบ",
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
    description: "มีช่องอากาศเล็ก ๆ จำนวนมาก จึงมีน้ำหนักเบา นุ่ม และช่วยลดแรงกระแทกโดยดูดซับน้ำได้น้อย",
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
    description: "มีเนื้อกระดาษแน่น ด้านหน้าสีขาวและด้านหลังสีเทา คำว่า 400 แกรม หมายถึงกระดาษ 1 ตารางเมตรหนัก 400 กรัม",
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
    description: "ทำจากเส้นใยกระดาษที่ยึดเกาะกัน มีสีน้ำตาล น้ำหนักเบา และโค้งงอได้ จึงใช้ห่อหรือทำถุงได้",
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
    description: "เป็นกระดาษบางที่เคลือบไขบนผิว ชั้นไขทำให้น้ำซึมผ่านได้ยากและช่วยป้องกันความชื้น",
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
  const [viewScale, setViewScale] = useState<MaterialScale>("normal");
  const [zoomDepth, setZoomDepth] = useState(0);
  const [selectedFeature, setSelectedFeature] = useState<string>("overview");
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
  const materialViewerRef = useRef<MaterialViewerElement | null>(null);
  const exploring = exploringMaterial !== null;
  const explorer = MATERIAL_EXPLORERS[exploringMaterial ?? "corrugated_cardboard"];
  const explorerFeatures = explorer.features as readonly MaterialExplorerFeature[];
  const microscopeMaterialId = (exploringMaterial ?? "corrugated_cardboard") as MaterialMicroscopeId;
  const isCorrugatedContinuousZoom = microscopeMaterialId === "corrugated_cardboard";
  const isCardboardContinuousZoom = microscopeMaterialId === "cardboard";
  const isBubbleWrapContinuousZoom = microscopeMaterialId === "bubble_wrap";
  const isFoamContinuousZoom = microscopeMaterialId === "closed_cell_pe_foam";
  const isPeSheetContinuousZoom = microscopeMaterialId === "pe_sheet";
  const isContinuousZoomMaterial = isCorrugatedContinuousZoom || isCardboardContinuousZoom || isBubbleWrapContinuousZoom || isFoamContinuousZoom || isPeSheetContinuousZoom;
  const continuousModelOpacity = isContinuousZoomMaterial ? Math.max(0, Math.min(1, (54 - zoomDepth) / 16)) : 1;
  const microscopeDefinition = viewScale === "normal" ? null : MATERIAL_MICROSCOPES[microscopeMaterialId][viewScale];
  const currentFeatures: readonly (MaterialExplorerFeature | MicroscopeFeature)[] = viewScale === "normal" ? explorerFeatures : microscopeDefinition!.features;
  const selected = currentFeatures.find((feature) => feature.id === selectedFeature)
    ?? (viewScale === "normal" ? explorer.overview : currentFeatures[0]);

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
  }, [exploring, viewerReady, modelAttempt, viewScale]);

  const openExplorer = (materialId: MaterialExplorerId) => {
    setViewScale("normal");
    setZoomDepth(0);
    setSelectedFeature("overview");
    setExpandedFeature(null);
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
    setExpandedFeature(feature.id);
    const viewer = materialViewerRef.current;
    if (!viewer) return;
    viewer.cameraOrbit = feature.orbit;
    viewer.cameraTarget = feature.target;
    viewer.jumpCameraToGoal?.();
  };
  const resetExplorer = () => {
    setSelectedFeature("overview");
    setExpandedFeature(null);
    const viewer = materialViewerRef.current;
    if (!viewer) return;
    viewer.cameraOrbit = explorer.orbit;
    viewer.cameraTarget = explorer.target;
    viewer.jumpCameraToGoal?.();
  };
  const selectScale = (scale: MaterialScale) => {
    setZoomDepth(scale === "normal" ? 0 : scale === "micro" ? 50 : 100);
    setViewScale(scale);
    setExpandedFeature(null);
    if (scale === "normal") {
      resetExplorer();
      return;
    }
    setSelectedFeature(MATERIAL_MICROSCOPES[microscopeMaterialId][scale].features[0].id);
  };
  const changeZoomDepth = (depth: number) => {
    const nextDepth = Math.max(0, Math.min(100, depth));
    const nextScale = materialScaleForZoom(nextDepth);
    setZoomDepth(nextDepth);
    if (nextScale === viewScale) return;
    setViewScale(nextScale);
    setExpandedFeature(null);
    if (nextScale === "normal") {
      resetExplorer();
      return;
    }
    setSelectedFeature(MATERIAL_MICROSCOPES[microscopeMaterialId][nextScale].features[0].id);
  };
  const focusMicroscopeFeature = (feature: MicroscopeFeature) => {
    setSelectedFeature(feature.id);
    setExpandedFeature(feature.id);
  };
  const focusCorrugatedZoomFeature = (featureId: string) => {
    const feature = currentFeatures.find((item) => item.id === featureId);
    if (!feature) return;
    setSelectedFeature(feature.id);
    setExpandedFeature(feature.id);
  };
  const toggleFeatureDetails = (feature: MaterialExplorerFeature | MicroscopeFeature) => {
    if (expandedFeature === feature.id) {
      setExpandedFeature(null);
      return;
    }
    if (viewScale === "normal") focusFeature(feature as MaterialExplorerFeature);
    else focusMicroscopeFeature(feature as MicroscopeFeature);
  };

  return (
    <div className="screen material-guide-screen">
      <img className="material-guide-bg" src={asset("compression/lab_background.png")} alt="" />
      <button className="material-guide-back-button" onClick={onBack}>‹ ย้อนกลับ</button>
      <header className="material-guide-header">
        <div>
          <span className="material-guide-kicker">🔎 ห้องส่องวัสดุแสนสนุก</span>
          <h1>สำรวจวัสดุ</h1>
          <p className="material-guide-intro">เลือกวัสดุ แล้วหมุนดูให้รอบก่อนซูมเข้าไปค้นหาความลับข้างใน!</p>
        </div>
      </header>
      <section className="material-guide-grid showing-five-materials" aria-label="ข้อมูลวัสดุ 5 ชนิดตามแผนการสอน">
        {orderedMaterials.map((material, index) => {
          const materialId = material.id as MaterialExplorerId;
          const hasExplorer = materialId in MATERIAL_EXPLORERS;
          return (
          <article key={material.id} className={hasExplorer ? "is-explorable" : undefined}>
            {hasExplorer ? (
              <button type="button" className="material-card-button" onClick={() => openExplorer(materialId)} aria-label={`เปิดสำรวจ${material.name}แบบ 3 มิติ`}>
                <b className="material-card-number" aria-hidden="true">{index + 1}</b>
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
        <div className="material-guide-helper"><span aria-hidden="true">🔬</span><p><b>เลือกวัสดุที่อยากรู้จักได้เลย!</b><small>แตะการ์ดเพื่อหมุน ซูม และดูโครงสร้างใกล้ ๆ</small></p></div>
        <button className="button button-orange" onClick={onDone}>ไปช่วงถัดไป ›</button>
      </footer>
      {exploring && (
        <section className="material-3d-overlay" role="dialog" aria-modal="true" aria-labelledby="material-3d-title">
          <header className="material-3d-header">
            <button type="button" className="material-3d-close" onClick={() => setExploringMaterial(null)}>‹ กลับไปดูวัสดุทั้งหมด</button>
            <div>
              <span>{viewScale === "normal" ? "สำรวจแบบ 3 มิติ" : isContinuousZoomMaterial ? "ซูมเข้าไปดูโครงสร้างด้านใน" : microscopeDefinition?.eyebrow}</span>
              <h1 id="material-3d-title">{explorer.title}</h1>
            </div>
          </header>
          <div className="material-3d-layout">
            <div className={`material-3d-stage is-dark-material-stage ${viewScale !== "normal" ? "is-microscope-stage" : ""} ${isContinuousZoomMaterial ? "is-continuous-zoom-stage" : ""}`}>
              <div className="material-zoom-control">
                <div><span aria-hidden="true">🔎</span><b>ลากเพื่อซูมลึกเข้าไปในวัสดุ</b><output>{zoomDepth}%</output></div>
                <div className="material-zoom-slider-row">
                  <button type="button" aria-label="ซูมออก" disabled={zoomDepth === 0} onClick={() => changeZoomDepth(zoomDepth - 10)}><span aria-hidden="true">−</span></button>
                  <input type="range" min="0" max="100" step="1" value={zoomDepth} aria-label="ระดับการซูมเข้าไปในวัสดุ" onChange={(event) => changeZoomDepth(Number(event.currentTarget.value))} />
                  <button type="button" aria-label="ซูมเข้า" disabled={zoomDepth === 100} onClick={() => changeZoomDepth(zoomDepth + 10)}><span aria-hidden="true">+</span></button>
                </div>
                <nav aria-label="จุดสำคัญของระดับการขยาย">
                  {(["normal", "micro", "nano"] as const).map((scale) => <button type="button" key={scale} className={viewScale === scale ? "is-active" : ""} aria-pressed={viewScale === scale} onClick={() => selectScale(scale)}>
                    <span>{scale === "normal" ? "ปกติ" : scale === "micro" ? "ไมโคร" : "นาโน"}</span><small>{scale === "normal" ? "ชิ้นวัสดุ" : scale === "micro" ? "เส้นใย/เซลล์" : isContinuousZoomMaterial ? "ผิวระดับนาโน" : "โมเลกุล"}</small>
                  </button>)}
                </nav>
              </div>
              {isContinuousZoomMaterial && <div className="material-continuous-zoom-host">
                {isCorrugatedContinuousZoom && <CorrugatedContinuousZoom depth={zoomDepth} level={viewScale} selectedId={selectedFeature} onSelect={focusCorrugatedZoomFeature} />}
                {isCardboardContinuousZoom && <CardboardContinuousZoom depth={zoomDepth} level={viewScale} selectedId={selectedFeature} onSelect={focusCorrugatedZoomFeature} />}
                {isBubbleWrapContinuousZoom && <BubbleWrapContinuousZoom depth={zoomDepth} level={viewScale} selectedId={selectedFeature} onSelect={focusCorrugatedZoomFeature} />}
                {isFoamContinuousZoom && <FoamContinuousZoom depth={zoomDepth} level={viewScale} selectedId={selectedFeature} onSelect={focusCorrugatedZoomFeature} />}
                {isPeSheetContinuousZoom && <PeSheetContinuousZoom depth={zoomDepth} level={viewScale} selectedId={selectedFeature} onSelect={focusCorrugatedZoomFeature} />}
              </div>}
              {(viewScale === "normal" || isContinuousZoomMaterial) && viewerReady && (
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
                  field-of-view={`${32 - (zoomDepth / 33) * 7}deg`}
                  min-field-of-view="24deg"
                  max-field-of-view="48deg"
                  interpolation-decay="120"
                  exposure={exploringMaterial === "pe_sheet" || exploringMaterial === "bubble_wrap" || exploringMaterial === "waxed_paper" ? "1.22" : "1.08"}
                  shadow-intensity={exploringMaterial === "pe_sheet" || exploringMaterial === "bubble_wrap" || exploringMaterial === "waxed_paper" ? "0.08" : "1.15"}
                  style={{ opacity: continuousModelOpacity, transform: `scale(${1 + Math.min(zoomDepth, 42) * .006})`, transition: "opacity .65s ease, transform .65s ease", pointerEvents: viewScale === "normal" ? "auto" : "none" }}
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
              {viewScale === "normal" && !modelLoaded && !modelError && <div className="material-3d-loading" role="status"><span className="loading-box" /><b>{explorer.loading}</b></div>}
              {viewScale === "normal" && modelError && <div className="material-3d-error" role="alert"><span>⚠</span><b>{modelError}</b><button type="button" onClick={retryModel}>โหลดโมเดลอีกครั้ง</button></div>}
              {viewScale === "normal" && <div className="material-3d-gesture-hint">ลากเพื่อหมุน เลื่อนหรือหนีบเพื่อซูม และกดป้ายเพื่อดูส่วนนั้น</div>}
              {!isContinuousZoomMaterial && viewScale !== "normal" && <MaterialMicroscope key={`${microscopeMaterialId}-${viewScale}`} materialId={microscopeMaterialId} level={viewScale} selectedId={selectedFeature} zoomProgress={viewScale === "micro" ? (zoomDepth - 34) / 33 : (zoomDepth - 68) / 32} onSelect={focusMicroscopeFeature} />}
            </div>
            <aside className="material-3d-info" aria-live="polite">
              <div className="material-3d-info-icon">{selected.icon}</div>
              <h2>{selected.label}</h2>
              <p className="material-3d-material-summary">{explorer.description}</p>
              <div className="material-3d-part-buttons" aria-label={`เลือกส่วนของ${explorer.title}`}>
                {currentFeatures.map((feature) => {
                  const expanded = expandedFeature === feature.id;
                  const panelId = `material-detail-${feature.id}`;
                  return <div key={feature.id} className={`material-3d-accordion-item ${expanded ? "is-open" : ""}`}>
                    <button type="button" className={selectedFeature === feature.id ? "is-active" : ""} aria-expanded={expanded} aria-controls={panelId} onClick={() => toggleFeatureDetails(feature)}>
                      <span>{feature.icon}</span><b>{feature.label}</b><i aria-hidden="true">⌄</i>
                    </button>
                    {expanded && <div id={panelId} className="material-3d-accordion-panel">{feature.detail}</div>}
                  </div>;
                })}
              </div>
              {viewScale === "normal" ? <button type="button" className="material-3d-reset" onClick={resetExplorer}>↻ กลับไปดูทั้งแผ่น</button> : <p className="material-scale-reading-note">กดชื่อส่วนประกอบ แล้วภาพจะใช้สีสว่างบอกตำแหน่งนั้น</p>}
            </aside>
          </div>
        </section>
      )}
    </div>
  );
}

function StudyFocusScreen({ values, onBack, onChange, onDone }: { values: Record<string, boolean>; onBack: () => void; onChange: (values: Record<string, boolean>) => void; onDone: () => void }) {
  const [warning, setWarning] = useState("");
  const [showStudySummary, setShowStudySummary] = useState(false);
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
    setShowStudySummary(true);
  };
  return (
    <div className="screen study-focus-screen">
      <img className="material-guide-bg" src={asset("compression/lab_background.png")} alt="" />
      <button className="material-guide-back-button" onClick={onBack}>‹ ย้อนกลับ</button>
      <header className="study-focus-header">
        <div className="study-focus-question">
          <span>🔎 คำถามนำภารกิจที่ 1</span>
          <h1>เมื่อกล่องพัสดุต้องเจอแรงกด แรงกระแทก และฝน เราควรศึกษาสมบัติใดของวัสดุบ้าง เพราะเหตุใด?</h1>
        </div>
      </header>
      <div className="study-topic-title study-focus-title"><span>★</span> เลือกสมบัติที่จำเป็นต้องศึกษา</div>
      <section className="study-topic-panel study-focus-panel" aria-label="เลือกสมบัติที่ต้องศึกษา">
        {STUDY_TOPICS.map((topic) => (
          <button key={topic.id} className={`study-topic-card study-topic-${topic.id}${values[topic.id] ? " selected" : ""}`} aria-pressed={Boolean(values[topic.id])} onClick={() => toggle(topic.id)}>
            <StudyTopicIllustration id={topic.id} />
            <b className="study-topic-name">{topic.title}</b>
            <span className="study-topic-observation">{topic.observation}</span>
            <span className="study-topic-purpose">{topic.purpose}</span>
            <span className="study-topic-tap">{values[topic.id] ? "เลือกแล้ว!" : "แตะเพื่อเลือก"}</span>
          </button>
        ))}
      </section>
      {warning && <div className="study-focus-warning" role="alert">
        <div className="study-warning-mascot" aria-hidden="true" style={{ backgroundImage: `url(${asset("mascot/parcel-guide-sprite.png")})` }} />
        <div className="study-warning-bubble">{warning}</div>
      </div>}
      <footer className="study-focus-footer">
        <button className="button button-orange study-focus-save" onClick={saveFocus}>{complete ? "ครบแล้ว ไปต่อเลย! ›" : "เลือกให้ครบก่อนนะ"}</button>
      </footer>
      {showStudySummary && <div className="study-focus-summary-overlay" role="dialog" aria-modal="true" aria-labelledby="study-focus-summary-title">
        <section className="study-focus-summary-card">
          <div className="study-focus-summary-mascot" aria-hidden="true" style={{ backgroundImage: `url(${asset("mascot/parcel-guide-sprite.png")})` }} />
          <span>🎉 วันนี้เราค้นพบแล้ว!</span>
          <h2 id="study-focus-summary-title">กล่องพัสดุต้องศึกษาสมบัติของวัสดุ 3 ด้าน</h2>
          <div className="study-focus-summary-findings" aria-label="สมบัติของวัสดุที่ค้นพบ">
            <b><i aria-hidden="true">✓</i> ความต้านทานแรงกดทับ</b>
            <b><i aria-hidden="true">✓</i> การลดความเสียหายจากแรงกระแทก</b>
            <b><i aria-hidden="true">✓</i> การดูดซับน้ำของวัสดุ</b>
          </div>
          <p className="study-focus-summary-next"><strong>คำตอบที่สะสมได้</strong> {MISSION_ONE_BIG_QUESTION_PROGRESS}<br /><strong>ภารกิจต่อไป</strong> เราจะทดลองเพื่อหาหลักฐานว่า วัสดุชนิดใดเหมาะกับแต่ละหน้าที่</p>
          <div className="study-focus-summary-actions">
            <button type="button" className="button button-white" onClick={() => setShowStudySummary(false)}>กลับไปดูสมบัติ</button>
            <button type="button" className="button button-orange" onClick={onDone}>พร้อมแล้ว ไปตอบคำถาม ›</button>
          </div>
        </section>
      </div>}
    </div>
  );
}

const EMPTY_EXIT_TICKET: ExitTicket = { k: "", p: "", v: "" };

type MatchField = "k" | "p";
type MatchItem = { id: string; prompt: string; answer: string };

const KNOWLEDGE_MATCHES: MatchItem[] = [
  { id: "collapsed-box", prompt: "กล่องยุบ สัมพันธ์กับสมบัติ", answer: STUDY_TOPICS[0].title },
  { id: "impact-damage", prompt: "สิ่งของภายในเสียหายจากแรงกระแทก สัมพันธ์กับสมบัติ", answer: STUDY_TOPICS[1].title },
  { id: "wet-box", prompt: "กล่องเปียก สัมพันธ์กับสมบัติ", answer: STUDY_TOPICS[2].title },
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

function isStructuredExitTicketComplete(ticket?: ExitTicket) {
  if (!ticket) return false;
  const kMatches = readMatches(ticket.k, KNOWLEDGE_MATCHES);
  const pMatches = readMatches(ticket.p, PROCESS_MATCHES);
  const valueAnswer = readValueAnswer(ticket.v);
  return Object.keys(kMatches).length === KNOWLEDGE_MATCHES.length
    && Object.keys(pMatches).length === PROCESS_MATCHES.length
    && Boolean(valueAnswer.choice && valueAnswer.reason.trim());
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

function normalizeExitTickets(initial: Record<string, ExitTicket>, team: TeamMember[]) {
  const normalized: Record<string, ExitTicket> = {};
  team.forEach((member, index) => {
    const key = exitTicketKey(member, index);
    const legacyTicket = initial[member.name];
    const ticket = initial[key] ?? legacyTicket;
    if (ticket) normalized[key] = ticket;
  });
  return normalized;
}

function ExitTicketScreen({ team, initial, confirmations, onBack, onAnswerChange, onSaveDraft, onDone }: { team: TeamMember[]; initial: Record<string, ExitTicket>; confirmations: Record<string, ExitTicket>; onBack: () => void; onAnswerChange: (values: Record<string, ExitTicket>) => void; onSaveDraft: (values: Record<string, ExitTicket>, confirmed: Record<string, ExitTicket>) => void; onDone: (values: Record<string, ExitTicket>) => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const values = { ...initial, ...normalizeExitTickets(initial, team) };
  const savedValues = confirmations;
  const [selectedAnswers, setSelectedAnswers] = useState<Record<MatchField, string>>({ k: "", p: "" });
  const activeKey = exitTicketKey(team[activeIndex] ?? { name: "", avatar: "" }, activeIndex);
  const activeName = team[activeIndex]?.name ?? "นักเรียน";
  const current = values[activeKey] ?? EMPTY_EXIT_TICKET;
  const isTicketComplete = isStructuredExitTicketComplete;
  const complete = team.length > 0 && team.every((member, index) => {
    const key = exitTicketKey(member, index);
    return isTicketComplete(savedValues[key]) && exitTicketsAreEqual(values[key], savedValues[key]);
  });
  const currentReady = isTicketComplete(current);
  const savedCurrent = isTicketComplete(savedValues[activeKey]) && exitTicketsAreEqual(current, savedValues[activeKey]);
  const completedCount = team.filter((member, index) => {
    const key = exitTicketKey(member, index);
    return isTicketComplete(savedValues[key]) && exitTicketsAreEqual(values[key], savedValues[key]);
  }).length;
  const update = (field: keyof ExitTicket, value: string) => {
    const nextValues = { ...values, [activeKey]: { ...current, [field]: value } };
    onAnswerChange(nextValues);
  };
  const valueAnswer = readValueAnswer(current.v);
  const saveCurrent = () => {
    if (!currentReady) return;
    const nextDraftValues = { ...values, [activeKey]: current };
    const nextSavedValues = { ...savedValues, [activeKey]: current };
    onSaveDraft(nextDraftValues, nextSavedValues);
    const nextStudentIndex = team.findIndex((member, index) => {
      const key = exitTicketKey(member, index);
      return index !== activeIndex && (!isTicketComplete(nextSavedValues[key]) || !exitTicketsAreEqual(nextDraftValues[key], nextSavedValues[key]));
    });
    if (nextStudentIndex >= 0) setActiveIndex(nextStudentIndex);
  };
  const finish = () => {
    if (complete) onDone(values);
  };
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
            const key = exitTicketKey(member, index);
            const done = isTicketComplete(savedValues[key]) && exitTicketsAreEqual(values[key], savedValues[key]);
            return <button key={`${index}-${member.name}`} className={activeIndex === index ? "active" : ""} onClick={() => { setActiveIndex(index); setSelectedAnswers({ k: "", p: "" }); }}><strong>{index + 1}</strong><img src={asset(`profiles/${member.avatar}.png`)} alt="" /><span>{member.name}</span><i>{done ? "✓" : ""}</i></button>;
          })}
          <div className="system-record-card">
            <b>▣ การยืนยันคำตอบ</b>
            <p>{complete ? "ยืนยันครบทุกคนแล้ว ไปต่อได้เลย" : `ยืนยันแล้ว ${completedCount}/${team.length} คน`}</p>
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
            <span>{activeName} · {savedCurrent ? "ยืนยันแล้ว" : currentReady ? "ครบแล้ว · พร้อมยืนยัน" : "ทยอยบันทึกอัตโนมัติ · ตอบให้ครบทั้ง 3 ข้อ"}</span>
            <button className="button button-orange" disabled={!currentReady} onClick={saveCurrent}>ยืนยันและไปคนถัดไป</button>
            {complete && <button className="button button-orange system-continue-button" onClick={finish}>ไปต่อ</button>}
          </div>
        </div>
      </section>
    </div>
  );
}

function LabPreview({ audio, onClose }: { audio: boolean; onClose: () => void }) {
  // A separate state tree: the shortcut never overwrites a team checkpoint or sends learning events.
  const [previewSave, setPreviewSave] = useState<GameSave>({ ...EMPTY_SAVE, stage: "testHub", audio });
  const patchPreview = (next: Partial<GameSave>) => setPreviewSave((current) => ({ ...current, ...next }));
  return <main className="app-shell"><section className="game-frame" aria-live="polite">
    <LabScreens save={previewSave} onPatch={patchPreview} onBack={onClose} preview />
    <button className="global-audio-button" aria-label={previewSave.audio ? "ปิดเสียงเพลง" : "เปิดเสียงเพลง"} aria-pressed={previewSave.audio} onClick={() => patchPreview({ audio: !previewSave.audio })}>{previewSave.audio ? "🔊" : "🔇"}</button>
  </section></main>;
}

function LabScreens({ save, onPatch, onBack, onComplete, preview = false }: {
  save: GameSave; onPatch: (next: Partial<GameSave>) => void; onBack: () => void; onComplete?: () => void; preview?: boolean;
}) {
  if (save.stage === "testHub") return <TestHub save={save} onStart={(room) => onPatch(openLabPatch(save, room))} onBack={onBack} onComplete={onComplete} preview={preview} />;
  if (!LAB_ROOMS.some((room) => room.id === save.stage) && save.stage !== "elasticity") return null;
  const returnToHub = () => onPatch({ stage: "testHub" });
  const draftAnswer = (room: string, materialId: string, answer: string) => onPatch({ labAnswerDrafts: { ...save.labAnswerDrafts, [room]: { ...save.labAnswerDrafts?.[room], [materialId]: answer } } });
  if (save.stage === "compression") return <CompressionLab save={save} onAnswer={(id, answer) => draftAnswer("compression", id, answer)} onSave={(compressionResults, compressionIndex) => onPatch({ compressionResults, compressionIndex })} onDone={returnToHub} preview={preview} />;
  if (save.stage === "impact" || save.stage === "elasticity") return <ImpactLab save={save} onAnswer={(id, answer) => draftAnswer("impact", id, answer)} onSave={(impactResults, impactIndex) => onPatch({ impactResults, impactIndex, stage: "impact" })} onDone={returnToHub} preview={preview} />;
  if (save.stage === "absorption") return <AbsorptionLab save={save} onSave={(absorptionResults, absorptionIndex) => onPatch({ absorptionResults, absorptionIndex })} onDone={returnToHub} preview={preview} />;
  return null;
}

function TestHub({ save, onStart, onBack, onComplete, preview }: {
  save: GameSave; onStart: (room: LabRoom) => void; onBack: () => void; onComplete?: () => void; preview: boolean;
}) {
  const complete = allLabsComplete(save);
  return (
    <div className="screen test-hub-screen">
      <img className="group-design-bg" src={asset("compression/lab_background.png")} alt="" />
      <button className="button button-white lab-back-button" onClick={onBack}>{preview ? "‹ กลับหน้าปก" : "‹ กลับไปเลือกทีม"}</button>
      <header className="test-hub-header">
        <div><h1>เลือกห้องทดลอง</h1><p>สมบัติที่เราเลือกศึกษา · วัสดุ {LAB_MATERIALS.length} ชนิด</p></div>
      </header>
      <section className="test-room-grid" aria-label="ห้องทดสอบทั้งหมด">
        {LAB_ROOMS.map((room) => {
          const count = labResultCount(save, room.id);
          return <article key={room.id} className={`test-room-card test-room-${room.id}`}>
            <span className="test-room-icon" aria-hidden="true"><img src={asset(`menu/lab-room-${room.id}.png`)} alt="" /></span>
            <small>ห้องที่ {room.number}</small><h2>{room.title}</h2>
            <div className="test-room-description"><p>{room.observation}</p><p>{room.purpose}</p></div>
            <div className="test-room-progress">{count === LAB_MATERIALS.length ? (room.notice ? "✓ บันทึกกิจกรรมเดิมครบแล้ว" : "✓ ทดลองครบแล้ว") : `บันทึกแล้ว ${count}/${LAB_MATERIALS.length} วัสดุ`}</div>
            <button className="button button-orange" onClick={() => onStart(room.id)} aria-label={`เข้าห้องทดสอบ${room.title}`}>{room.notice ? "เปิดกิจกรรมเดิม" : count === LAB_MATERIALS.length ? "ทดลองอีกครั้ง" : count ? "ทดลองต่อ" : "เข้าห้องทดลอง"}</button>
          </article>;
        })}
      </section>
      <footer className="test-hub-footer"><p>{preview ? "ทดลองอิสระ · ไม่บันทึกผลเข้าทีม" : "ผลที่บันทึกในแต่ละห้องจะเก็บในภารกิจของทีม"}<br /><small>{complete ? "✓ บันทึกผลครบทั้ง 3 ห้องแล้ว" : "กดบันทึกผลในแต่ละห้อง แล้วกลับมาเลือกห้องต่อไปได้"}</small></p>
        {onComplete && <button className="button button-orange" disabled={!complete} onClick={onComplete}>ทบทวนผลการทดลอง ›</button>}
      </footer>
    </div>
  );
}

function Recap({ index, answers, onAnswer, onIndex, onDone }: { index: number; answers: Record<string, number[]>; onAnswer: (answers: Record<string, number[]>) => void; onIndex: (n: number) => void; onDone: () => void }) {
  const advancing = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { advancing.current = false; return () => clearTimeout(advanceTimer.current); }, [index]);
  const [message, setMessage] = useState("เลือกคำตอบของทีม");
  const item = RECAP[index];
  const choose = (choice: number) => {
    if (advancing.current) return;
    const key = String(index);
    onAnswer({ ...answers, [key]: [...(answers[key] ?? []), choice] });
    if (choice !== item.answer) { setMessage("ลองคิดจากสิ่งที่เพิ่งทดลองอีกครั้งนะ"); return; }
    setMessage("ถูกต้อง!");
    advancing.current = true;
    advanceTimer.current = setTimeout(() => { setMessage("เลือกคำตอบของทีม"); if (index >= RECAP.length - 1) onDone(); else onIndex(index + 1); }, 500);
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
      ? `กด: ยุบ ${compression.deformationMm ?? compression.measurements.at(-1) ?? 0} มม. · น้ำ: ซึม ${absorption.absorbed} หน่วย · ยืด: คืน ${elasticity.recovered} มม.`
      : "รอเลือกวัสดุ";
    return <label key={part}><b>{part}</b><select value={values[part] ?? ""} onChange={(event) => onChange({ ...values, [part]: event.target.value })}><option value="">เลือกวัสดุ</option>{MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><span>{report}</span></label>;
  })}</div><button className="button button-orange prediction-done" disabled={!complete} onClick={onDone}>บันทึกคำตอบทีม</button></div>;
}

function Summary({ save, onReplay, onReset }: { save: GameSave; onReplay: () => void; onReset: () => void }) {
  const names = save.team.map((m) => m.name).join(" · ");
  const labsComplete = allLabsComplete(save);
  return <div className="screen summary-screen"><div className="summary-card">
    <div className="step-pill">{labsComplete ? "จบภารกิจทดลองวัสดุ" : "จบกิจกรรมคาบที่ 1"}</div><div className="medal">🔎</div>
    <h1>{labsComplete ? "บันทึกกิจกรรมทดลองที่เปิดใช้ครบแล้ว!" : "วิเคราะห์ปัญหาและกำหนดสมบัติที่ต้องศึกษาเรียบร้อยแล้ว"}</h1><p>{names}</p>
    <section className="summary-next-lesson"><span>{labsComplete ? "สิ่งที่ได้สังเกต" : "คาบต่อไป"}</span><h2>{labsComplete ? "ความต้านทานแรงกดทับ การลดความเสียหายจากแรงกระแทก และการดูดซับน้ำ" : "เราจะทดสอบสมบัติของวัสดุทั้ง 3 ด้าน"}</h2>{labsComplete && <p>นำสิ่งที่สังเกตจากแบบจำลองมาเปรียบเทียบและอภิปรายร่วมกัน</p>}</section>
    <div className="summary-actions"><button className="button button-yellow" onClick={onReplay}>เริ่มภารกิจรอบใหม่</button><button className="button button-white" onClick={onReset}>กลับหน้าปก</button></div>
  </div></div>;
}
