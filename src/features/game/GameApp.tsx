"use client";

import { readValueAnswer, writeValueAnswer } from "./exit-ticket-values";

import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import {
  AVATARS, BOX_MISSION_GOALS, BOX_PARTS, DAMAGE_CAUSES, DAMAGES, EMPTY_SAVE, MATERIALS, RECAP, STORY,
  type CompressionResult, type DamageCause, type ElasticityResult, type ExitTicket, type GameSave, type ImpactResult, type Stage, type TeamMember, type WaterAbsorptionResult,
} from "./data";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createBrowserId } from "@/lib/browser-id";
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
import { runProgress, STAGE_LABELS } from "@/features/tracking/progress";
import type { ActiveRunRef, LegacyBundle, SaveIndicator, TeamOverview } from "@/features/tracking/types";
import { answerEvents } from "@/features/tracking/answer-events";
import { MAX_TEAM_MEMBERS, MIN_TEAM_MEMBERS, validateTeamDraft } from "@/features/tracking/validation";
import { allLabsComplete, canContinueAfterLabs, LAB_MATERIALS, LAB_ROOMS, LAB_ROOMS_ENABLED, LAB_STAGES, labQuestionIndex, labRecapRequired, labResultCount, openLabPatch, restartMissionTwoLabsPatch, type LabRoom } from "./labs";
import { STUDY_TOPICS, studyTopicLabel } from "./learning-topics";
import { CompressionLab } from "./CompressionLab";
import { ImpactLab } from "./ImpactLab";
import { AbsorptionLab } from "./AbsorptionLab";
import { resumeLabStage } from "./impact";
import { MissionOverview } from "./MissionOverview";
import {
  blocksMissionSwitch,
  COMPLETED_RUN_STAGES,
  completedMissionsForTeam,
  finishMissionState,
  latestRunForTeamMission,
  missionOneAnswerProgress,
  nextUnlockMission,
  runMissionNumber,
  visibleCompletedMissions,
  type MissionNumber,
} from "./mission-runs";
import { MissionThreeScreen, type MissionThreeStage } from "./MissionThree";
import { attendingMembers, exitTicketKey, reconcileExitTickets } from "./team-attendance";
import { isStructuredExitTicketComplete, KNOWLEDGE_MATCHES, PROCESS_MATCHES, readExitTicketMatches, type ExitTicketMatchItem } from "./exit-ticket-progress";
import { shouldAutoResume, stageAfterChoosingTeam } from "./resume-stage";
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
import { detectRenderCompatibility, installModelViewerInputFallback, reportRendererStatus, type RenderCompatibilityProfile } from "./browser-compat";
import { CompatibilityDiagnostics } from "./CompatibilityDiagnostics";
import { LegacyGlbViewer, type LegacyGlbViewerHandle } from "./LegacyGlbViewer";
import { AppIcon, type AppIconName } from "@/components/AppIcon";

const SAVE_KEY = "parcel-lab-web-save-v1";
const STATS_KEY = "parcel-lab-group-design-statistics-v1";
const SELECTED_TEAM_KEY = "parcel-lab-selected-team-id-v1";
const IPAD_MINI_2_WIDTH = 1024;
const IPAD_MINI_2_HEIGHT = 768;
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const PREDICTION_ENABLED = false;
const MISSION_TWO_ALWAYS_UNLOCKED = true;
const DISABLED_LAB_STAGES = new Set<Stage>(LAB_STAGES);
const MISSION_ONE_BIG_QUESTION_PROGRESS = "เราทราบแล้วว่าต้องศึกษาสมบัติ 3 ด้าน แต่ยังไม่ทราบว่าวัสดุชนิดใดเหมาะกับแต่ละหน้าที่";
const MISSION_ONE_PHASES: Partial<Record<Stage, { step: number; label: string; icon: AppIconName }>> = {
  mission: { step: 1, label: "เกริ่นภารกิจ", icon: "map" },
  story: { step: 2, label: "ติดตามสถานการณ์ 9 ฉาก", icon: "movie" },
  inspection: { step: 3, label: "สำรวจร่องรอย", icon: "search" },
  boxMission: { step: 4, label: "กำหนดภารกิจของกล่อง", icon: "target" },
  materials: { step: 5, label: "สำรวจวัสดุ", icon: "brick" },
  studyFocus: { step: 6, label: "เลือกสมบัติที่ต้องศึกษา", icon: "star" },
  exitTicket: { step: 7, label: "คำถามรายบุคคล", icon: "pencil" },
  mission1Complete: { step: 8, label: "ทำภารกิจสำเร็จ", icon: "party" },
};

function createRunId() {
  return createBrowserId();
}

function asset(path: string) {
  return `${BASE_PATH}/assets/${path}`;
}

function completedMissionTwoLabQaSave(audio = true): GameSave {
  const compressionResults: Record<string, CompressionResult> = Object.fromEntries(LAB_MATERIALS.map(({ id }) => [id, { materialId: id, measurements: [], observation: "none" }]));
  const impactResults: Record<string, ImpactResult> = Object.fromEntries(LAB_MATERIALS.map(({ id }) => [id, { materialId: id, observation: "none", simulatedDamage: "none", method: "egg-drop-v1", modelVersion: "illustrative-v1", conditions: { object: "same-model-egg", height: "fixed", specimen: "equal-size" } }]));
  const absorptionResults: Record<string, WaterAbsorptionResult> = Object.fromEntries(LAB_MATERIALS.map(({ id }) => [id, { materialId: id, summary: "", observation: "none" }]));
  return {
    ...EMPTY_SAVE,
    stage: "testHub",
    mission1Completed: true,
    audio,
    compressionResults,
    impactResults,
    absorptionResults,
    recapAnswers: Object.fromEntries(RECAP.map((question, index) => [String(index), [question.answer]])),
  };
}

function MaterialIcon({ icon }: { icon: string }) {
  if (icon === "package" || icon === "bubbles") return <AppIcon name={icon} />;
  return <>{icon}</>;
}

function IpadMiniCanvas({ children }: { children: ReactNode }) {
  const [isAppleMobile, setIsAppleMobile] = useState(false);
  const [isStandalonePwa, setIsStandalonePwa] = useState(false);
  const [simulationScale, setSimulationScale] = useState(1);

  useEffect(() => {
    const userAgent = window.navigator.userAgent;
    // Only target Apple mobile user agents. Some desktop and embedded browsers
    // report MacIntel with touch points, which must not trigger the iPad lock.
    setIsAppleMobile(/iPad|iPhone|iPod/.test(userAgent));
    setIsStandalonePwa(
      window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
  }, []);

  useEffect(() => {
    const updateScale = () => {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const nextScale = Math.min(viewportWidth / IPAD_MINI_2_WIDTH, viewportHeight / IPAD_MINI_2_HEIGHT);
      setSimulationScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    window.visualViewport?.addEventListener("resize", updateScale);
    return () => {
      window.removeEventListener("resize", updateScale);
      window.visualViewport?.removeEventListener("resize", updateScale);
    };
  }, []);

  return (
    <main
      className={`app-shell${isAppleMobile ? " apple-mobile" : ""}${isStandalonePwa ? " standalone-pwa" : ""}`}
      style={{ "--simulation-scale": simulationScale } as CSSProperties}
    >
      <section className="game-viewport" aria-label="พื้นที่ Simulation ขนาด iPad mini 2 1024 คูณ 768">
        <div className="game-frame" aria-live="polite">{children}</div>
      </section>
      <FullscreenInstallHelp />
      <aside className="orientation-notice" role="status" aria-live="assertive">
        <AppIcon className="orientation-notice-icon" name="expand" />
        <strong>หมุน iPad เป็นแนวนอน</strong>
        <p>เกมนี้ออกแบบให้เล่นเต็มจอที่ขนาด iPad mini 2 (1024 × 768)</p>
      </aside>
      <CompatibilityDiagnostics />
    </main>
  );
}

function FullscreenInstallHelp() {
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const appleMobile = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsIosSafari(appleMobile && !standalone);
  }, []);

  if (!isIosSafari) return null;

  return <>
    <button className="pwa-install-button" type="button" onClick={() => setOpen(true)}><AppIcon name="expand" /> เปิดเต็มจอ</button>
    {open && <div className="pwa-install-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="pwa-install-card" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
        <button className="pwa-install-close" type="button" onClick={() => setOpen(false)} aria-label="ปิดคำแนะนำ"><AppIcon name="x" /></button>
        <AppIcon name="expand" />
        <h2 id="pwa-install-title">เปิดเกมแบบเต็มจอ</h2>
        <p>Safari บน iPad mini 2 ซ่อนแถบด้านบนไม่ได้ขณะเปิดผ่านเว็บ ให้เพิ่มเกมเป็นแอปก่อนหนึ่งครั้ง</p>
        <ol>
          <li>แตะปุ่ม <b>แชร์</b> ⎋ ใน Safari</li>
          <li>เลือก <b>เพิ่มไปยังหน้าจอโฮม</b></li>
          <li>เปิดไอคอน <b>กล่องแกร่ง</b> จากหน้าจอโฮมในแนวนอน</li>
        </ol>
        <small>เมื่อเปิดจากไอคอน เกมจะเต็มจอโดยไม่มีแถบ Safari</small>
      </section>
    </div>}
  </>;
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
  const [selectedMission, setSelectedMission] = useState<MissionNumber>(1);
  const [teamSetupFlow, setTeamSetupFlow] = useState<"select" | "start">("select");
  const [unlockingMission, setUnlockingMission] = useState<MissionNumber | null>(null);
  const [activeRun, setActiveRun] = useState<ActiveRunRef | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<TeamOverview | null>(null);
  const [missionStartError, setMissionStartError] = useState("");
  const [, setSaveIndicator] = useState<SaveIndicator>("idle");
  const [legacyBundle, setLegacyBundle] = useState<LegacyBundle>({ save: null, statistics: [] });
  const bgmRef = useRef<HTMLAudioElement>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const syncTimerRef = useRef<number | undefined>(undefined);
  const completedRunRef = useRef<string | null>(null);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const previewMode = query.get("preview");
    if (previewMode === "purpose") {
      setSave({ ...EMPTY_SAVE, stage: "purpose" });
      setLoaded(true);
      return;
    }
    if (previewMode === "labs") {
      setSave(query.get("qa") === "all-labs" ? completedMissionTwoLabQaSave() : { ...EMPTY_SAVE, stage: "testHub", mission1Completed: true });
      setLoaded(true);
      return;
    }
    if (previewMode === "mission1") {
      setSave({ ...EMPTY_SAVE, stage: "mission" });
      setLoaded(true);
      return;
    }
    if (previewMode === "mission1-complete") {
      setSave({ ...EMPTY_SAVE, stage: "mission1Complete", mission1Completed: true, bigQuestionProgress: { mission1: MISSION_ONE_BIG_QUESTION_PROGRESS } });
      setLoaded(true);
      return;
    }
    if (previewMode === "mission2") {
      setSave({ ...EMPTY_SAVE, stage: "mission2Review", mission1Completed: true });
      setLoaded(true);
      return;
    }
    if (previewMode === "mission2-question") {
      setSave({ ...EMPTY_SAVE, stage: "mission2Question", mission1Completed: true });
      setLoaded(true);
      return;
    }
    if (previewMode === "mission2-parts") {
      setSave({ ...EMPTY_SAVE, stage: "mission2Parts", mission1Completed: true });
      setLoaded(true);
      return;
    }
    if (previewMode === "mission2-overview") {
      setSave({ ...EMPTY_SAVE, stage: "mission2Intro", mission1Completed: true });
      setLoaded(true);
      return;
    }
    if (previewMode === "mission2-summary") {
      setSave({ ...EMPTY_SAVE, stage: "comparison", mission1Completed: true });
      setLoaded(true);
      return;
    }
    if (previewMode === "mission2-assessment") {
      setSave({
        ...EMPTY_SAVE,
        stage: "mission2Assessment",
        mission1Completed: true,
        team: AVATARS.slice(0, 4).map((avatar, index) => ({ name: `นักเรียน ${index + 1}`, avatar, position: index, present: true })),
      });
      setLoaded(true);
      return;
    }
    if (previewMode === "mission2-complete") {
      setSave({
        ...EMPTY_SAVE,
        stage: "mission2Complete",
        mission1Completed: true,
        mission2Completed: true,
        team: AVATARS.slice(0, 4).map((avatar, index) => ({ name: `นักเรียน ${index + 1}`, avatar, position: index, present: true })),
      });
      setLoaded(true);
      return;
    }
    if (previewMode === "box-mission") {
      setSave({ ...EMPTY_SAVE, stage: "boxMission" });
      setLoaded(true);
      return;
    }
    if (previewMode === "inspection") {
      setSave({ ...EMPTY_SAVE, stage: "inspection" });
      setLoaded(true);
      return;
    }
    if (previewMode === "materials") {
      setSave({ ...EMPTY_SAVE, stage: "materials" });
      setLoaded(true);
      return;
    }
    if (previewMode === "mission3") {
      // Preview mode is for visual QA, so open Mission 3 directly without
      // touching a live team's Supabase run or competing with another tab.
      setSelectedMission(3);
      setSave({ ...EMPTY_SAVE, stage: "mission3Intro", mission2Completed: true });
      setLoaded(true);
      return;
    }
    const legacy = readLegacyBundle();
    setLegacyBundle(legacy);
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const parsed = raw ? JSON.parse(raw) as Partial<GameSave> : null;
      if (!configured && parsed) {
        const savedStage = (parsed as { stage?: string }).stage;
        const restoredStage = savedStage === "design" ? "exitTicket" : (savedStage as Stage | undefined) ?? EMPTY_SAVE.stage;
        setSave({
          ...EMPTY_SAVE,
          ...parsed,
          stage: !PREDICTION_ENABLED && restoredStage === "prediction" ? "summary" : resumeLabStage(restoredStage),
          studyFocus: parsed.studyFocus ?? { compression: true, water: true, elasticity: true },
        });
      }
      if (configured && parsed?.stage === "overview") {
        let cancelled = false;
        const selectedTeamId = localStorage.getItem(SELECTED_TEAM_KEY);
        void listTeams()
          .then((teams) => {
            if (cancelled) return;
            const team = teams.find((candidate) => candidate.id === selectedTeamId);
            if (!team) {
              setSave({ ...EMPTY_SAVE, audio: parsed.audio ?? EMPTY_SAVE.audio, stage: "team" });
              return;
            }
            const completed = new Set(completedMissionsForTeam(team));
            const restored: GameSave = {
              ...EMPTY_SAVE,
              ...parsed,
              team: team.members,
              mission1Completed: completed.has(1),
              mission2Completed: completed.has(2),
              mission3Completed: completed.has(3),
              stage: "overview",
            };
            setSelectedTeam(team);
            saveRef.current = restored;
            setSave(restored);
          })
          .catch(() => {
            if (!cancelled) setSave({ ...EMPTY_SAVE, audio: parsed.audio ?? EMPTY_SAVE.audio, stage: "team" });
          })
          .finally(() => { if (!cancelled) setLoaded(true); });
        return () => { cancelled = true; };
      }
      if (configured && parsed && shouldAutoResume(parsed)) {
        let cancelled = false;
        void listTeams()
          .then((teams) => {
            if (cancelled) return;
            const team = teams.find((candidate) => candidate.activeRun?.saveState.runId === parsed.runId);
            const run = team?.activeRun;
            if (!team || !run) return;
            const persistedMembers = run.saveState.team?.length ? run.saveState.team : team.members;
            const sessionMembers = attendingMembers(persistedMembers);
            const exitTickets = reconcileExitTickets(run.saveState.team ?? [], sessionMembers, run.saveState.exitTickets ?? {});
            const restored: GameSave = {
              ...EMPTY_SAVE,
              ...run.saveState,
              team: sessionMembers,
              exitTickets,
              stage: stageAfterChoosingTeam(run.currentStage, 1),
            };
            setSelectedTeam(team);
            activeRunIdRef.current = run.id;
            setActiveRun({ id: run.id, teamId: run.teamId, revision: run.revision });
            completedRunRef.current = null;
            markSupabaseCacheBound();
            saveRef.current = restored;
            setSave(restored);
            setSaveIndicator("saved");
          })
          .catch(() => undefined)
          .finally(() => { if (!cancelled) setLoaded(true); });
        return () => { cancelled = true; };
      }
    } catch { /* keep a fresh save if storage is blocked or malformed */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    const isPreview = Boolean(new URLSearchParams(window.location.search).get("preview"));
    if (loaded && !isPreview) {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
      catch { /* continue without local persistence in restricted Safari modes */ }
    }
  }, [loaded, save]);

  const syncAnswers = async (runId?: string) => {
    try {
      const persisted = await flushOutbox(runId);
      if (!persisted || activeRunIdRef.current !== persisted.id) return;
      if (persisted.status === "completed") {
        completedRunRef.current = persisted.id;
        activeRunIdRef.current = null;
        setActiveRun(null);
        setSelectedTeam((current) => current?.id === persisted.teamId ? {
          ...current,
          activeRun: null,
          runs: [persisted, ...current.runs.filter((run) => run.id !== persisted.id)],
          completedRuns: [persisted, ...current.completedRuns.filter((run) => run.id !== persisted.id)],
        } : current);
      } else {
        setActiveRun({ id: persisted.id, teamId: persisted.teamId, revision: persisted.revision });
      }
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
    if (!activeRun || completedRunRef.current === activeRun.id || ["menu", "team"].includes(merged.stage)) return;
    const events = answerEvents(current, next);
    try {
      queueCheckpoint(activeRun, merged, events, COMPLETED_RUN_STAGES.has(merged.stage));
      setSaveIndicator("saving");
    } catch {
      setSaveIndicator("offline");
    }
    // Durable queue is written synchronously above. Debounce only the network.
    window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => { void syncAnswers(activeRun.id); }, 350);
  };
  const go = (stage: Stage) => patch({ stage });
  // Leaving an individual-answer screen must preserve its active run and
  // every draft, including after a browser refresh. The route map is a local
  // navigation surface: never persist "overview" over the run checkpoint.
  const showMissionOverview = () => {
    const runId = activeRunIdRef.current ?? undefined;
    const next = { ...saveRef.current, stage: "overview" as const };
    saveRef.current = next;
    setSave(next);
    void syncAnswers(runId);
  };
  const toggleAudio = () => {
    const nextAudio = !save.audio;
    patch({ audio: nextAudio });
    if (nextAudio) void bgmRef.current?.play().catch(() => undefined);
  };
  const reset = () => {
    if (!configured) {
      try { localStorage.removeItem(SAVE_KEY); }
      catch { /* storage may be unavailable in restricted Safari modes */ }
    }
    activeRunIdRef.current = null;
    setActiveRun(null);
    setSelectedTeam(null);
    setMissionStartError("");
    try { localStorage.removeItem(SELECTED_TEAM_KEY); }
    catch { /* continue when storage is unavailable */ }
    setTeamSetupFlow("select");
    setSave(EMPTY_SAVE);
  };
  const leaveRunToTeams = () => {
    activeRunIdRef.current = null;
    setActiveRun(null);
    setSelectedTeam(null);
    setMissionStartError("");
    try { localStorage.removeItem(SELECTED_TEAM_KEY); }
    catch { /* continue when storage is unavailable */ }
    setTeamSetupFlow("select");
    setSave((current) => ({ ...current, stage: "team" }));
  };
  const selectTeamForOverview = (team: TeamOverview) => {
    activeRunIdRef.current = null;
    setActiveRun(null);
    completedRunRef.current = null;
    setSelectedTeam(team);
    setMissionStartError("");
    try { localStorage.setItem(SELECTED_TEAM_KEY, team.id); }
    catch { /* the selected team remains available for this session */ }
    setTeamSetupFlow("select");
    const completed = new Set(completedMissionsForTeam(team));
    setUnlockingMission(nextUnlockMission(completed));
    const missionOneState = latestRunForTeamMission(team, 1)?.saveState;
    const next: GameSave = {
      ...EMPTY_SAVE,
      audio: saveRef.current.audio,
      team: team.members,
      mission1Completed: completed.has(1),
      mission2Completed: completed.has(2),
      mission3Completed: completed.has(3),
      bigQuestionProgress: missionOneState?.bigQuestionProgress ?? {},
      stage: "overview",
    };
    saveRef.current = next;
    setSave(next);
  };
  const selectLocalTeamForOverview = (team: TeamMember[]) => {
    activeRunIdRef.current = null;
    setActiveRun(null);
    completedRunRef.current = null;
    setTeamSetupFlow("select");
    const completed: MissionNumber[] = [];
    if (saveRef.current.mission1Completed) completed.push(1);
    if (saveRef.current.mission2Completed) completed.push(2);
    if (saveRef.current.mission3Completed) completed.push(3);
    setUnlockingMission(nextUnlockMission(completed));
    const next = { ...saveRef.current, team, stage: "overview" as const };
    saveRef.current = next;
    setSave(next);
  };
  const openTeam = async (team: TeamOverview, mission = selectedMission, isReplaying = false, targetStage?: Stage) => {
    // Finish/recover this team's durable queue before loading server state.
    for (const queued of readOutbox().filter((item) => item.run.teamId === team.id)) await flushOutbox(queued.run.id);
    let currentTeam = (await listTeams()).find((candidate) => candidate.id === team.id) ?? team;
    const selectedMemberKeys = new Set(attendingMembers(team.members).map((member) => member.id ?? `${member.name}|${member.avatar}`));
    const rosterWithAttendance = currentTeam.members.map((member) => ({
      ...member,
      present: selectedMemberKeys.has(member.id ?? `${member.name}|${member.avatar}`),
    }));
    const selectedMembers = attendingMembers(rosterWithAttendance);
    if (!selectedMembers.length) throw new Error("เลือกสมาชิกที่มาเรียนอย่างน้อย 1 คน");

    // Each mission gets its own durable run and attendance snapshot. When the
    // teacher intentionally starts the next mission, preserve the previous
    // run as completed before creating the new one; no answers are deleted.
    const previousRun = currentTeam.activeRun;
    if (previousRun && (runMissionNumber(previousRun) !== mission || isReplaying)) {
      const previousMission = runMissionNumber(previousRun);
      if (blocksMissionSwitch(previousMission, mission, isReplaying)) throw new Error(`ทีมนี้กำลังทำภารกิจที่ ${previousMission} อยู่ กรุณาทำภารกิจนั้นต่อให้เสร็จก่อน`);
      queueCheckpoint(
        { id: previousRun.id, teamId: previousRun.teamId, revision: previousRun.revision },
        finishMissionState(previousRun, previousMission),
        [],
        true,
      );
      const completedRun = await flushOutbox(previousRun.id);
      if (!completedRun || completedRun.status !== "completed") throw new Error("ยังบันทึกภารกิจก่อนหน้าไม่สำเร็จ กรุณาลองอีกครั้ง");
      currentTeam = {
        ...currentTeam,
        activeRun: null,
        runs: [completedRun, ...currentTeam.runs.filter((run) => run.id !== completedRun.id)],
        completedRuns: [completedRun, ...currentTeam.completedRuns.filter((run) => run.id !== completedRun.id)],
      };
    }

    const attendingTeam = { ...currentTeam, members: selectedMembers };
    const run = await startOrResumeRun(attendingTeam, mission, rosterWithAttendance, {
      mission1Completed: save.mission1Completed || mission > 1,
      mission2Completed: save.mission2Completed || mission > 2,
      mission3Completed: save.mission3Completed,
      bigQuestionProgress: save.bigQuestionProgress,
    });
    // Attendance belongs to the mission when it starts. Resuming must not
    // silently replace that snapshot with a later roster selection.
    const sessionMembers = currentTeam.activeRun && run.saveState.team?.length ? run.saveState.team : selectedMembers;
    const exitTickets = reconcileExitTickets(run.saveState.team ?? [], sessionMembers, run.saveState.exitTickets ?? {});
    const mission2Assessments = reconcileExitTickets(run.saveState.team ?? [], sessionMembers, run.saveState.mission2Assessments ?? {});
    const serverState = { ...EMPTY_SAVE, ...run.saveState, team: sessionMembers, exitTickets, mission2Assessments, stage: run.currentStage };
    // "ทำภารกิจต่อ" must honor the server checkpoint. Only a team without an
    // active run should enter at the beginning of the mission selected on the map.
    const restoredStage = targetStage ?? stageAfterChoosingTeam(currentTeam.activeRun ? run.currentStage : null, mission);
    const restored = { ...serverState, stage: restoredStage };
    setSelectedTeam({
      ...currentTeam,
      activeRun: run,
      runs: [run, ...currentTeam.runs.filter((item) => item.id !== run.id)],
    });
    setMissionStartError("");
    try { localStorage.setItem(SELECTED_TEAM_KEY, team.id); }
    catch { /* the selected team remains available for this session */ }
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
    return createTeam(name, members);
  };
  const updateExistingTeam = async (teamId: string, members: TeamMember[]) => updateTeamMembers(teamId, members);
  const importExistingTeam = async (name: string) => {
    const team = await importLegacyBundle(name, legacyBundle);
    markLegacyImported();
    setLegacyBundle({ save: null, statistics: [] });
    return team;
  };
  const startNewAttempt = async () => {
    if (!configured || !selectedTeam) {
      patch({ ...EMPTY_SAVE, team: save.team, audio: save.audio, stage: "mission", runId: createRunId() });
      return;
    }
    await openTeam(selectedTeam, selectedMission, true);
  };
  const startMissionFromOverview = async (mission: MissionNumber, isReplaying = false) => {
    setSelectedMission(mission);
    setMissionStartError("");
    if (!configured && save.team.length >= MIN_TEAM_MEMBERS) {
      patch({
        ...EMPTY_SAVE,
        team: save.team,
        audio: save.audio,
        runId: createRunId(),
        stage: mission === 3 ? "mission3Intro" : mission === 2 ? "mission2Review" : "mission",
      });
      return;
    }
    let teamToOpen = selectedTeam;
    if (!teamToOpen && configured) {
      try {
        const selectedTeamId = localStorage.getItem(SELECTED_TEAM_KEY);
        if (selectedTeamId) {
          teamToOpen = (await listTeams()).find((team) => team.id === selectedTeamId) ?? null;
          if (teamToOpen) setSelectedTeam(teamToOpen);
        }
      } catch { /* show one clear error on the route map below */ }
    }
    if (!teamToOpen) {
      setMissionStartError("ไม่พบทีมที่เลือก กรุณากลับไปเลือกทีมหนึ่งครั้ง");
      return;
    }
    try {
      await openTeam(teamToOpen, mission, isReplaying);
    } catch (error) {
      console.error("Unable to start the selected mission", error);
      // The team was already checked in before reaching the route map. Keep
      // the learner on the map when a run cannot start; never ask attendance
      // a second time as an error fallback.
      setMissionStartError(userFacingError(error, "เปิดภารกิจไม่สำเร็จ กรุณาลองอีกครั้ง"));
    }
  };
  const openMission = (mission: MissionNumber) => { void startMissionFromOverview(mission); };
  const replayCompletedMission = (mission: MissionNumber) => {
    void startMissionFromOverview(mission, true);
  };
  const resumeMissionOneAnswers = async (team: TeamOverview) => {
    // This is a navigation checkpoint only. The existing run, attendance, and
    // every saved answer stay intact while the group returns to Exit Ticket.
    await openTeam(team, 1, false, "exitTicket");
  };
  const goBack = () => {
    if (labRoomsPaused) { go("exitTicket"); return; }
    if (save.stage === "purpose") { go("menu"); return; }
    if (save.stage === "overview") { setTeamSetupFlow("select"); go("team"); return; }
    if (save.stage === "team") { go(teamSetupFlow === "select" ? "purpose" : "overview"); return; }
    if (save.stage === "mission") { leaveRunToTeams(); return; }
    if (save.stage === "story") {
      if (save.storyIndex > 0) patch({ storyIndex: save.storyIndex - 1 });
      else go("mission");
      return;
    }
    if (save.stage === "inspection") { patch({ stage: "story", storyIndex: STORY.length - 1 }); return; }
    if (save.stage === "boxMission") { go("inspection"); return; }
    if (save.stage === "materials") { go("boxMission"); return; }
    if (save.stage === "studyFocus") { go("materials"); return; }
    if (save.stage === "exitTicket") { go("studyFocus"); return; }
    if (save.stage === "mission2Review") { go("overview"); return; }
    if (save.stage === "mission2Question") { go("mission2Review"); return; }
    if (save.stage === "mission2Parts") { go("mission2Question"); return; }
    if (save.stage === "mission2Intro") { go("mission2Parts"); return; }
    if (save.stage === "testHub") { go("mission2Intro"); return; }
    if (save.stage === "compression") { go("testHub"); return; }
    if (save.stage === "absorption" || save.stage === "impact" || save.stage === "elasticity") { go("testHub"); return; }
    if (save.stage === "notebook" || save.stage === "comparison" || save.stage === "recap") { go("testHub"); return; }
    if (save.stage === "mission2Assessment") { go("comparison"); return; }
    if (save.stage === "mission2Complete") { go("overview"); return; }
    if (save.stage === "mission3Intro") { go("overview"); return; }
    if (save.stage === "mission3Data") { go("mission3Intro"); return; }
    if (save.stage === "mission3Materials") { go("mission3Data"); return; }
    if (save.stage === "mission3Design") { go("mission3Materials"); return; }
    if (save.stage === "mission3Reason") { go("mission3Design"); return; }
    if (save.stage === "mission3Complete") { go("overview"); return; }
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
  const completedMissions = visibleCompletedMissions(selectedTeam, save);

  if (!loaded) return <IpadMiniCanvas><div className="screen loading-screen">กำลังเตรียมห้องทดลอง…</div></IpadMiniCanvas>;
  return (
    <IpadMiniCanvas>
      <audio ref={bgmRef} className="game-bgm" src={asset("audio/happy_clappy_loop.ogg")} autoPlay loop muted={!save.audio} />
        {save.stage === "menu" && <MainMenu onStart={() => go("purpose")} />}
        {save.stage === "purpose" && <MissionPurpose onBack={() => go("menu")} onDone={() => { setTeamSetupFlow("select"); go("team"); }} />}
        {save.stage === "overview" && <MissionOverview mission2Unlocked={MISSION_TWO_ALWAYS_UNLOCKED} mission3Unlocked={completedMissions.includes(2)} completedMissions={completedMissions} mission1Answer={save.bigQuestionProgress.mission1} startError={missionStartError} unlockingMission={unlockingMission} onUnlockAnimationDone={() => setUnlockingMission(null)} onBack={() => { setMissionStartError(""); setTeamSetupFlow("select"); go("team"); }} onSelect={openMission} onReplay={replayCompletedMission} />}
        {labRoomsPaused && <LabRoomsPaused onContinue={() => go(PREDICTION_ENABLED ? "prediction" : "summary")} />}
        {!labRoomsPaused && save.stage === "team" && <TeamSetup flowMode={teamSetupFlow} preferredTeamId={selectedTeam?.id} selectedMission={selectedMission} initial={save.team} legacyBundle={legacyBundle} legacyAlreadyImported={wasLegacyImported()} onBack={() => go(teamSetupFlow === "select" ? "purpose" : "overview")} onSelectTeam={selectTeamForOverview} onSelectLocal={selectLocalTeamForOverview} onChoose={openTeam} onResumeMissionOneAnswers={resumeMissionOneAnswers} onCreate={createAndOpenTeam} onUpdate={updateExistingTeam} onImport={importExistingTeam} onLocalDone={(team) => selectedMission === 3
          ? patch({ team, runId: save.runId || createRunId(), stage: "mission3Intro" })
          : patch({ ...EMPTY_SAVE, team, audio: save.audio, runId: createRunId(), stage: selectedMission === 2 ? "mission2Review" : "mission" })} />}
        {!labRoomsPaused && save.stage === "mission" && <MissionRoute onBack={reset} onDone={() => {
          const firstScene = STORY[save.storyIndex] ?? STORY[0];
          void playStorySound(STORY_SOUND_BY_IMAGE[firstScene[0]], save.audio).then(() => go("story"));
        }} />}
        {!labRoomsPaused && save.stage === "story" && <ComicStory index={save.storyIndex} audio={save.audio} onIndex={(storyIndex) => patch({ storyIndex })} onDone={() => go("inspection")} />}
        {!labRoomsPaused && save.stage === "inspection" && <DamageInspection findings={save.inspectionFindings} audio={save.audio} onFinding={(inspectionFindings) => patch({ inspectionFindings })} onReset={() => patch({ inspectionFindings: {}, inspectionIndex: 0 })} onDone={() => go("boxMission")} />}
        {!labRoomsPaused && save.stage === "boxMission" && <BoxMissionScreen values={save.boxMissionGoals ?? {}} onBack={() => go("inspection")} onChange={(boxMissionGoals) => patch({ boxMissionGoals })} onDone={() => go("materials")} />}
        {!labRoomsPaused && save.stage === "materials" && <MaterialGuide onBack={() => go("boxMission")} onDone={() => go("studyFocus")} />}
        {!labRoomsPaused && save.stage === "studyFocus" && <StudyFocusScreen values={save.studyFocus} onBack={() => go("materials")} onChange={(studyFocus) => patch({ studyFocus })} onDone={() => patch({ stage: "exitTicket", bigQuestionProgress: { ...save.bigQuestionProgress, mission1: MISSION_ONE_BIG_QUESTION_PROGRESS } })} />}
        {!labRoomsPaused && save.stage === "exitTicket" && <ExitTicketScreen key={save.runId} team={save.team} initial={save.exitTickets} confirmations={save.exitTicketConfirmations} onBack={() => go("studyFocus")} onHome={showMissionOverview} onAnswerChange={persistExitTicketAnswers} onSaveDraft={saveExitTicketDraft} onDone={saveExitTickets} />}
        {!labRoomsPaused && save.stage === "mission1Complete" && <MissionOneComplete onHome={() => { setUnlockingMission(2); go("overview"); }} />}
        {!labRoomsPaused && save.stage === "mission2Review" && <MissionTwoReview save={save} onBack={() => go("overview")} onNext={() => go("mission2Question")} />}
        {!labRoomsPaused && save.stage === "mission2Question" && <MissionTwoQuestion onBack={() => go("mission2Review")} onNext={() => go("mission2Parts")} />}
        {!labRoomsPaused && save.stage === "mission2Parts" && <MissionTwoParts save={save} values={save.mission2PartPredictions ?? {}} onBack={() => go("mission2Question")} onChange={(mission2PartPredictions) => patch({ mission2PartPredictions })} onDone={() => go("mission2Intro")} />}
        {!labRoomsPaused && save.stage === "mission2Intro" && <MissionTwoIntro onBack={() => go("mission2Parts")} onStart={() => go("testHub")} />}
        {!labRoomsPaused && <LabScreens save={save} onPatch={patch} onBack={leaveRunToTeams} onComplete={() => go("comparison")} />}
        {!labRoomsPaused && (save.stage === "notebook" || save.stage === "comparison") && <MissionTwoConnection values={save.mission2Connections ?? {}} onBack={() => go("testHub")} onChange={(mission2Connections) => patch({ mission2Connections })} onDone={() => go("mission2Assessment")} />}
        {!labRoomsPaused && save.stage === "recap" && <Recap index={save.recapIndex} answers={save.recapAnswers} onAnswer={(recapAnswers) => patch({ recapAnswers })} onDone={() => go("testHub")} />}
        {!labRoomsPaused && save.stage === "mission2Assessment" && <MissionTwoAssessment team={save.team} values={save.mission2Assessments ?? {}} confirmed={save.mission2AssessmentConfirmed ?? {}} onBack={() => go("comparison")} onChange={(mission2Assessments, mission2AssessmentConfirmed) => patch({ mission2Assessments, mission2AssessmentConfirmed })} onDone={() => { playSound("10_idea_chime.ogg", save.audio); patch({ mission2Completed: true, stage: "mission2Complete" }); }} />}
        {!labRoomsPaused && save.stage === "mission2Complete" && <MissionTwoComplete team={save.team} onHome={() => { setUnlockingMission(3); patch({ mission2Completed: true, stage: "overview" }); }} />}
        {!["menu", "overview", "team"].includes(save.stage) && ["mission3Intro", "mission3Data", "mission3Materials", "mission3Design", "mission3Reason", "mission3Complete"].includes(save.stage) && <MissionThreeScreen stage={save.stage as MissionThreeStage} save={save} onPatch={patch} onBack={goBack} onNext={(stage) => go(stage)} onComplete={() => patch({ mission3Completed: true, stage: "mission3Complete" })} onFinish={() => patch({ mission3Completed: true, stage: "overview" })} />}
        {!labRoomsPaused && PREDICTION_ENABLED && save.stage === "prediction" && <Prediction labsEnabled={LAB_ROOMS_ENABLED} values={save.predictions} compressionResults={save.compressionResults} absorptionResults={save.absorptionResults} elasticityResults={save.elasticityResults} onChange={(predictions) => patch({ predictions })} onDone={() => go("summary")} />}
        {!labRoomsPaused && save.stage === "summary" && <Summary save={save} onReplay={() => void startNewAttempt()} onReset={reset} />}
        {(save.stage === "story" || save.stage === "inspection") && <button className="back-nav-button" onClick={(event) => { event.stopPropagation(); goBack(); }}>‹ ย้อนกลับ</button>}
        {MISSION_ONE_PHASES[save.stage] && <MissionOneProgress stage={save.stage} />}
        <button className="global-audio-button" aria-label={save.audio ? "ปิดเสียงเพลง" : "เปิดเสียงเพลง"} aria-pressed={save.audio} onClick={(event) => { event.stopPropagation(); toggleAudio(); }}><AppIcon name={save.audio ? "volume" : "volume-off"} /></button>
    </IpadMiniCanvas>
  );
}

function MissionOneProgress({ stage }: { stage: Stage }) {
  const phase = MISSION_ONE_PHASES[stage];
  const [expanded, setExpanded] = useState(stage !== "boxMission");
  useEffect(() => {
    if (!expanded) return;
    const timer = window.setTimeout(() => setExpanded(false), 3800);
    return () => window.clearTimeout(timer);
  }, [expanded, stage]);

  if (!phase) return null;
  const percent = Math.round((phase.step / 8) * 100);
  return (
    <aside className={`mission-one-progress mission-one-progress-${stage} ${expanded ? "is-expanded" : "is-collapsed"}`} role="status" aria-label={`ภารกิจที่ 1 ช่วงที่ ${phase.step} จาก 8 ${phase.label}`}>
      {expanded ? <div className="mission-one-progress-details">
        <div className="mission-one-progress-heading"><span>ภารกิจที่ 1</span><b>ช่วงที่ {phase.step}/8</b></div>
        <strong><AppIcon name={phase.icon} />{phase.label}</strong>
        <div className="mission-one-progress-track" role="progressbar" aria-label="ความคืบหน้าภารกิจที่ 1" aria-valuemin={1} aria-valuemax={8} aria-valuenow={phase.step}>
          <i style={{ width: `${percent}%` }} />
        </div>
      </div> : <button className="mission-one-progress-toggle" type="button" aria-label={`เปิดดูความคืบหน้า ช่วงที่ ${phase.step} จาก 8`} onClick={() => setExpanded(true)}>
        <span aria-hidden="true">•••</span>
      </button>}
    </aside>
  );
}

function MissionPurpose({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [showQuestion, setShowQuestion] = useState(false);

  return (
    <div className="screen mission-purpose-screen">
      <img className="mission-purpose-bg" src={asset("menu/cover.png")} alt="" />
      <button className="mission-purpose-back" type="button" onClick={onBack}>‹ กลับหน้าปก</button>
      <section className="mission-purpose-question" aria-labelledby="purpose-question-title">
        <div className="mission-purpose-question-icon"><AppIcon name="message" /></div>
        <div className="mission-purpose-question-content">
          <h1>ภารกิจกล่องแกร่ง คือการช่วยกันสืบหา ทดลอง และเลือกวัสดุ เพื่อสร้างกล่องพัสดุที่ปกป้องสิ่งของได้ดี และใช้วัสดุอย่างคุ้มค่า</h1>
          {!showQuestion && <button className="button mission-purpose-question-trigger" type="button" onClick={() => setShowQuestion(true)}>เปิดคำถามใหญ่ <AppIcon name="message" /></button>}
          {showQuestion && <section className="mission-purpose-popup" aria-labelledby="purpose-question-title" aria-live="polite">
            <b id="purpose-question-title">คำถามใหญ่ของเรา</b>
            <p>เราจะเลือกและใช้วัสดุอย่างไร เพื่อสร้างกล่องพัสดุที่แข็งแรง ป้องกันสิ่งของ และนำวัสดุที่ใช้แล้วกลับมาใช้ใหม่อย่างเหมาะสม โดยมีหลักฐานสนับสนุน?</p>
            <small><AppIcon name="idea" /> เราจะค่อย ๆ สะสมหลักฐานทีละภารกิจ</small>
            <button className="button mission-purpose-start" type="button" onClick={onDone}>ไปสร้างทีม <AppIcon name="continue" /></button>
          </section>}
        </div>
      </section>
    </div>
  );
}

function MainMenu({ onStart }: { onStart: () => void }) {
  return (
    <div className="screen menu-screen">
      <img className="menu-cover" src={asset("menu/cover-labs.png")} alt="เด็ก ๆ กำลังออกแบบกล่องในห้องประดิษฐ์" />
      <div className="menu-glass">
        <p className="menu-kicker">ภารกิจนักออกแบบ</p>
        <h1>กล่องแกร่ง</h1>
        <p>คิด ทดลอง สร้างให้แกร่ง!</p>
        <button className="button button-orange menu-play" onClick={onStart}><AppIcon name="play" /> เริ่มภารกิจ</button>
        <a className="teacher-entry-link" href={`${BASE_PATH}/teacher/`}><AppIcon name="box" /> Dashboard สำหรับครู</a>
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
        <div className="mission-complete-mascot-wrap" aria-hidden="true">
          <span>★</span><span>✦</span>
          <div className="mission-complete-mascot" style={{ backgroundImage: `url(${asset("mascot/parcel-guide-sprite.png")})` }} />
        </div>
        <p className="mission-complete-kicker">เก่งมาก นักสืบกล่องพัสดุ!</p>
        <h1 id="mission-complete-title">ทำภารกิจที่ 1 เสร็จแล้ว</h1>
        <p className="mission-complete-copy">ทุกคนสืบร่องรอยความเสียหาย สำรวจวัสดุ และตอบคำถามครบแล้วภายในเวลาที่กำหนด</p>
        <div className="mission-complete-reward">
          <AppIcon name="unlock" />
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
type AttendanceNextStep = "overview" | "mission" | null;

function TeamSetup({
  flowMode,
  preferredTeamId,
  selectedMission,
  initial,
  legacyBundle,
  legacyAlreadyImported,
  onBack,
  onSelectTeam,
  onSelectLocal,
  onChoose,
  onResumeMissionOneAnswers,
  onCreate,
  onUpdate,
  onImport,
  onLocalDone,
}: {
  flowMode: "select" | "start";
  preferredTeamId?: string;
  selectedMission: MissionNumber;
  initial: TeamMember[];
  legacyBundle: LegacyBundle;
  legacyAlreadyImported: boolean;
  onBack: () => void;
  onSelectTeam: (team: TeamOverview) => void;
  onSelectLocal: (team: TeamMember[]) => void;
  onChoose: (team: TeamOverview) => Promise<void>;
  onResumeMissionOneAnswers: (team: TeamOverview) => Promise<void>;
  onCreate: (name: string, team: TeamMember[]) => Promise<TeamOverview>;
  onUpdate: (teamId: string, team: TeamMember[]) => Promise<TeamOverview>;
  onImport: (name: string) => Promise<TeamOverview>;
  onLocalDone: (team: TeamMember[]) => void;
}) {
  const seed = initial.length >= MIN_TEAM_MEMBERS ? initial : Array.from({ length: MIN_TEAM_MEMBERS }, (_, index) => ({ name: "", avatar: AVATARS[index] }));
  const [members, setMembers] = useState<TeamMember[]>(seed);
  const [teamName, setTeamName] = useState("");
  const [legacyTeamName, setLegacyTeamName] = useState("");
  const [mode, setMode] = useState<"existing" | "create">(isSupabaseConfigured() ? "existing" : "create");
  const [teams, setTeams] = useState<TeamOverview[]>([]);
  const [historyTeam, setHistoryTeam] = useState<TeamOverview | null>(null);
  const [editingTeam, setEditingTeam] = useState<TeamOverview | null>(null);
  const [attendanceNextStep, setAttendanceNextStep] = useState<AttendanceNextStep>(null);
  const [rosterDraft, setRosterDraft] = useState<RosterDraftMember[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(isSupabaseConfigured());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localFallback, setLocalFallback] = useState(false);
  const autoOpenedTeamRef = useRef<string | null>(null);
  const configured = isSupabaseConfigured();
  // Keep the original team-selection UI visible even when the online request needs a local fallback.
  const remoteConfigured = configured;
  const validation = validateTeamDraft(teamName, members, remoteConfigured);
  const valid = validation.valid;
  const update = (index: number, next: Partial<TeamMember>) => setMembers((current) => current.map((m, i) => i === index ? { ...m, ...next } : m));
  const addMember = () => {
    const avatar = AVATARS.find((item) => !members.some((member) => member.avatar === item));
    if (!avatar || members.length >= MAX_TEAM_MEMBERS) return;
    setMembers((current) => [...current, { name: "", avatar }]);
  };
  const attendanceKey = (member: TeamMember) => member.id ?? `${member.name}|${member.avatar}`;
  const isPresent = (teamId: string, member: TeamMember) => attendance[teamId]?.[attendanceKey(member)] !== false;
  const openRosterEditor = (team: TeamOverview, nextStep: AttendanceNextStep = null) => {
    setError("");
    setAttendanceNextStep(nextStep);
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
    if (!avatar || rosterDraft.length >= MAX_TEAM_MEMBERS) return;
    setRosterDraft((current) => [...current, { draftKey: `new-${Date.now()}`, name: "", avatar, present: true }]);
  };
  const saveRosterEditor = async () => {
    if (!editingTeam || !rosterValidation.valid || !rosterDraft.some((member) => member.present)) return;
    setBusy(true);
    setError("");
    try {
      const updatedTeam = rosterChanged ? await onUpdate(editingTeam.id, rosterMembers) : editingTeam;
      // updateTeamMembers returns the roster payload. Keep the already loaded
      // run history so starting/resuming cannot be mistaken for a fresh team.
      const savedTeam = rosterChanged ? {
        ...editingTeam,
        ...updatedTeam,
        runs: editingTeam.runs,
        activeRun: editingTeam.activeRun,
        completedRuns: editingTeam.completedRuns,
      } : editingTeam;
      const nextAttendance: Record<string, boolean> = {};
      savedTeam.members.forEach((member) => {
        const draft = rosterDraft.find((item) => item.id === member.id)
          ?? rosterDraft.find((item) => item.name.trim() === member.name && item.avatar === member.avatar);
        nextAttendance[attendanceKey(member)] = draft?.present !== false;
      });
      const teamWithAttendance: TeamOverview = {
        ...savedTeam,
        members: savedTeam.members.map((member) => ({
          ...member,
          present: nextAttendance[attendanceKey(member)] !== false,
        })),
      };
      const nextStep = attendanceNextStep;
      setAttendance((current) => ({ ...current, [editingTeam.id]: nextAttendance }));
      if (rosterChanged) await refresh();
      setEditingTeam(null);
      setAttendanceNextStep(null);
      if (nextStep === "overview") onSelectTeam(teamWithAttendance);
      if (nextStep === "mission") await onChoose(teamWithAttendance);
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
    try {
      const nextTeams = await listTeams();
      setTeams(nextTeams);
      if (flowMode === "start" && preferredTeamId && autoOpenedTeamRef.current !== preferredTeamId) {
        const preferredTeam = nextTeams.find((team) => team.id === preferredTeamId);
        if (preferredTeam) {
          autoOpenedTeamRef.current = preferredTeamId;
          openRosterEditor(preferredTeam, "mission");
        }
      }
    }
    catch {
      setTeams([]);
      setLocalFallback(true);
    }
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
  const createOnlineTeam = async () => {
    setBusy(true);
    setError("");
    try {
      const createdTeam = await onCreate(teamName.trim(), members);
      setTeams((current) => [createdTeam, ...current.filter((team) => team.id !== createdTeam.id)]);
      setMode("existing");
      openRosterEditor(createdTeam, flowMode === "select" ? "overview" : "mission");
    } catch {
      setLocalFallback(true);
      setMode("create");
    } finally {
      setBusy(false);
    }
  };
  const importTeamAndContinue = async () => {
    const importedTeam = await onImport(legacyTeamName.trim());
    openRosterEditor(importedTeam, flowMode === "select" ? "overview" : "mission");
  };

  if (historyTeam) return <TeamHistory team={historyTeam} onBack={() => setHistoryTeam(null)} onResumeMissionOneAnswers={onResumeMissionOneAnswers} />;
  return (
    <div className={`screen team-screen${remoteConfigured && mode === "create" ? " team-create-screen" : ""}`}>
      <img className="soft-bg" src={asset("menu/cover.png")} alt="" />
      <header className="team-header">
        <button className="button button-white compact team-back-button" disabled={busy} onClick={onBack}>{flowMode === "select" ? "‹ กลับหน้าคำอธิบาย" : "‹ กลับหน้าเส้นทาง"}</button>
        <div>{flowMode === "select"
          ? <><h1>เลือกทีมและเช็กชื่อก่อนดูเส้นทาง</h1><p>เช็กชื่อผู้ที่มาเรียนเพียงครั้งเดียว แล้วเลือกภารกิจที่ต้องการทำ</p></>
          : <><h1>เช็กชื่อสำหรับภารกิจที่ {selectedMission}</h1><p>เลือกผู้ที่มาเรียน แล้วจึงเริ่มหรือทำภารกิจต่อ</p></>}</div>
        <div className="count-badge">{remoteConfigured ? `${teams.length} ทีม` : "Local"}</div>
      </header>
      {remoteConfigured && <nav className="team-mode-tabs" aria-label="เลือกวิธีจัดทีม">
        <button className={mode === "existing" ? "active" : ""} onClick={() => setMode("existing")}>ทีมเดิม</button>
        <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>＋ สร้างทีมใหม่</button>
      </nav>}
      {!configured && <div className="supabase-setup-note">ยังไม่ได้เชื่อม Supabase — เล่นและบันทึกในเครื่องนี้ได้ชั่วคราว</div>}
      {error && <div className="team-error" role="alert">{error}</div>}

      {remoteConfigured && mode === "existing" ? <section className="existing-team-panel">
        {!legacyAlreadyImported && hasLegacyData(legacyBundle) && <article className="legacy-import-card">
          <div><b>พบข้อมูลการเล่นเดิมในเครื่องนี้</b><span>ตั้งชื่อทีมเพื่อนำความคืบหน้าและประวัติเข้าฐานข้อมูล</span></div>
          <input value={legacyTeamName} maxLength={60} onChange={(event) => setLegacyTeamName(event.target.value)} placeholder="ชื่อทีมสำหรับข้อมูลเดิม" />
          <button disabled={busy || !legacyTeamName.trim()} onClick={() => void runAction(importTeamAndContinue)}>นำเข้าข้อมูลเดิม</button>
        </article>}
        {loading ? <div className="team-list-state">กำลังโหลดรายชื่อทีม…</div> : teams.length === 0 ? <div className="team-list-state"><b>ยังไม่มีทีม</b><span>สร้างทีมแรกเพื่อเริ่มภารกิจ</span><button onClick={() => setMode("create")}>สร้างทีมใหม่</button></div> : <div className="existing-team-grid">
          {teams.map((team) => {
            const active = team.activeRun;
            const run = active ?? team.completedRuns[0];
            const missionOneRun = latestRunForTeamMission(team, 1);
            const missionOneAnswers = missionOneRun ? missionOneAnswerProgress(missionOneRun) : null;
            const findingCount = Object.keys(run?.saveState.inspectionFindings ?? {}).length;
            const presentCount = team.members.filter((member) => isPresent(team.id, member)).length;
            const sessionTeam = { ...team, members: team.members.map((member) => ({ ...member, present: isPresent(team.id, member) })) };
            return <article className="existing-team-card" key={team.id}>
              <header><div className="team-avatar-stack">{team.members.slice(0, 4).map((member) => <img className={isPresent(team.id, member) ? "" : "is-absent"} key={member.id ?? member.name} src={asset(`profiles/${member.avatar}.png`)} alt="" />)}</div><span className={active ? "status-active" : "status-ready"}>{active ? "กำลังทำ" : "พร้อมเริ่ม"}</span></header>
              <h2>{team.name}</h2>
              <p>{team.members.map((member) => member.name).join(" · ")}</p>
              <div className="team-attendance-summary"><b>มาเรียน {presentCount}/{team.members.length} คน</b><span>{presentCount === team.members.length ? "มาครบ" : `ขาด ${team.members.length - presentCount} คน`}</span></div>
              <div className="team-mission-progress-list" aria-label={`ความคืบหน้ารายภารกิจของ ${team.name}`}>
                {([1, 2, 3] as MissionNumber[]).map((mission) => {
                  const missionRun = latestRunForTeamMission(team, mission);
                  const progress = missionRun ? runProgress(missionRun) : 0;
                  const complete = mission === 1 ? progress === 100 : missionRun?.status === "completed";
                  return <div className={complete ? "complete" : missionRun ? "active" : "empty"} key={mission}>
                    <span>ภารกิจ {mission}</span>
                    <i><b style={{ width: `${progress}%` }} /></i>
                    <strong>{progress}%</strong>
                  </div>;
                })}
              </div>
              {missionOneAnswers && missionOneAnswers.total > 0 && <small className="team-card-answer-summary">ตอบคำถามภารกิจที่ 1 แล้ว {missionOneAnswers.completed}/{missionOneAnswers.total} คน</small>}
              <small>{run ? `${STAGE_LABELS[run.currentStage]} · อัปเดต ${new Date(run.updatedAt).toLocaleString("th-TH")}` : "ยังไม่เคยทำภารกิจ"}</small>
              {run && <small className="team-card-answer-summary">คำตอบจากกล่อง 3 มิติ {findingCount}/{DAMAGES.length} ร่องรอย</small>}
              <footer>
                <button className="manage-team-button" disabled={busy} onClick={() => openRosterEditor(team)}><AppIcon name="settings" /> เช็กชื่อ/จัดการสมาชิก</button>
                <button className="history-button" disabled={!team.runs.length} onClick={() => setHistoryTeam(team)}>ดูคำตอบ ({team.runs.length})</button>
                <button className="resume-button" disabled={busy} onClick={() => openRosterEditor(sessionTeam, flowMode === "select" ? "overview" : "mission")}>{flowMode === "select" ? <><AppIcon name="map" /> ไปดูเส้นทางภารกิจ</> : active && runMissionNumber(active) === selectedMission ? <><AppIcon name="play" /> เช็กชื่อและทำภารกิจต่อ</> : <><AppIcon name="users" /> เช็กชื่อและเริ่มภารกิจ</>}</button>
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
          <div className="team-size-actions">
            <button className="button button-yellow" disabled={members.length >= MAX_TEAM_MEMBERS} onClick={addMember}>＋ เพิ่มสมาชิก</button>
            <button className="button button-white" disabled={members.length <= MIN_TEAM_MEMBERS} onClick={() => setMembers((current) => current.slice(0, -1))}>− ลดสมาชิก</button>
          </div>
          <span>{validation.message}</span>
          <button className="button button-orange" disabled={!valid || busy || (remoteConfigured && !teamName.trim())} onClick={() => localFallback ? (flowMode === "select" ? onSelectLocal(members) : onLocalDone(members)) : void createOnlineTeam()}>{flowMode === "select" ? "ทีมพร้อมแล้ว ไปดูเส้นทาง" : "ทีมพร้อมแล้ว"}</button>
        </footer>
      </>}

      {editingTeam && (
        <div className="team-editor-backdrop" role="presentation" onClick={() => !busy && setEditingTeam(null)}>
          <section className="team-editor-modal" role="dialog" aria-modal="true" aria-labelledby="team-editor-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><span><AppIcon name="users" /> {attendanceNextStep === "overview" ? "เช็กชื่อก่อนดูเส้นทาง" : `ภารกิจที่ ${selectedMission}`}</span><h2 id="team-editor-title">{attendanceNextStep === "overview" ? "เช็กชื่อก่อนดูเส้นทาง" : attendanceNextStep === "mission" ? "เช็กชื่อก่อนเริ่มภารกิจ" : "จัดการสมาชิก"} · {editingTeam.name}</h2><p>เลือกผู้ที่มาเรียน ระบบจะบันทึกทั้งผู้มาและผู้ไม่มา แล้วใช้รายชื่อเดิมเมื่อเริ่มภารกิจ</p></div>
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
                  <button type="button" className="remove-roster-member" aria-label={`ลบ ${member.name || `สมาชิก ${index + 1}`}`} disabled={busy || rosterDraft.length <= MIN_TEAM_MEMBERS} onClick={() => setRosterDraft((current) => current.filter((item) => item.draftKey !== member.draftKey))}><AppIcon name="trash" /> ลบ</button>
                </article>
              ))}
            </div>
            <footer>
              <div>
                <button type="button" className="add-roster-member" disabled={busy || rosterDraft.length >= MAX_TEAM_MEMBERS} onClick={addRosterMember}>＋ เพิ่มสมาชิก</button>
                <small>แผนนี้ใช้กลุ่มละ 4 คน และยังรองรับทีมเดิมได้ถึง 7 คน</small>
              </div>
              <span className={rosterValidation.valid && rosterDraft.some((member) => member.present) ? "valid" : "invalid"}>{!rosterDraft.some((member) => member.present) ? "เลือกคนที่มาอย่างน้อย 1 คน" : rosterValidation.message}</span>
              <button type="button" className="button button-orange" disabled={busy || !rosterValidation.valid || !rosterDraft.some((member) => member.present)} onClick={() => void saveRosterEditor()}>{busy ? "กำลังบันทึก…" : attendanceNextStep === "overview" ? "บันทึกและดูเส้นทางภารกิจ" : attendanceNextStep === "mission" ? `บันทึกและเริ่มภารกิจที่ ${selectedMission}` : "บันทึกการมาเรียน"}</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function TeamHistory({ team, onBack, onResumeMissionOneAnswers }: { team: TeamOverview; onBack: () => void; onResumeMissionOneAnswers: (team: TeamOverview) => Promise<void> }) {
  const [selectedRunId, setSelectedRunId] = useState(team.runs[0]?.id ?? "");
  const run = team.runs.find((item) => item.id === selectedRunId) ?? team.runs[0];
  const runMembers = run?.saveState.team?.length ? run.saveState.team : team.members;
  const missionOneAnswers = run && runMissionNumber(run) === 1 ? missionOneAnswerProgress(run) : null;
  const needsMissionOneAnswers = Boolean(missionOneAnswers && missionOneAnswers.total > 0 && !missionOneAnswers.complete);
  return <div className="screen team-history-screen">
    <header><button className="button button-yellow compact" onClick={onBack}>‹ กลับไปเลือกทีม</button><div><span>คำตอบและประวัติทีม</span><h1>{team.name}</h1></div></header>
    <div className="team-history-layout">
      <aside>{team.runs.map((item, index) => <button className={item.id === run?.id ? "active" : ""} key={item.id} onClick={() => setSelectedRunId(item.id)}><b>{item.status === "in_progress" ? "รอบที่กำลังทำ" : `ภารกิจครั้งที่ ${team.runs.length - index}`}</b><span>{new Date(item.completedAt ?? item.updatedAt).toLocaleString("th-TH")}</span></button>)}</aside>
      <section>{run ? <>
        <div className="history-summary"><div><span>สถานะ</span><b>{run.status === "in_progress" ? "กำลังทำภารกิจ" : "ทำภารกิจสำเร็จ"}</b></div><div><span>ขั้นล่าสุด</span><b>{STAGE_LABELS[run.currentStage]}</b></div><div><span>สมาชิก</span><b>{runMembers.length} คน</b></div></div>
        {needsMissionOneAnswers && <div className="history-answer-return"><div><b>คำถามภารกิจที่ 1 ยังไม่ครบ</b><span>ตอบแล้ว {missionOneAnswers?.completed}/{missionOneAnswers?.total} คน</span></div><button type="button" onClick={() => void onResumeMissionOneAnswers(team)}><AppIcon name="pencil" /> ไปตอบคำถามภารกิจที่ 1</button></div>}
        <h2>คำตอบจากหน้าหมุนกล่อง 3 มิติ</h2><div className="history-chip-list history-inspection-list">{Object.entries(run.saveState.inspectionFindings ?? {}).map(([damageId, cause]) => <span key={damageId}>{DAMAGES.find((damage) => damage.id === damageId)?.label ?? damageId} → {cause}</span>)}{!Object.keys(run.saveState.inspectionFindings ?? {}).length && <em>ยังไม่มีคำตอบ</em>}</div>
        <h2>สิ่งที่ทีมเลือกศึกษา</h2><div className="history-chip-list">{Object.entries(run.saveState.studyFocus ?? {}).filter(([, value]) => value).map(([key]) => <span key={key}>{studyTopicLabel(key)}</span>)}{!Object.values(run.saveState.studyFocus ?? {}).some(Boolean) && <em>ยังไม่ได้เลือก</em>}</div>
        <h2>คำตอบรายบุคคล</h2><div className="history-response-grid">{runMembers.map((member, index) => { const legacyKey = `student-${member.position ?? index}`; const tickets = runMissionNumber(run) === 2 ? run.saveState.mission2Assessments : run.saveState.exitTickets; const ticket = tickets?.[exitTicketKey(member, index)] ?? tickets?.[legacyKey] ?? tickets?.[member.name]; return <article key={member.id ?? member.name}><b>{member.name}</b>{ticket ? <><p><i>K</i>{ticket.k || "-"}</p><p><i>P</i>{ticket.p || "-"}</p><p><i>V</i>{ticket.v || "-"}</p></> : <span>ไม่มีคำตอบที่บันทึกไว้</span>}</article>; })}</div>
        {Object.keys(run.saveState.recapAnswers ?? {}).length > 0 && <><h2>คำตอบร่วมกันหลังการทดลอง</h2><div className="history-recap-list">{Object.entries(run.saveState.recapAnswers).map(([questionIndex, choices]) => { const item = RECAP[Number(questionIndex)]; return <article key={questionIndex}><b>{item?.question ?? `คำถามที่ ${Number(questionIndex) + 1}`}</b><span>{choices.map((choice) => item?.choices[choice]?.label ?? `ตัวเลือก ${choice + 1}`).join(" → ")}</span></article>; })}</div></>}
      </> : <div className="team-list-state">ยังไม่มีรอบภารกิจ</div>}</section>
    </div>
  </div>;
}

function MissionRoute({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  useEffect(() => preloadStorySounds(), []);
  return (
    <div className="screen mission-route-screen mission-briefing-screen">
      <img className="mission-route-bg" src={asset("menu/cover.png")} alt="" />
      <button className="mission-briefing-back" type="button" onClick={onBack}>‹ กลับหน้าปก</button>
      <main className="mission-briefing-card">
        <span className="mission-briefing-mission-badge">ภารกิจที่ 1</span>
        <div className="mission-briefing-illustration" aria-hidden="true">
          <img className="mission-briefing-box" src={asset("inspection/mission-1-damaged-parcel-cartoon.png")} alt="" />
          <AppIcon className="mission-briefing-search" name="search" />
        </div>
        <h1>ไขปริศนากล่องพัสดุเสียหาย</h1>
        <p className="mission-briefing-copy">ติดตามเส้นทางของกล่อง แล้วค้นหาว่าเกิดความเสียหายอะไรขึ้นบ้าง</p>
        <div className="mission-one-route" aria-label="ลำดับภารกิจที่ 1">
          <article><i>1</i><b>ติดตาม</b><span>ดูเส้นทางพัสดุ</span></article>
          <article><i>2</i><b>สำรวจ</b><span>ค้นหาร่องรอย</span></article>
          <article><i>3</i><b>กำหนด</b><span>เลือกหน้าที่กล่อง</span></article>
          <article><i>4</i><b>สรุป</b><span>เลือกสมบัติที่ต้องศึกษา</span></article>
        </div>
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
  type ViewerElement = HTMLElement & { model?: { materials: ViewerMaterial[] }; src?: string; alt?: string };
  const inspectionModelSrc = `${asset("models/damaged_box_blender.glb")}?v=wet-stain-back-2`;
  const inspectionModelAlt = "กล่องพัสดุเปิดฝาออกครบทั้งสี่ด้าน เห็นวัสดุกันกระแทกและแก้วด้านในที่แตกร้าวและขอบบิ่น สามารถหมุนตรวจสอบและแตะตอบได้";

  const [ready, setReady] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [viewerFailed, setViewerFailed] = useState(false);
  const [renderProfile, setRenderProfile] = useState<RenderCompatibilityProfile | null>(null);
  const [viewerAttempt, setViewerAttempt] = useState(0);
  const [discoveredIds, setDiscoveredIds] = useState<string[]>(() => DAMAGES.filter((damage) => Boolean(findings[damage.id])).map((damage) => damage.id));
  const [activeDamageId, setActiveDamageId] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const viewerRef = useRef<ViewerElement | null>(null);
  const celebrationTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const compatibility = detectRenderCompatibility();
    setRenderProfile(compatibility);
    reportRendererStatus("inspection", "loading", compatibility.renderer);
    if (compatibility.webglVersion === 0) {
      setViewerFailed(true);
      reportRendererStatus("inspection", "fallback", "WebGL unavailable");
      return;
    }
    if (compatibility.webglVersion === 1) {
      setReady(true);
      return;
    }
    void import("@google/model-viewer")
      .then(() => setReady(true))
      .catch(() => { setViewerFailed(true); reportRendererStatus("inspection", "fallback", "model-viewer import failed"); });
  }, [viewerAttempt]);
  useEffect(() => {
    if (!ready || renderProfile?.webglVersion === 1 || !viewerRef.current) return;
    const viewer = viewerRef.current;
    const cleanupLegacyInput = installModelViewerInputFallback(viewer);
    const hideInternalFocusFrame = () => {
      viewer.shadowRoot?.querySelector<HTMLElement>(".userInput")?.style.setProperty("outline", "none");
    };
    let loaded = false;
    hideInternalFocusFrame();
    const finishLoading = () => {
      loaded = true;
      hideInternalFocusFrame();
      const cardboard = viewer.model?.materials.find((material) => material.name === "MAT_Cardboard_Fiber");
      cardboard?.pbrMetallicRoughness.setBaseColorFactor("#C9823E");
      setModelLoaded(true);
      reportRendererStatus("inspection", "ready");
    };
    const failLoading = () => { setViewerFailed(true); reportRendererStatus("inspection", "fallback", "model load failed"); };
    viewer.addEventListener("load", finishLoading);
    viewer.addEventListener("error", failLoading);
    // React can omit src/alt when a custom element is already registered.
    // Set them after model-viewer is ready so the loader receives the real URL.
    viewer.setAttribute("src", inspectionModelSrc);
    viewer.setAttribute("alt", inspectionModelAlt);
    if (viewer.model) finishLoading();
    const fallbackTimer = window.setTimeout(() => {
      if (!loaded) { setViewerFailed(true); reportRendererStatus("inspection", "fallback", "10 second timeout"); }
    }, 10000);
    return () => {
      window.clearTimeout(fallbackTimer);
      viewer.removeEventListener("load", finishLoading);
      viewer.removeEventListener("error", failLoading);
      cleanupLegacyInput();
    };
  }, [ready, renderProfile, inspectionModelSrc, inspectionModelAlt]);
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
  const locateDamage = (damageId: string, event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.stopPropagation();
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
        {viewerFailed ? (
          <div className="inspection-legacy-fallback">
            <img src={asset("inspection/damaged_box_preview.png")} alt="ภาพกล่องพัสดุที่มีร่องรอยความเสียหาย" />
            <p>โหมดภาพสำหรับอุปกรณ์รุ่นเก่า · แตะร่องรอยเพื่อสำรวจ</p>
            {renderProfile?.webglVersion !== 0 && <button type="button" onClick={() => { setReady(false); setModelLoaded(false); setViewerFailed(false); setViewerAttempt((attempt) => attempt + 1); }}>ลองเปิดโมเดล 3D อีกครั้ง</button>}
            <div>{DAMAGES.map((spot) => {
              const discovered = discoveredIds.includes(spot.id);
              const active = spot.id === activeDamageId;
              return <button key={spot.id} type="button" data-damage={spot.id} disabled={answerRequired && !active} className={discovered ? "is-solved" : ""} onClick={(event) => locateDamage(spot.id, event)}>{discovered ? "✓ " : ""}{spot.label}</button>;
            })}</div>
          </div>
        ) : ready && renderProfile?.webglVersion === 1 ? (
          <LegacyGlbViewer
            key={viewerAttempt}
            src={inspectionModelSrc}
            alt={inspectionModelAlt}
            poster={asset("inspection/damaged_box_preview.png")}
            orbit="24deg 48deg 7.8m"
            target="0m -0.08m 0m"
            hotspots={DAMAGES.map((spot) => {
              const discovered = discoveredIds.includes(spot.id);
              const active = spot.id === activeDamageId;
              return {
                id: spot.id,
                position: spot.position,
                className: `damage-target ${discovered ? "is-solved" : ""} ${active ? "is-active" : ""}`,
                ariaLabel: discovered ? `ตรวจสอบ${spot.label}อีกครั้ง` : "ตรวจสอบบริเวณนี้",
                disabled: answerRequired && !active,
                dataDamage: spot.id,
                content: discovered ? <span className="damage-marker-label">{spot.label}</span> : undefined,
                onClick: () => locateDamage(spot.id),
              };
            })}
            onLoad={() => { setModelLoaded(true); reportRendererStatus("inspection", "ready", "three-webgl1"); }}
            onError={() => { setViewerFailed(true); reportRendererStatus("inspection", "fallback", "Three.js GLB load failed"); }}
          />
        ) : ready && (
          <model-viewer
            ref={viewerRef}
            src={inspectionModelSrc}
            alt={inspectionModelAlt}
            poster={asset("inspection/damaged_box_preview.png")}
            camera-controls
            disable-pan
            disable-zoom
            touch-action="none"
            interaction-prompt="none"
            camera-orbit="24deg 48deg 7.8m"
            camera-target="0m -0.08m 0m"
            field-of-view="35deg"
            exposure="1.05"
            shadow-intensity={String(renderProfile?.modelViewerShadowScale ?? 1)}
            minimum-render-scale="0.5"
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
        {!modelLoaded && !viewerFailed && <div className="model-loading" role="status"><span className="loading-box" /><b>กำลังเตรียมกล่อง 3 มิติ…</b></div>}
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

const BOX_MISSION_DECOYS = [
  { id: "make-box-pretty", label: "ทำให้กล่องมีสีสวยที่สุด", icon: "palette" },
  { id: "deliver-faster", label: "ช่วยให้พัสดุถึงบ้านเร็วขึ้น", icon: "truck" },
] as const;

const BOX_MISSION_OPTIONS = [
  BOX_MISSION_GOALS[0],
  BOX_MISSION_DECOYS[0],
  BOX_MISSION_GOALS[1],
  BOX_MISSION_GOALS[2],
  BOX_MISSION_DECOYS[1],
  BOX_MISSION_GOALS[3],
] as const;

function TypewriterMessage({ text }: { text: string }) {
  const [visibleLength, setVisibleLength] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisibleLength(text.length);
      return;
    }
    setVisibleLength(0);
    const timer = window.setInterval(() => {
      setVisibleLength((current) => {
        const next = Math.min(current + 1, text.length);
        if (next === text.length) window.clearInterval(timer);
        return next;
      });
    }, 24);
    return () => window.clearInterval(timer);
  }, [text]);

  return <span className="box-mission-typed-message" aria-label={text}><span aria-hidden="true">{text.slice(0, visibleLength)}{visibleLength < text.length && <i />}</span></span>;
}

function BoxMissionReadOnlyModel() {
  type ViewerMaterial = { name: string; pbrMetallicRoughness: { setBaseColorFactor: (color: string | number[]) => void } };
  type ViewerElement = HTMLElement & { model?: { materials: ViewerMaterial[] }; src?: string; alt?: string };
  const modelSrc = `${asset("models/damaged_box_blender.glb")}?v=wet-stain-back-2`;
  const modelAlt = "โมเดลกล่องพัสดุที่ค้นพบรอยยุบ รอยเปียก มุมบุบ และสิ่งของด้านในเสียหายแล้ว หมุนดูได้";
  const [profile, setProfile] = useState<RenderCompatibilityProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const viewerRef = useRef<ViewerElement | null>(null);

  useEffect(() => {
    const compatibility = detectRenderCompatibility();
    setProfile(compatibility);
    reportRendererStatus("box-mission-model", "loading", compatibility.renderer);
    if (compatibility.webglVersion === 0) {
      setFailed(true);
      reportRendererStatus("box-mission-model", "fallback", "WebGL unavailable");
      return;
    }
    if (compatibility.webglVersion === 1) {
      setReady(true);
      return;
    }
    void import("@google/model-viewer")
      .then(() => setReady(true))
      .catch(() => {
        setFailed(true);
        reportRendererStatus("box-mission-model", "fallback", "model-viewer import failed");
      });
  }, []);

  useEffect(() => {
    if (!ready || profile?.webglVersion === 1 || !viewerRef.current) return;
    const viewer = viewerRef.current;
    const removeInputFallback = installModelViewerInputFallback(viewer);
    let hasLoaded = false;
    const finishLoading = () => {
      hasLoaded = true;
      const cardboard = viewer.model?.materials.find((material) => material.name === "MAT_Cardboard_Fiber");
      cardboard?.pbrMetallicRoughness.setBaseColorFactor("#C9823E");
      setLoaded(true);
      reportRendererStatus("box-mission-model", "ready");
    };
    const failLoading = () => {
      setFailed(true);
      reportRendererStatus("box-mission-model", "fallback", "model load failed");
    };
    viewer.addEventListener("load", finishLoading);
    viewer.addEventListener("error", failLoading);
    viewer.setAttribute("src", modelSrc);
    viewer.setAttribute("alt", modelAlt);
    if (viewer.model) finishLoading();
    const timeout = window.setTimeout(() => { if (!hasLoaded) failLoading(); }, 10000);
    return () => {
      window.clearTimeout(timeout);
      viewer.removeEventListener("load", finishLoading);
      viewer.removeEventListener("error", failLoading);
      removeInputFallback();
    };
  }, [ready, profile, modelSrc, modelAlt]);

  const legacyHotspots = DAMAGES.map((damage) => ({
    id: damage.id,
    position: damage.position,
    className: "box-mission-model-marker",
    ariaLabel: `${damage.label}ที่ค้นพบแล้ว`,
    disabled: true,
    dataDamage: damage.id,
    content: <span>{damage.label}</span>,
    onClick: () => undefined,
  }));

  return <section className="box-mission-model-panel" aria-label="กล่องพัสดุที่สำรวจร่องรอยแล้ว">
    <div className="box-mission-model-viewport">
      {failed ? <div className="box-mission-model-fallback"><img src={asset("inspection/damaged_box_preview.png")} alt="ภาพกล่องพัสดุที่มีร่องรอยความเสียหาย" /></div>
        : ready && profile?.webglVersion === 1 ? <LegacyGlbViewer
          src={modelSrc}
          alt={modelAlt}
          poster={asset("inspection/damaged_box_preview.png")}
          orbit="24deg 48deg 7.8m"
          target="0m -0.08m 0m"
          hotspots={legacyHotspots}
          onLoad={() => { setLoaded(true); reportRendererStatus("box-mission-model", "ready", "three-webgl1"); }}
          onError={() => { setFailed(true); reportRendererStatus("box-mission-model", "fallback", "Three.js GLB load failed"); }}
        /> : ready ? <model-viewer
          ref={viewerRef}
          camera-controls
          disable-pan
          disable-zoom
          touch-action="none"
          interaction-prompt="none"
          camera-orbit="24deg 48deg 7.8m"
          camera-target="0m -0.08m 0m"
          field-of-view="35deg"
          exposure="1.05"
          shadow-intensity={String(profile?.modelViewerShadowScale ?? 1)}
          minimum-render-scale="0.5"
        >
          {DAMAGES.map((damage) => <span key={damage.id} slot={`hotspot-${damage.id}`} className="box-mission-model-marker" data-damage={damage.id} data-position={damage.position} data-normal={damage.normal} aria-hidden="true">{damage.label}</span>)}
        </model-viewer> : null}
      {!loaded && !failed && <div className="box-mission-model-loading" role="status"><span className="loading-box" /><b>กำลังเตรียมกล่อง 3 มิติ…</b></div>}
    </div>
    <p><span aria-hidden="true">↔</span> ลากเพื่อหมุนดูได้ แล้วดูจุดสีที่เราเคยพบ</p>
  </section>;
}

function BoxMissionScreen({ values, onBack, onChange, onDone }: {
  values: Record<string, boolean>;
  onBack: () => void;
  onChange: (values: Record<string, boolean>) => void;
  onDone: () => void;
}) {
  const [showIntro, setShowIntro] = useState(true);
  const [feedback, setFeedback] = useState<"idle" | "selected" | "decoy">("idle");
  const [hintedDecoyId, setHintedDecoyId] = useState<string | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("preview") === "box-mission") setShowIntro(false);
  }, []);
  const selectedCount = BOX_MISSION_GOALS.filter((goal) => Boolean(values[goal.id])).length;
  const allGoalsSelected = selectedCount === BOX_MISSION_GOALS.length;
  const mascotFrame = feedback === "decoy" ? "react" : allGoalsSelected || feedback === "selected" ? "complete" : "think";
  const coachResponse = feedback === "decoy"
    ? "ไอเดียนี้น่ารัก แต่ยังไม่ช่วยแก้ร่องรอยที่เราพบ ลองเลือกหน้าที่ของกล่องอีกข้อหนึ่งนะ"
    : allGoalsSelected
      ? "เก่งมาก! เราเลือกหน้าที่ที่ช่วยแก้ปัญหาของกล่องได้ครบแล้ว"
      : feedback === "selected"
        ? "เลือกได้ดีมาก! ลองช่วยกันเลือกหน้าที่อื่นที่กล่องยังต้องมีด้วยนะ"
        : "ดูร่องรอย แล้วเลือกว่ากล่องใบใหม่ควรช่วยเรื่องไหน";
  const chooseGoal = (goalId: string) => {
    if (BOX_MISSION_DECOYS.some((decoy) => decoy.id === goalId)) {
      setHintedDecoyId(goalId);
      setFeedback("decoy");
      return;
    }
    setHintedDecoyId(null);
    const nextSelected = !values[goalId];
    onChange({ ...values, [goalId]: nextSelected });
    setFeedback(nextSelected ? "selected" : "idle");
  };

  return <div className="screen box-mission-screen box-mission-unified-screen">
    <img className="group-design-bg" src={asset("compression/lab_background.png")} alt="" />
    <button className="button button-white box-mission-unified-back" type="button" onClick={onBack}>‹ กลับไปหน้าก่อนหน้า</button>
    <header className="box-mission-unified-header">
      <h1>ช่วยเลือกหน้าที่ให้กล่องของเรา</h1>
    </header>
    <main className="box-mission-unified-content">
      <section className={`box-mission-unified-mascot is-${mascotFrame}`} aria-live="polite">
        <div className="box-mission-unified-sprite" data-frame={mascotFrame} aria-hidden="true"><img src={asset("mascot/parcel-guide-sprite.png")} alt="" /></div>
        <div className="box-mission-unified-bubble"><span>ผู้ช่วยนักสืบกล่อง</span><p><strong><TypewriterMessage text={coachResponse} /></strong></p></div>
      </section>
      <section className="box-mission-unified-board">
        <BoxMissionReadOnlyModel />
        <section className="box-mission-unified-choices" aria-label="เลือกหน้าที่ของกล่อง">
          <div className="box-mission-unified-choices-heading"><div><h2>กล่องของเราอยากช่วยเรื่องอะไรบ้าง?</h2></div></div>
          <div className="box-mission-unified-option-grid" role="group" aria-label="หน้าที่ของกล่อง">
            {BOX_MISSION_OPTIONS.map((option) => {
              const decoy = BOX_MISSION_DECOYS.some((item) => item.id === option.id);
              const selected = !decoy && Boolean(values[option.id]);
              return <button key={option.id} type="button" aria-pressed={selected} className={`${selected ? "is-selected" : ""} ${decoy ? "is-decoy" : ""} ${feedback === "decoy" && option.id === hintedDecoyId ? "is-hint" : ""}`} onClick={() => chooseGoal(option.id)}>
                <i aria-hidden="true"><AppIcon name={option.icon as AppIconName} /></i><span>{option.label}</span>{selected && <b aria-hidden="true">✓</b>}
              </button>;
            })}
          </div>
          <footer className="box-mission-unified-footer">
            <button className="button button-orange" type="button" disabled={!allGoalsSelected} onClick={onDone}><span>ไปสำรวจวัสดุ</span><b aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg></b></button>
          </footer>
        </section>
      </section>
    </main>
    {showIntro && <div className="box-mission-intro-backdrop" role="presentation">
      <section className="box-mission-intro-dialog" role="dialog" aria-modal="true" aria-labelledby="box-mission-intro-title">
        <div className="box-mission-intro-mascot-wrap" aria-hidden="true">
          <span>✦</span><span>★</span>
          <div className="box-mission-intro-mascot" data-frame="complete"><img src={asset("mascot/parcel-guide-sprite.png")} alt="" /></div>
        </div>
        <div><span>เยี่ยมมาก นักสืบตัวน้อย!</span><h2 id="box-mission-intro-title">เราได้สำรวจร่องรอยความเสียหายของกล่องไปแล้ว</h2><p>ต่อไปมาช่วยเลือกหน้าที่ให้กล่องของเรากัน!</p></div>
        <button className="button button-orange" type="button" onClick={() => setShowIntro(false)}><span>ไปเลือกหน้าที่ของกล่อง</span><b aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg></b></button>
      </section>
    </div>}
  </div>;
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
const STUDY_FOCUS_CHOICES = [
  { kind: "topic", topic: STUDY_TOPICS[0] },
  { kind: "decoy", id: "appearance", title: "สีสันของวัสดุ", image: "study-focus/decoy-appearance-3d.png?v=study-focus-1" },
  { kind: "topic", topic: STUDY_TOPICS[1] },
  { kind: "decoy", id: "smell", title: "กลิ่นของวัสดุ", image: "study-focus/decoy-smell-3d.png?v=study-focus-1" },
  { kind: "topic", topic: STUDY_TOPICS[2] },
] as const;

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
  icon: "package",
  detail: "กระดาษลูกฟูกมีแผ่นเรียบ 2 แผ่นประกบลอนกระดาษไว้ตรงกลาง มองเห็นช่องอากาศต่อเนื่องอยู่ระหว่างแผ่นผิว",
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
    label: "แผ่นเดี่ยวโค้งหรือม้วนได้",
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
    detail: "โฟม EPE ชิ้นนี้เป็นแผ่นเดี่ยวสีขาว มีความหนาเล็กน้อย และมีผิวเซลล์ละเอียด",
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
    detail: "กระดาษคราฟต์เป็นแผ่นเดี่ยวที่บาง ขอบไม่มีลอนหรือชั้นโฟมอยู่ภายใน",
    position: "1.55m 0.09m 1.88m",
    normal: "0 0 1",
    orbit: "-18deg 80deg 5.9m",
    target: "0.9m 0.02m 1.3m",
  },
  {
    id: "flexible-kraft-sheet",
    label: "โค้งงอได้",
    icon: "⌁",
    detail: "เนื้อกระดาษคงรูปเป็นแผ่น และสามารถโค้ง พับ หรือขยำได้",
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
    detail: "ชั้นไขพาราฟินเคลือบผิวกระดาษทั้งสองด้าน ผิวจึงเรียบลื่นและมีเงาซาตินเล็กน้อย",
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
    detail: "กระดาษไขเป็นแผ่นบาง สามารถโค้ง พับ หรือม้วนได้",
    position: "1.8m 0.32m -1m",
    normal: "0 1 0",
    orbit: "42deg 60deg 6.6m",
    target: "1.15m 0.14m -0.65m",
  },
] satisfies readonly MaterialExplorerFeature[];

const MATERIAL_EXPLORERS = {
  corrugated_cardboard: {
    title: "กระดาษลูกฟูก",
    description: "ประกอบด้วยกระดาษเรียบ 2 ชั้น มีลอนกระดาษและช่องอากาศอยู่ตรงกลาง",
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
    description: "เป็นแผ่นพลาสติกบาง ผิวเรียบ ลื่น และโค้งงอได้ มีลักษณะใสขุ่น",
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
    description: "เป็นแผ่นพลาสติกที่มีฟองอากาศขนาดใกล้เคียงกันเรียงต่อกันทั่วทั้งแผ่น",
    model: "models/bubble_wrap.glb?v=3",
    alt: "โมเดลแผ่นพลาสติกกันกระแทกชนิดฟองอากาศแบบแผ่นเดี่ยว มีฟองอากาศเรียงเป็นแถวเฉพาะด้านบนและด้านล่างเรียบ",
    loading: "กำลังเติมอากาศในฟอง 3 มิติ…",
    overview: { label: "แผ่นพลาสติกที่มีฟองอากาศ", icon: "bubbles", detail: "แผ่นฟิล์มเดี่ยวมีฟองอากาศขนาดใกล้เคียงกันเรียงต่อกันทั่วทั้งแผ่น" },
    features: BUBBLE_WRAP_FEATURES,
    orbit: "34deg 58deg 6.9m",
    target: "0m 0.08m 0.25m",
    minOrbit: "auto 10deg 4.8m",
    maxOrbit: "auto 165deg 12m",
  },
  closed_cell_pe_foam: {
    title: "แผ่นโฟม EPE",
    description: "เป็นแผ่นสีขาว เนื้อนุ่ม และมีผิวเป็นเซลล์เล็ก ๆ",
    model: "models/pe_foam_sheet.glb",
    alt: "โมเดลแผ่นโฟม EPE สีขาวแบบหนึ่งแผ่น มีความหนาเล็กน้อย ขอบมน และผิวเซลล์ละเอียด",
    loading: "กำลังสร้างเซลล์โฟม EPE 3 มิติ…",
    overview: { label: "แผ่นโฟม EPE เซลล์ปิด", icon: "▰", detail: "โฟม EPE สีขาวหนึ่งแผ่น เนื้อนุ่ม และมีผิวเซลล์ละเอียด" },
    features: PE_FOAM_FEATURES,
    orbit: "34deg 60deg 7.1m",
    target: "0m 0m 0m",
    minOrbit: "auto 10deg 4.8m",
    maxOrbit: "auto 165deg 12m",
  },
  cardboard: {
    title: "กระดาษหน้าขาวหลังเทา 400 แกรม",
    description: "เป็นแผ่นกระดาษเนื้อแน่น ด้านหน้าสีขาว ด้านหลังสีเทา และมีขอบบาง",
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
    description: "เป็นแผ่นกระดาษสีน้ำตาล มีผิวเป็นเส้นใยละเอียด และโค้งงอได้",
    model: "models/kraft_paper_single_sheet.glb",
    alt: "โมเดลกระดาษคราฟต์สีน้ำตาลแบบหนึ่งแผ่น บาง มีผิวเส้นใยละเอียด และโค้งเป็นคลื่นเล็กน้อย",
    loading: "กำลังเตรียมเส้นใยกระดาษคราฟต์ 3 มิติ…",
    overview: { label: "กระดาษคราฟต์หนึ่งแผ่น", icon: "≋", detail: "กระดาษคราฟต์สีน้ำตาลหนึ่งแผ่น ผิวด้านมีเส้นใยละเอียด เนื้อบาง และโค้งงอได้" },
    features: KRAFT_PAPER_FEATURES,
    orbit: "34deg 60deg 7.2m",
    target: "0m 0.04m 0m",
    minOrbit: "auto 10deg 4.8m",
    maxOrbit: "auto 165deg 12m",
  },
  waxed_paper: {
    title: "กระดาษเคลือบไข",
    description: "เป็นแผ่นกระดาษบาง ผิวเรียบ มีชั้นเคลือบสีขาวนวลและมองเห็นแสงผ่านได้บางส่วน",
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
    src?: string;
    alt?: string;
  };
  const [exploringMaterial, setExploringMaterial] = useState<MaterialExplorerId | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [renderProfile, setRenderProfile] = useState<RenderCompatibilityProfile | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelError, setModelError] = useState("");
  const [modelAttempt, setModelAttempt] = useState(0);
  const [viewScale, setViewScale] = useState<MaterialScale>("normal");
  const [zoomDepth, setZoomDepth] = useState(0);
  const [selectedFeature, setSelectedFeature] = useState<string>("overview");
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
  const materialViewerRef = useRef<MaterialViewerElement | null>(null);
  const legacyMaterialViewerRef = useRef<LegacyGlbViewerHandle | null>(null);
  const exploring = exploringMaterial !== null;
  const explorer = MATERIAL_EXPLORERS[exploringMaterial ?? "corrugated_cardboard"];
  const explorerImage = MATERIALS.find((material) => material.id === exploringMaterial)?.image ?? "corrugated_cardboard.png";
  const materialModelSrc = `${asset(explorer.model)}?v=wax-paper-single-sheet-v21-${modelAttempt}`;
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
    let active = true;
    const compatibility = detectRenderCompatibility();
    setRenderProfile(compatibility);
    reportRendererStatus("material-guide", "loading", compatibility.renderer);
    if (compatibility.webglVersion === 0) {
      setViewerReady(false);
      setModelLoaded(false);
      setModelError("อุปกรณ์นี้ไม่รองรับ WebGL จะแสดงภาพวัสดุแทน");
      reportRendererStatus("material-guide", "fallback", "WebGL unavailable");
    } else if (compatibility.webglVersion === 1) {
      setViewerReady(true);
    } else {
      void import("@google/model-viewer").then(() => {
        if (active) setViewerReady(true);
      }).catch(() => {
        if (!active) return;
        setViewerReady(false);
        setModelLoaded(false);
        setModelError("อุปกรณ์นี้ไม่รองรับโมเดล 3 มิติ จะแสดงภาพวัสดุแทน");
        reportRendererStatus("material-guide", "fallback", "model-viewer import failed");
      });
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExploringMaterial(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      active = false;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [exploring]);

  useEffect(() => {
    if (!exploring || !viewerReady || renderProfile?.webglVersion === 1 || !materialViewerRef.current) return;
    const viewer = materialViewerRef.current;
    const cleanupLegacyInput = installModelViewerInputFallback(viewer);
    let loaded = false;
    const finishLoading = () => {
      loaded = true;
      setModelError("");
      setModelLoaded(true);
      reportRendererStatus("material-guide", "ready");
    };
    const failLoading = () => {
      setModelLoaded(false);
      setModelError("ยังเปิดโมเดลไม่ได้ ลองกดโหลดอีกครั้ง");
      reportRendererStatus("material-guide", "fallback", "model load failed");
    };
    viewer.addEventListener("load", finishLoading);
    viewer.addEventListener("error", failLoading);
    // Assign the source after the custom element is upgraded. This is
    // required by React 19 for model-viewer's src/alt properties on Pages.
    viewer.setAttribute("src", materialModelSrc);
    viewer.setAttribute("alt", explorer.alt);
    if (viewer.loaded) finishLoading();
    const fallbackTimer = window.setTimeout(() => {
      if (!loaded) {
        setModelError("โหลดโมเดล 3D ไม่สำเร็จ จะแสดงภาพวัสดุแทน");
        reportRendererStatus("material-guide", "fallback", "10 second timeout");
      }
    }, 10000);
    return () => {
      window.clearTimeout(fallbackTimer);
      viewer.removeEventListener("load", finishLoading);
      viewer.removeEventListener("error", failLoading);
      cleanupLegacyInput();
    };
  }, [exploring, viewerReady, renderProfile, modelAttempt, viewScale, materialModelSrc, explorer.alt]);

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
    if (renderProfile?.webglVersion === 1) {
      legacyMaterialViewerRef.current?.setOrbit(feature.orbit, feature.target);
      return;
    }
    const viewer = materialViewerRef.current;
    if (!viewer) return;
    viewer.cameraOrbit = feature.orbit;
    viewer.cameraTarget = feature.target;
    viewer.jumpCameraToGoal?.();
  };
  const resetExplorer = () => {
    setSelectedFeature("overview");
    setExpandedFeature(null);
    if (renderProfile?.webglVersion === 1) {
      legacyMaterialViewerRef.current?.setOrbit(explorer.orbit, explorer.target);
      return;
    }
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
          <h1>ห้องสำรวจวัสดุ</h1>
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
        <div className="material-guide-helper"><AppIcon name="microscope" /><p><b>เลือกวัสดุที่อยากรู้จักได้เลย!</b><small>แตะการ์ดเพื่อหมุน ซูม และดูโครงสร้างใกล้ ๆ</small></p></div>
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
                <div><AppIcon name="search" /><b>ลากเพื่อซูมลึกเข้าไปในวัสดุ</b><output>{zoomDepth}%</output></div>
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
              {(viewScale === "normal" || isContinuousZoomMaterial) && viewerReady && renderProfile?.webglVersion === 1 && (
                <LegacyGlbViewer
                  key={modelAttempt}
                  viewerRef={legacyMaterialViewerRef}
                  src={materialModelSrc}
                  alt={explorer.alt}
                  poster={asset(`materials/${explorerImage}`)}
                  orbit={explorer.orbit}
                  target={explorer.target}
                  hotspots={explorerFeatures.map((feature) => ({
                    id: feature.id,
                    position: feature.position,
                    className: `material-3d-hotspot ${selectedFeature === feature.id ? "is-active" : ""}`,
                    ariaLabel: feature.label,
                    content: <><b><MaterialIcon icon={feature.icon} /></b><span>{feature.label}</span></>,
                    onClick: () => focusFeature(feature),
                  }))}
                  style={{ opacity: continuousModelOpacity, transform: `scale(${1 + Math.min(zoomDepth, 42) * .006})`, transition: "opacity .65s ease, transform .65s ease", pointerEvents: viewScale === "normal" ? "auto" : "none" }}
                  onLoad={() => { setModelError(""); setModelLoaded(true); reportRendererStatus("material-guide", "ready", "three-webgl1"); }}
                  onError={() => { setModelLoaded(false); setModelError("โหลดโมเดล 3D ไม่สำเร็จ จะแสดงภาพวัสดุแทน"); reportRendererStatus("material-guide", "fallback", "Three.js GLB load failed"); }}
                />
              )}
              {(viewScale === "normal" || isContinuousZoomMaterial) && viewerReady && renderProfile?.webglVersion !== 1 && (
                <model-viewer
                  key={modelAttempt}
                  ref={materialViewerRef}
                  src={materialModelSrc}
                  alt={explorer.alt}
                  poster={asset(`materials/${explorerImage}`)}
                  camera-controls
                  interaction-prompt="none"
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
                  shadow-intensity={String((exploringMaterial === "pe_sheet" || exploringMaterial === "bubble_wrap" || exploringMaterial === "waxed_paper" ? .08 : 1.15) * (renderProfile?.modelViewerShadowScale ?? 1))}
                  minimum-render-scale="0.5"
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
                      <b><MaterialIcon icon={feature.icon} /></b><span>{feature.label}</span>
                    </button>
                  ))}
                </model-viewer>
              )}
              {viewScale === "normal" && !modelLoaded && !modelError && <div className="material-3d-loading" role="status"><span className="loading-box" /><b>{explorer.loading}</b></div>}
              {viewScale === "normal" && modelError && <div className="material-3d-error" role="alert"><img src={asset(`materials/${explorerImage}`)} alt="ภาพวัสดุสำรอง" /><span>⚠</span><b>{modelError}</b><button type="button" onClick={retryModel}>โหลดโมเดลอีกครั้ง</button></div>}
              {viewScale === "normal" && <div className="material-3d-gesture-hint">ลากเพื่อหมุน เลื่อนหรือหนีบเพื่อซูม และกดป้ายเพื่อดูส่วนนั้น</div>}
              {!isContinuousZoomMaterial && viewScale !== "normal" && <MaterialMicroscope key={`${microscopeMaterialId}-${viewScale}`} materialId={microscopeMaterialId} level={viewScale} selectedId={selectedFeature} zoomProgress={viewScale === "micro" ? (zoomDepth - 34) / 33 : (zoomDepth - 68) / 32} onSelect={focusMicroscopeFeature} />}
            </div>
            <aside className="material-3d-info" aria-live="polite">
              <div className="material-3d-info-icon"><MaterialIcon icon={selected.icon} /></div>
              <h2>{selected.label}</h2>
              <p className="material-3d-material-summary">{explorer.description}</p>
              <div className="material-3d-part-buttons" aria-label={`เลือกส่วนของ${explorer.title}`}>
                {currentFeatures.map((feature) => {
                  const expanded = expandedFeature === feature.id;
                  const panelId = `material-detail-${feature.id}`;
                  return <div key={feature.id} className={`material-3d-accordion-item ${expanded ? "is-open" : ""}`}>
                    <button type="button" className={selectedFeature === feature.id ? "is-active" : ""} aria-expanded={expanded} aria-controls={panelId} onClick={() => toggleFeatureDetails(feature)}>
                      <span><MaterialIcon icon={feature.icon} /></span><b>{feature.label}</b><i aria-hidden="true">⌄</i>
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
  const [selectedDecoyIds, setSelectedDecoyIds] = useState<string[]>([]);
  const [showStudySummary, setShowStudySummary] = useState(false);
  const selectedCount = STUDY_TOPICS.filter((topic) => values[topic.id]).length;
  const complete = selectedCount === STUDY_TOPICS.length;
  const selectionReady = complete && selectedDecoyIds.length === 0;
  const toggle = (id: string) => {
    setWarning("");
    onChange({ ...values, [id]: !values[id] });
  };
  const chooseDecoy = (id: string) => {
    setWarning("");
    setSelectedDecoyIds((current) => current.includes(id) ? current.filter((currentId) => currentId !== id) : [...current, id]);
  };
  const saveFocus = () => {
    if (!selectionReady) {
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
          <span><AppIcon name="search" /> คำถามภารกิจที่ 1</span>
          <h1>เมื่อกล่องพัสดุต้องเจอแรงกด แรงกระแทก และฝน<br />เราควรศึกษาสมบัติใดของวัสดุบ้าง เพราะเหตุใด?</h1>
        </div>
      </header>
      <div className="study-topic-title study-focus-title"><span>★</span> เลือกสมบัติที่จำเป็นต้องศึกษา</div>
      <section className="study-topic-panel study-focus-panel" aria-label="เลือกสมบัติที่ต้องศึกษา">
        {STUDY_FOCUS_CHOICES.map((choice) => choice.kind === "topic" ? (
          <button key={choice.topic.id} className={`study-topic-card study-topic-${choice.topic.id}${values[choice.topic.id] ? " selected" : ""}`} aria-pressed={Boolean(values[choice.topic.id])} onClick={() => toggle(choice.topic.id)}>
            <StudyTopicIllustration id={choice.topic.id} />
            <b className="study-topic-name">{choice.topic.title}</b>
            <span className="study-topic-tap">{values[choice.topic.id] ? "เลือกแล้ว!" : "แตะเพื่อเลือก"}</span>
          </button>
        ) : (
          <button key={choice.id} className={`study-topic-card study-topic-decoy study-topic-decoy-${choice.id}${selectedDecoyIds.includes(choice.id) ? " selected" : ""}`} type="button" aria-pressed={selectedDecoyIds.includes(choice.id)} onClick={() => chooseDecoy(choice.id)}>
            <img className="study-topic-decoy-icon" src={asset(choice.image)} alt="" aria-hidden="true" />
            <b className="study-topic-name">{choice.title}</b>
            <span className="study-topic-tap">{selectedDecoyIds.includes(choice.id) ? "เลือกแล้ว!" : "แตะเพื่อเลือก"}</span>
          </button>
        ))}
      </section>
      {warning && <div className="study-focus-warning" role="alert">
        <div className="study-warning-mascot" aria-hidden="true" style={{ backgroundImage: `url(${asset("mascot/parcel-guide-sprite.png")})` }} />
        <div className="study-warning-bubble">{warning}</div>
      </div>}
      <footer className="study-focus-footer">
        <button className="button button-orange study-focus-save" onClick={saveFocus}>{selectionReady ? "ครบแล้ว ไปต่อเลย! ›" : "เลือกให้ครบก่อนนะ"}</button>
      </footer>
      {showStudySummary && <div className="study-focus-summary-overlay" role="dialog" aria-modal="true" aria-labelledby="study-focus-summary-title">
        <section className="study-focus-summary-card">
          <div className="study-focus-summary-mascot" aria-hidden="true" style={{ backgroundImage: `url(${asset("mascot/parcel-guide-sprite.png")})` }} />
          <span><AppIcon name="party" /> วันนี้เราค้นพบแล้ว!</span>
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
type MatchItem = ExitTicketMatchItem;

function writeMatches(items: readonly MatchItem[], matches: Record<string, string>) {
  return items.map((item, index) => `${index + 1}. ${item.prompt} → ${matches[item.id] ?? "_____"}`).join("\n");
}

function exitTicketsAreEqual(first?: ExitTicket, second?: ExitTicket) {
  return first?.k === second?.k && first?.p === second?.p && first?.v === second?.v;
}

function MatchingQuestion({ field, questionNumber, instruction, items, value, selectedAnswer, onSelectAnswer, onChange }: { field: MatchField; questionNumber: number; instruction: string; items: readonly MatchItem[]; value: string; selectedAnswer: string; onSelectAnswer: (answer: string) => void; onChange: (value: string) => void }) {
  const matches = readExitTicketMatches(value, items);
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

function ExitTicketScreen({ team, initial, confirmations, onBack, onHome, onAnswerChange, onSaveDraft, onDone }: { team: TeamMember[]; initial: Record<string, ExitTicket>; confirmations: Record<string, ExitTicket>; onBack: () => void; onHome: () => void; onAnswerChange: (values: Record<string, ExitTicket>) => void; onSaveDraft: (values: Record<string, ExitTicket>, confirmed: Record<string, ExitTicket>) => void; onDone: (values: Record<string, ExitTicket>) => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [confirmHome, setConfirmHome] = useState(false);
  const answerPanelRef = useRef<HTMLDivElement>(null);
  const values = { ...initial, ...normalizeExitTickets(initial, team) };
  const savedValues = confirmations;
  const [selectedAnswers, setSelectedAnswers] = useState<Record<MatchField, string>>({ k: "", p: "" });
  const activeKey = exitTicketKey(team[activeIndex] ?? { name: "", avatar: "" }, activeIndex);
  const current = values[activeKey] ?? EMPTY_EXIT_TICKET;
  const isTicketComplete = isStructuredExitTicketComplete;
  const complete = team.length > 0 && team.every((member, index) => {
    const key = exitTicketKey(member, index);
    return isTicketComplete(savedValues[key]) && exitTicketsAreEqual(values[key], savedValues[key]);
  });
  const completedCount = team.filter((member, index) => {
    const key = exitTicketKey(member, index);
    return isTicketComplete(savedValues[key]) && exitTicketsAreEqual(values[key], savedValues[key]);
  }).length;
  const activeComplete = isTicketComplete(current);
  const activeSaved = activeComplete && isTicketComplete(savedValues[activeKey]) && exitTicketsAreEqual(current, savedValues[activeKey]);
  const update = (field: keyof ExitTicket, value: string) => {
    const nextTicket = { ...current, [field]: value };
    const nextValues = { ...values, [activeKey]: nextTicket };
    onAnswerChange(nextValues);
  };
  const saveCurrent = () => {
    if (!activeComplete || activeSaved) return;
    onSaveDraft(values, { ...savedValues, [activeKey]: current });
  };
  const valueAnswer = readValueAnswer(current.v);
  useEffect(() => {
    const panel = answerPanelRef.current;
    if (!panel || !/iPad/.test(window.navigator.userAgent)) return;
    let lastY: number | null = null;
    const beginTouchScroll = (event: TouchEvent) => { lastY = event.touches.length === 1 ? event.touches[0].clientY : null; };
    const continueTouchScroll = (event: TouchEvent) => {
      if (lastY === null || event.touches.length !== 1 || panel.scrollHeight <= panel.clientHeight) return;
      const nextY = event.touches[0].clientY;
      const distance = lastY - nextY;
      if (distance === 0) return;
      panel.scrollTop += distance;
      lastY = nextY;
      event.preventDefault();
    };
    const endTouchScroll = () => { lastY = null; };
    panel.addEventListener("touchstart", beginTouchScroll, { passive: true });
    panel.addEventListener("touchmove", continueTouchScroll, { passive: false });
    panel.addEventListener("touchend", endTouchScroll);
    panel.addEventListener("touchcancel", endTouchScroll);
    return () => {
      panel.removeEventListener("touchstart", beginTouchScroll);
      panel.removeEventListener("touchmove", continueTouchScroll);
      panel.removeEventListener("touchend", endTouchScroll);
      panel.removeEventListener("touchcancel", endTouchScroll);
    };
  }, []);
  return (
    <div className="screen exit-ticket-screen">
      <img className="group-design-bg" src={asset("compression/lab_background.png")} alt="" />
      <nav className="exit-nav-actions" aria-label="การนำทางภารกิจ">
        <button className="exit-back-button" onClick={onBack}>‹ ย้อนกลับ</button>
        <button className="exit-home-button" type="button" aria-label="กลับไปหน้าเส้นทางภารกิจ" onClick={() => setConfirmHome(true)}><AppIcon name="home" /></button>
      </nav>
      <header className="exit-ticket-header">
        <h1>คำถามจากนักเรียนรายบุคคล</h1>
      </header>
      <section className="exit-ticket-layout">
        <aside className="student-tabs" aria-label="รายชื่อนักเรียน">
          <h2><AppIcon name="users" /> เลือกชื่อนักเรียน</h2>
          {team.map((member, index) => {
            const key = exitTicketKey(member, index);
            const done = isTicketComplete(savedValues[key]) && exitTicketsAreEqual(values[key], savedValues[key]);
            return <button key={`${index}-${member.name}`} className={activeIndex === index ? "active" : ""} onClick={() => { setActiveIndex(index); setSelectedAnswers({ k: "", p: "" }); }}><strong>{index + 1}</strong><img src={asset(`profiles/${member.avatar}.png`)} alt="" /><span>{member.name}</span><i>{done ? "✓" : ""}</i></button>;
          })}
          <div className="system-record-card">
            <b><AppIcon name="box" /> การยืนยันคำตอบ</b>
            <p>{complete ? "ยืนยันครบทุกคนแล้ว ไปต่อได้เลย" : `ยืนยันแล้ว ${completedCount}/${team.length} คน`}</p>
            <span>{complete ? "✓" : `${completedCount}/${team.length}`}</span>
          </div>
        </aside>
        <div className="kpv-card matching-kpv-card" ref={answerPanelRef}>
          <MatchingQuestion field="k" questionNumber={1} instruction="จากสถานการณ์ ให้จับคู่ปัญหาของกล่องพัสดุกับสมบัติของวัสดุที่ควรศึกษา" items={KNOWLEDGE_MATCHES} value={current.k} selectedAnswer={selectedAnswers.k} onSelectAnswer={(answer) => setSelectedAnswers((all) => ({ ...all, k: answer }))} onChange={(value) => update("k", value)} />
          <MatchingQuestion field="p" questionNumber={2} instruction="จากร่องรอยที่พบ ให้จับคู่ร่องรอยความเสียหายกับสาเหตุที่คาดว่าเกี่ยวข้อง" items={PROCESS_MATCHES} value={current.p} selectedAnswer={selectedAnswers.p} onSelectAnswer={(answer) => setSelectedAnswers((all) => ({ ...all, p: answer }))} onChange={(value) => update("p", value)} />
          <section className="value-question">
            <header><strong>3</strong><h2><span>ข้อที่ 3</span> วัสดุที่ใช้แล้วแต่ยังมีสภาพเหมาะสม เรานำกลับมาใช้ใหม่ได้หรือไม่ เพราะเหตุใด</h2></header>
            <div className="value-answer-controls">
              <div className="value-choice" role="group" aria-label="เลือกว่านำกลับมาใช้ใหม่ได้หรือไม่">
                {["ได้", "ไม่ได้"].map((choice) => <button type="button" key={choice} aria-pressed={valueAnswer.choice === choice} onClick={() => update("v", writeValueAnswer(choice, valueAnswer.reason))}>{valueAnswer.choice === choice ? "✓ " : ""}{choice}</button>)}
              </div>
              <label><span>อธิบายเหตุผล</span><textarea value={valueAnswer.reason} maxLength={240} onChange={(event) => update("v", writeValueAnswer(valueAnswer.choice, event.target.value))} placeholder="พิมพ์เหตุผลของนักเรียนที่นี่..." /></label>
            </div>
          </section>
          <footer className="kpv-actions">
            <span>{activeSaved ? "✓ บันทึกคำตอบคนนี้แล้ว" : activeComplete ? "ตอบครบแล้ว กดบันทึกคำตอบได้เลย" : "ตอบคำถามให้ครบทั้ง 3 ข้อ"}</span>
            <button type="button" className="button button-orange" disabled={!activeComplete || activeSaved} onClick={saveCurrent}>{activeSaved ? "✓ บันทึกแล้ว" : "บันทึกคำตอบคนนี้"}</button>
            <button type="button" className="button button-orange system-continue-button" disabled={!complete} onClick={() => onDone(values)}>ไปต่อ ›</button>
          </footer>
        </div>
      </section>
      {confirmHome && <div className="exit-home-confirm-backdrop" role="presentation" onClick={() => setConfirmHome(false)}>
        <section className="exit-home-confirm" role="dialog" aria-modal="true" aria-labelledby="exit-home-confirm-title" onClick={(event) => event.stopPropagation()}>
          <div className="exit-home-confirm-icon"><AppIcon name="home" /></div>
          <h2 id="exit-home-confirm-title">กลับไปหน้าเส้นทางภารกิจไหม?</h2>
          <p>คำตอบที่นักเรียนตอบไว้จะยังอยู่และบันทึกต่อให้เหมือนเดิม</p>
          <div className="exit-home-confirm-actions">
            <button type="button" className="button button-white" onClick={() => setConfirmHome(false)}>อยู่ต่อ</button>
            <button type="button" className="button button-orange" onClick={() => { setConfirmHome(false); onHome(); }}>ตกลง</button>
          </div>
        </section>
      </div>}
    </div>
  );
}

function LabScreens({ save, onPatch, onBack, onComplete }: {
  save: GameSave; onPatch: (next: Partial<GameSave>) => void; onBack: () => void; onComplete?: () => void;
}) {
  if (save.stage === "testHub") return <TestHub save={save} onStart={(room) => onPatch(openLabPatch(save, room))} onRestart={() => onPatch(restartMissionTwoLabsPatch())} onBack={onBack} onComplete={onComplete} />;
  if (!LAB_ROOMS.some((room) => room.id === save.stage) && save.stage !== "elasticity") return null;
  const returnFromLab = (room: LabRoom) => {
    if (labRecapRequired(save, room)) {
      onPatch({ stage: "recap", recapIndex: labQuestionIndex(room) });
      return;
    }
    onPatch({ stage: "testHub" });
  };
  const draftAnswer = (room: string, materialId: string, answer: string) => onPatch({ labAnswerDrafts: { ...save.labAnswerDrafts, [room]: { ...save.labAnswerDrafts?.[room], [materialId]: answer } } });
  if (save.stage === "compression") return <CompressionLab save={save} onAnswer={(id, answer) => draftAnswer("compression", id, answer)} onSave={(compressionResults, compressionIndex) => onPatch({ compressionResults, compressionIndex })} onDone={() => returnFromLab("compression")} />;
  if (save.stage === "impact" || save.stage === "elasticity") return <ImpactLab save={save} onAnswer={(id, answer) => draftAnswer("impact", id, answer)} onSave={(impactResults, impactIndex) => onPatch({ impactResults, impactIndex, stage: "impact" })} onDone={() => returnFromLab("impact")} />;
  if (save.stage === "absorption") return <AbsorptionLab save={save} onSave={(absorptionResults, absorptionIndex) => onPatch({ absorptionResults, absorptionIndex })} onDone={() => returnFromLab("absorption")} />;
  return null;
}

function TestHub({ save, onStart, onRestart, onBack, onComplete }: {
  save: GameSave; onStart: (room: LabRoom) => void; onRestart: () => void; onBack: () => void; onComplete?: () => void;
}) {
  const complete = canContinueAfterLabs(save);
  const [reviewRoom, setReviewRoom] = useState<LabRoom | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const reviewDefinition = reviewRoom ? LAB_ROOMS.find((room) => room.id === reviewRoom) : null;
  const reviewEvidence = (materialId: string) => {
    if (!reviewRoom) return "ยังไม่มีผล";
    if (reviewRoom === "compression") {
      const observation = save.compressionResults[materialId]?.observation;
      return observation ? ({ none: "ไม่เห็นการยุบ", slight: "ยุบเล็กน้อย", much: "ยุบมาก" }[observation] ?? "มีผลแล้ว") : "ยังไม่มีผล";
    }
    if (reviewRoom === "impact") {
      const observation = save.impactResults[materialId]?.observation;
      return observation ? ({ none: "ไม่เสียหาย", slight: "เสียหายเล็กน้อย", much: "เสียหายมาก" }[observation] ?? "มีผลแล้ว") : "ยังไม่มีผล";
    }
    const water = save.absorptionResults[materialId];
    const observation = water?.observation ?? water?.modelLevel;
    return observation ? ({ none: "ไม่ดูดซับ", low: "ดูดซับน้อย", medium: "ดูดซับปานกลาง", high: "ดูดซับมาก" }[observation] ?? "มีผลแล้ว") : "ยังไม่มีผล";
  };
  return (
    <div className="screen test-hub-screen">
      <img className="group-design-bg" src={asset("compression/lab_background.png")} alt="" />
      <button className="button button-white lab-back-button" onClick={onBack}>‹ กลับไปเลือกทีม</button>
      <header className="test-hub-header">
        <div><h1>ห้องทดลอง</h1><p className="test-hub-teacher-note">เลือกเข้าห้องทดลองใดก่อนก็ได้<br />ทดลองให้ครบทั้ง 3 ห้อง แล้วกดไปต่อได้เลย</p></div>
      </header>
      <section className="test-room-grid" aria-label="ห้องทดสอบทั้งหมด">
        {LAB_ROOMS.map((room) => {
          const count = labResultCount(save, room.id);
          const finished = count === LAB_MATERIALS.length;
          const progressText = finished ? "✓ ทดลองครบแล้ว" : count ? `บันทึกแล้ว ${count}/${LAB_MATERIALS.length} วัสดุ` : "พร้อมทดลอง";
          return <article key={room.id} className={`test-room-card test-room-${room.id}${finished ? " is-finished" : ""}`}>
            <span className="test-room-icon" aria-hidden="true"><img src={asset(`menu/lab-room-${room.id}.png`)} alt="" /></span>
            <small>ห้องทดลองที่ {room.number}</small><h2>{room.title}</h2>
            <div className="test-room-description"><p>{room.observation}</p><p>{room.purpose}</p></div>
            {progressText && <div className="test-room-progress">{progressText}</div>}
            {count === LAB_MATERIALS.length && <button type="button" className="button test-result-button" onClick={() => setReviewRoom(room.id)} aria-label={`ดูผลการทดลอง${room.title}`}><AppIcon name="notebook" />ดูผลการทดลอง</button>}
            <button className="button button-orange" disabled={finished} onClick={() => onStart(room.id)} aria-label={`เข้าห้องทดสอบ${room.title}`}>{finished ? "✓ เสร็จแล้ว" : count ? "ทดลองต่อ" : "เข้าห้องทดลอง"}</button>
          </article>;
        })}
      </section>
      <footer className="test-hub-footer"><p>{complete ? "✓ ทดลองครบทั้ง 3 ห้องแล้ว ไปต่อได้เลย" : ""}</p>
        <div className="test-hub-footer-actions">{complete && <button className="button test-hub-restart" type="button" onClick={() => setConfirmRestart(true)}><AppIcon name="refresh" />ทดลองใหม่ทั้ง 3 ห้อง</button>}
          {onComplete && <button className="button button-orange" disabled={!complete} onClick={onComplete}>เชื่อมโยงผลกับกล่อง ›</button>}
        </div>
      </footer>
      {confirmRestart && <div className="test-restart-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setConfirmRestart(false); }}><section className="test-restart-dialog" role="dialog" aria-modal="true" aria-labelledby="test-restart-title"><div className="test-restart-icon"><AppIcon name="refresh" /></div><h2 id="test-restart-title">ทดลองใหม่ทั้ง 3 ห้อง?</h2><p>ผลการทดลองและคำตอบของภารกิจที่ 2 รอบนี้จะเริ่มใหม่ทั้งหมด</p><div><button className="button button-white" type="button" onClick={() => setConfirmRestart(false)}>ยังไม่เริ่มใหม่</button><button className="button button-orange" type="button" onClick={() => { setConfirmRestart(false); onRestart(); }}>เริ่มทดลองใหม่</button></div></section></div>}
      {reviewDefinition && <div className="test-result-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setReviewRoom(null); }}>
        <section className="test-result-dialog" role="dialog" aria-modal="true" aria-labelledby="test-result-title">
          <header><div><span>ผลการทดลอง</span><h2 id="test-result-title">{reviewDefinition.title}</h2></div><button type="button" aria-label="ปิดผลการทดลอง" onClick={() => setReviewRoom(null)}>×</button></header>
          <table className="test-result-table"><caption className="sr-only">ผลการทดลองของวัสดุแต่ละชนิด</caption><thead><tr><th scope="col">วัสดุ</th><th scope="col">ผลการทดลอง</th></tr></thead><tbody>{LAB_MATERIALS.map((material) => <tr key={material.id}><th scope="row"><span className="test-result-material-name"><img src={asset(`materials/${material.image}`)} alt="" />{material.name}</span></th><td>{reviewEvidence(material.id)}</td></tr>)}</tbody></table>
          <button type="button" className="button button-orange" onClick={() => setReviewRoom(null)}>ปิดหน้าผลการทดลอง</button>
        </section>
      </div>}
    </div>
  );
}

const MISSION_TWO_REVIEW_ITEMS = [
  { cause: "แรงกด", fallbackEvidence: "รอยยุบ", property: "ความต้านทานแรงกดทับ", icon: "package", image: "inspection/damaged_box_preview_top.png", imageAlt: "รอยยุบด้านบนของกล่องจากภารกิจที่ 1" },
  { cause: "แรงกระแทก", fallbackEvidence: "สิ่งของภายในเสียหาย", property: "ความสามารถในการลดความเสียหายจากแรงกระแทก", icon: "shield", image: "cutscene/shot_09_cracked_cup.png", imageAlt: "แก้วแตกร้าวที่พบจากภารกิจที่ 1" },
  { cause: "น้ำ", fallbackEvidence: "รอยเปียก", property: "การดูดซับน้ำของวัสดุ", icon: "drop", image: "inspection/damaged_box_preview_wet.png", imageAlt: "คราบเปียกบนกล่องจากภารกิจที่ 1" },
] as const satisfies readonly { cause: DamageCause; fallbackEvidence: string; property: string; icon: AppIconName; image: string; imageAlt: string }[];

function evidenceLabels(save: GameSave, cause: DamageCause, fallback: string) {
  const labels = Object.entries(save.inspectionFindings ?? {})
    .filter(([, selectedCause]) => selectedCause === cause)
    .map(([damageId]) => DAMAGES.find((damage) => damage.id === damageId)?.label)
    .filter((label): label is NonNullable<typeof label> => label !== undefined);
  return labels.length ? labels.join(" และ ") : fallback;
}

function MissionTwoReview({ save, onBack, onNext }: { save: GameSave; onBack: () => void; onNext: () => void }) {
  return <div className="screen mission-two-screen mission-two-review-screen">
    <button className="button button-white mission-two-back" type="button" onClick={onBack}>‹ กลับหน้าภารกิจ</button>
    <header><span>ทบทวนภารกิจที่ 1</span><h1>หลักฐานที่เราค้นพบ</h1><p>ร่องรอยความเสียหายพาเราไปหาสมบัติที่ต้องศึกษา</p></header>
    <main className="mission-two-review-table" role="table" aria-label="ความสัมพันธ์ระหว่างร่องรอยความเสียหายกับสมบัติที่เลือกศึกษา">
      <div className="mission-two-review-table-head" role="row">
        <span aria-hidden="true" />
        <b role="columnheader">ร่องรอยจากภารกิจที่ 1</b>
        <span aria-hidden="true" />
        <b role="columnheader">สมบัติที่เลือกศึกษา</b>
      </div>
      {MISSION_TWO_REVIEW_ITEMS.map((item, index) => <article key={item.cause} role="row">
        <strong aria-hidden="true">{index + 1}</strong>
        <div className="mission-two-review-evidence" role="cell"><img src={asset(item.image)} alt={item.imageAlt} /><span><b>{evidenceLabels(save, item.cause, item.fallbackEvidence)}</b><em>{item.cause}</em></span></div>
        <i className="mission-two-review-arrow" aria-hidden="true"><svg viewBox="0 0 120 48" focusable="false"><path d="M6 24h91" /><path d="m82 7 17 17-17 17" /></svg></i>
        <div className="mission-two-review-property" role="cell"><AppIcon name={item.icon} /><span><b>{item.property}</b></span></div>
      </article>)}
    </main>
    <footer className="mission-two-review-footer"><p><b>เรารู้ปัญหาแล้ว</b><span>ต่อไปมาทดลองดูว่า ผลแต่ละด้านจะช่วยวางแผนทำกล่องส่วนใด</span></p><button className="button button-orange" type="button" onClick={onNext}>ไปดูคำถามสำคัญ ›</button></footer>
  </div>;
}

function MissionTwoQuestion({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return <div className="screen mission-two-screen mission-two-question-screen">
    <button className="button button-white mission-two-back" type="button" onClick={onBack}>‹ กลับไปทบทวน</button>
    <section className="mission-two-question-card" aria-labelledby="mission-two-question-title">
      <div className="mission-two-question-symbol"><AppIcon name="message" /></div>
      <span className="mission-two-question-label">คำถามสำคัญของภารกิจ</span>
      <h1 id="mission-two-question-title"><span>เราจะใช้ผลการทดลองสมบัติทั้ง 3 ด้าน</span><span>วางแผนทำส่วนต่าง ๆ ของกล่องพัสดุได้อย่างไร?</span></h1>
      <p>ทดลองทั้ง 3 ห้อง แล้วนำผลมาเชื่อมโยงกับส่วนต่าง ๆ ของกล่อง</p>
      <button className="button button-orange mission-two-question-start" type="button" onClick={onNext}>ลองคาดการณ์ก่อนทดลอง ›</button>
    </section>
  </div>;
}

function MissionTwoIntro({ onBack, onStart }: { onBack: () => void; onStart: () => void }) {
  return <div className="screen mission-two-screen mission-two-intro mission-two-welcome-screen">
    <img className="mission-route-bg" src={asset("menu/cover.png")} alt="" />
    <button className="mission-briefing-back mission-two-welcome-back" type="button" onClick={onBack}>‹ กลับไปดูการคาดการณ์</button>
    <main className="mission-two-welcome-card">
      <span className="mission-two-welcome-label">ภารกิจที่ 2</span>
      <div className="mission-two-welcome-illustrations" aria-hidden="true">
        <span><img className="mission-two-lab-icon" src={asset("menu/lab-room-compression.png")} alt="" /></span>
        <span><img className="mission-two-lab-icon" src={asset("menu/lab-room-impact.png")} alt="" /></span>
        <span><img className="mission-two-lab-icon" src={asset("menu/lab-room-absorption.png")} alt="" /></span>
      </div>
      <h1>สำรวจ 3 สมบัติลับของวัสดุทั้ง 5 ชนิด</h1>
      <p className="mission-two-welcome-copy">ทดลองแรงกด แรงกระแทก และน้ำ</p>
      <div className="mission-two-route" aria-label="เส้นทางภารกิจที่ 2"><article><i>1</i><b>ทดลอง 3 ห้อง</b><span>แรงกด แรงกระแทก และน้ำ</span></article><article><i>2</i><b>ตอบหลังแต่ละห้อง</b><span>ช่วยกันเปรียบเทียบผล</span></article><article><i>3</i><b>จับคู่กับกล่อง</b><span>ผลนี้ใช้กับส่วนใด</span></article><article><i>4</i><b>ตอบคนละ 3 ข้อ</b><span>ความรู้ วิธีคิด และคุณค่า</span></article></div>
      <button className="button button-orange mission-briefing-start mission-two-primary" type="button" onClick={onStart}>เริ่มทำภารกิจ <b aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg></b></button>
    </main>
  </div>;
}

const MISSION_TWO_CONNECTION_OPTIONS = [
  { key: "structure", label: "โครงกล่อง", detail: "ช่วยให้กล่องไม่ยุบง่าย", icon: "package" },
  { key: "impact", label: "ส่วนกันกระแทก", detail: "ช่วยปกป้องสิ่งของ", icon: "shield" },
  { key: "water", label: "ชั้นลดการเปียก", detail: "ช่วยลดน้ำซึมเข้ากล่อง", icon: "drop" },
] as const satisfies readonly { key: string; label: string; detail: string; icon: AppIconName }[];

const MISSION_TWO_PART_PREDICTIONS = [
  { key: "compression", cause: "แรงกด", evidence: "รอยยุบ", problem: "กล่องยุบ", damageImage: "inspection/damaged_box_preview_top.png", imageAlt: "รอยยุบด้านบนของกล่องจากภารกิจที่ 1" },
  { key: "impact", cause: "แรงกระแทก", evidence: "สิ่งของภายในเสียหาย", problem: "สิ่งของเสียหาย", damageImage: "cutscene/shot_09_cracked_cup.png", imageAlt: "แก้วแตกร้าวที่พบจากภารกิจที่ 1" },
  { key: "water", cause: "น้ำ", evidence: "รอยเปียก", problem: "กล่องเปียก", damageImage: "inspection/damaged_box_preview_wet.png", imageAlt: "คราบเปียกบนกล่องจากภารกิจที่ 1" },
] as const satisfies readonly { key: string; cause: DamageCause; evidence: string; problem: string; damageImage: string; imageAlt: string }[];

function MissionTwoParts({ save, values, onBack, onChange, onDone }: {
  save: GameSave;
  values: Record<string, string>;
  onBack: () => void;
  onChange: (values: Record<string, string>) => void;
  onDone: () => void;
}) {
  const complete = MISSION_TWO_PART_PREDICTIONS.every((item) => Boolean(values[item.key]));
  return <div className="screen mission-two-screen mission-two-parts-screen">
    <button className="button button-white mission-two-back" type="button" onClick={onBack}>‹ กลับไปดูคำถามสำคัญ</button>
    <header><span>คาดการณ์ก่อนทดลอง</span><h1>จากร่องรอย กล่องควรมีส่วนใด?</h1><p>เลือกส่วนของกล่องที่น่าจะช่วยแก้แต่ละปัญหา</p></header>
    <main className="mission-two-parts-list">
      {MISSION_TWO_PART_PREDICTIONS.map((item, rowIndex) => <article className="mission-two-parts-row" key={item.key}>
        <section className="mission-two-parts-clue">
          <img src={asset(item.damageImage)} alt={item.imageAlt} />
          <span><b>{evidenceLabels(save, item.cause, item.evidence)}</b></span>
        </section>
        <section className="mission-two-parts-options" role="group" aria-label={`เลือกส่วนของกล่องสำหรับ${item.problem}`}>
          {MISSION_TWO_CONNECTION_OPTIONS.map((option) => {
            const selected = values[item.key] === option.key;
            return <button key={option.key} type="button" aria-pressed={selected} onClick={() => onChange({ ...values, [item.key]: option.key })}>
              <AppIcon name={option.icon} />
              <span><b>{option.label}</b><small>{option.detail}</small></span>
            </button>;
          })}
        </section>
        <strong className="mission-two-parts-row-number" aria-hidden="true">{rowIndex + 1}</strong>
      </article>)}
    </main>
    <footer className="mission-two-parts-footer"><p><b>{complete ? "✓ คาดการณ์ครบทั้ง 3 ปัญหาแล้ว" : `เลือกแล้ว ${Object.values(values).filter(Boolean).length}/3 ปัญหา`}</b><span>นี่คือความคิดก่อนทดลอง ยังไม่ต้องเลือกวัสดุ</span></p><button className="button button-orange" type="button" disabled={!complete} onClick={onDone}>ไปดูภาพรวมภารกิจ ›</button></footer>
  </div>;
}

const MISSION_TWO_CONNECTION_TASKS = [
  { key: "compression", label: "แรงกดทับ", result: "ยุบมาก ยุบเล็กน้อย และไม่เห็นการยุบ", problem: "กล่องยุบ", prompt: "ผลแรงกดช่วยวางแผนส่วนใดของกล่อง?", answer: "structure", icon: "package", image: "compression" },
  { key: "impact", label: "แรงกระแทก", result: "เสียหายมาก เสียหายเล็กน้อย และไม่พบความเสียหาย", problem: "สิ่งของเสียหาย", prompt: "ผลแรงกระแทกช่วยวางแผนส่วนใดของกล่อง?", answer: "impact", icon: "shield", image: "impact" },
  { key: "water", label: "การดูดซับน้ำ", result: "ดูดซับมาก ดูดซับน้อย และไม่ดูดซับ", problem: "กล่องเปียก", prompt: "ผลการดูดซับน้ำช่วยวางแผนส่วนใดของกล่อง?", answer: "water", icon: "drop", image: "absorption" },
] as const satisfies readonly { key: string; label: string; result: string; problem: string; prompt: string; answer: string; icon: AppIconName; image: string }[];

function MissionTwoConnection({ values, onBack, onChange, onDone }: { values: Record<string, string>; onBack: () => void; onChange: (values: Record<string, string>) => void; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const task = MISSION_TWO_CONNECTION_TASKS[index];
  const selected = values[task.key] ?? "";
  const correct = selected === task.answer;
  const moveBack = () => {
    if (showSummary) { setShowSummary(false); setIndex(MISSION_TWO_CONNECTION_TASKS.length - 1); return; }
    if (index > 0) setIndex((current) => current - 1);
    else onBack();
  };
  const moveNext = () => {
    if (index < MISSION_TWO_CONNECTION_TASKS.length - 1) setIndex((current) => current + 1);
    else setShowSummary(true);
  };
  return <div className="screen mission-two-screen mission-two-connection-screen">
    <button className="button button-white mission-two-back" type="button" onClick={moveBack}>‹ {showSummary ? "กลับไปดูคำตอบ" : index > 0 ? "ข้อก่อนหน้า" : "กลับห้องทดลอง"}</button>
    {!showSummary ? <>
      <header><span>จับคู่ผล {index + 1}/{MISSION_TWO_CONNECTION_TASKS.length}</span><h1>{task.prompt}</h1></header>
      <main className="mission-two-connection-main">
        <section className="connection-source-card">
          <div className="connection-source-result"><img src={asset(`menu/lab-room-${task.image}.png`)} alt="" /><div className="connection-source-copy"><small>ผลจากห้องทดลอง</small><b>{task.label}</b><span>{task.result}</span></div></div>
          <i className="connection-source-arrow" aria-hidden="true"><svg viewBox="0 0 56 68" focusable="false"><path d="M28 4v49" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" /><path d="m11 39 17 17 17-17" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></svg></i>
          <strong>ใช้ช่วยแก้ “{task.problem}”</strong>
        </section>
        <section className="connection-option-grid" aria-label="เลือกส่วนของกล่อง">
          {MISSION_TWO_CONNECTION_OPTIONS.map((option, optionIndex) => <button key={option.key} type="button" aria-pressed={selected === option.key} onClick={() => onChange({ ...values, [task.key]: option.key })}><i className="connection-option-number" aria-hidden="true">{optionIndex + 1}</i><AppIcon name={option.icon} /><span className="connection-option-copy"><b>{option.label}</b><small>{option.detail}</small></span></button>)}
        </section>
      </main>
      <footer className="mission-two-connection-footer"><p className={selected ? correct ? "is-correct" : "is-wrong" : ""}>{!selected ? "เลือกส่วนของกล่องที่สัมพันธ์กับผลการทดลอง" : correct ? "✓ เชื่อมโยงถูกต้องแล้ว" : "ลองคิดดูอีกครั้งว่า ผลจากห้องนี้ช่วยแก้ปัญหาใด"}</p><button className="button button-orange" type="button" disabled={!correct} onClick={moveNext}>{index < MISSION_TWO_CONNECTION_TASKS.length - 1 ? "ข้อต่อไป ›" : "ดูภาพรวม ›"}</button></footer>
    </> : <>
      <header><span>คำตอบสำคัญของภารกิจ</span><h1>ผลทดลองช่วยวางแผนกล่อง</h1><p>จำภาพ 3 คู่นี้ไว้ แล้วค่อยเลือกวัสดุในภารกิจที่ 3</p></header>
      <main className="mission-two-connection-summary">
        <div className="mission-two-connection-summary-head"><b>ผลการทดลอง</b><span aria-hidden="true" /><b>ส่วนของกล่องที่นำไปวางแผน</b></div>
        {MISSION_TWO_CONNECTION_TASKS.map((item) => {
          const option = MISSION_TWO_CONNECTION_OPTIONS.find((candidate) => candidate.key === item.answer)!;
          return <article key={item.key}><div className="connection-summary-lab"><img src={asset(`menu/lab-room-${item.image}.png`)} alt="" /><span><small>ผลทดลอง</small><b>{item.label}</b></span></div><i aria-hidden="true">→</i><div className="connection-summary-part"><AppIcon name={option.icon} /><span><b>{option.label}</b></span></div></article>;
        })}
      </main>
      <footer className="mission-two-connection-summary-footer"><button className="button button-orange" type="button" onClick={onDone}>ไปตอบคำถาม ›</button></footer>
    </>}
  </div>;
}

const MISSION_TWO_ASSESSMENT_QUESTIONS = [
  { field: "k", badge: "K", icon: "package", title: "เปรียบเทียบสมบัติ", evidence: ["วัสดุ ก — ยุบเล็กน้อย", "วัสดุ ข — ยุบมาก"], prompt: "วัสดุใดต้านทานแรงกดทับได้ดีกว่า?", options: [{ value: "วัสดุ ก", label: "วัสดุ ก" }, { value: "วัสดุ ข", label: "วัสดุ ข" }, { value: "ทั้งสองเท่ากัน", label: "ทั้งสองเท่ากัน" }] },
  { field: "p", badge: "P", icon: "shield", title: "สรุปจากข้อมูล", evidence: ["ใช้วัสดุ ก แล้วสิ่งของเสียหายน้อยกว่าใช้วัสดุ ข"], prompt: "ข้อใดสรุปจากผลการทดลองได้ถูกต้อง?", options: [{ value: "วัสดุ ก ช่วยลดความเสียหายจากแรงกระแทกได้ดีกว่า", label: "วัสดุ ก ช่วยลดความเสียหายจากแรงกระแทกได้ดีกว่า" }, { value: "วัสดุ ก ดูดซับน้ำได้น้อยกว่า", label: "วัสดุ ก ดูดซับน้ำได้น้อยกว่า" }, { value: "วัสดุ ก ต้านทานแรงกดได้ดีกว่า", label: "วัสดุ ก ต้านทานแรงกดได้ดีกว่า" }] },
  { field: "v", badge: "V", icon: "notebook", title: "เลือกใช้หลักฐาน", evidence: ["เพื่อนสองคนคิดไม่เหมือนกันว่าผลของวัสดุชนิดใดดีกว่า"], prompt: "ควรทำอย่างไร?", options: [{ value: "กลับไปดูผลการทดลองที่บันทึกไว้", label: "กลับไปดูผลการทดลองที่บันทึกไว้" }, { value: "เลือกวัสดุที่ชอบ", label: "เลือกวัสดุที่ชอบ" }, { value: "เดาคำตอบ", label: "เดาคำตอบ" }] },
] as const satisfies readonly { field: keyof ExitTicket; badge: string; icon: AppIconName; title: string; evidence: readonly string[]; prompt: string; options: readonly { value: string; label: string }[] }[];

function speakThai(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "th-TH";
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

function missionTwoTicketComplete(ticket?: ExitTicket) {
  return Boolean(ticket?.k && ticket?.p && ticket?.v);
}

function MissionTwoAssessment({ team, values, confirmed, onBack, onChange, onDone }: { team: TeamMember[]; values: Record<string, ExitTicket>; confirmed: Record<string, boolean>; onBack: () => void; onChange: (values: Record<string, ExitTicket>, confirmed: Record<string, boolean>) => void; onDone: () => void }) {
  const members = attendingMembers(team);
  const [activeIndex, setActiveIndex] = useState(0);
  const member = members[activeIndex] ?? members[0];
  const memberKey = member ? exitTicketKey(member, activeIndex) : "student-0";
  const ticket = values[memberKey] ?? EMPTY_EXIT_TICKET;
  const memberConfirmed = Boolean(confirmed[memberKey]);
  const confirmedCount = members.filter((candidate, index) => confirmed[exitTicketKey(candidate, index)]).length;
  const allConfirmed = members.length > 0 && confirmedCount === members.length;
  const choose = (field: keyof ExitTicket, answer: string) => {
    const nextValues = { ...values, [memberKey]: { ...ticket, [field]: answer } };
    const nextConfirmed = { ...confirmed, [memberKey]: false };
    onChange(nextValues, nextConfirmed);
  };
  const saveCurrent = () => {
    if (!missionTwoTicketComplete(ticket)) return;
    const nextConfirmed = { ...confirmed, [memberKey]: true };
    onChange(values, nextConfirmed);
    const nextIndex = members.findIndex((candidate, index) => index !== activeIndex && !nextConfirmed[exitTicketKey(candidate, index)]);
    if (nextIndex >= 0) setActiveIndex(nextIndex);
  };
  if (!member) return <div className="screen mission-two-screen mission-two-assessment-screen"><button className="button button-white mission-two-back" onClick={onBack}>‹ ย้อนกลับ</button><main className="mission-two-assessment-empty"><h1>ยังไม่มีรายชื่อนักเรียน</h1><p>กลับไปเลือกทีมก่อนเริ่มคำถามรายบุคคล</p></main></div>;
  return <div className="screen mission-two-screen mission-two-assessment-screen">
    <button className="button button-white mission-two-back" type="button" onClick={onBack}>‹ กลับหน้าสรุป</button>
    <header><span>คำถามรายบุคคล</span><h1>เลือกชื่อ แล้วตอบคำถามทั้ง 3 ข้อ</h1><p>ตอบให้ครบทุกข้อ แล้วกดบันทึกคำตอบของคนนี้</p></header>
    <main className="mission-two-assessment-layout">
      <aside className="mission-two-student-list"><h2><AppIcon name="users" /> เลือกชื่อนักเรียน</h2>{members.map((candidate, index) => {
        const key = exitTicketKey(candidate, index);
        return <button type="button" key={key} className={activeIndex === index ? "active" : ""} onClick={() => setActiveIndex(index)}><strong>{index + 1}</strong><img src={asset(`profiles/${candidate.avatar}.png`)} alt="" /><span>{candidate.name}</span><i>{confirmed[key] ? "✓" : ""}</i></button>;
      })}<div className="mission-two-assessment-progress"><b>บันทึกแล้ว</b><span>{confirmedCount}/{members.length} คน</span></div></aside>
      <section className="mission-two-assessment-card">
        {memberConfirmed ? <div className="mission-two-assessment-saved"><div>✓</div><h2>บันทึกคำตอบของ {member.name} แล้ว</h2><p>คำตอบถูกซ่อนไว้ ส่งเครื่องให้เพื่อนคนถัดไปได้เลย</p>{!allConfirmed && <button className="button button-orange" type="button" onClick={() => {
          const nextIndex = members.findIndex((candidate, index) => index !== activeIndex && !confirmed[exitTicketKey(candidate, index)]);
          if (nextIndex >= 0) setActiveIndex(nextIndex);
        }}>เลือกคนถัดไป ›</button>}</div> : <>
          <div className="mission-two-assessment-question-list">
            {MISSION_TWO_ASSESSMENT_QUESTIONS.map((question, questionIndex) => {
              const selected = ticket[question.field];
              return <article className="mission-two-assessment-question" data-answered={Boolean(selected)} key={question.field}>
                <header><strong>{questionIndex + 1}</strong><div className="mission-two-assessment-evidence"><AppIcon name={question.icon} /><div>{question.evidence.map((line) => <p key={line}>{line}</p>)}</div></div></header>
                <h2>{question.prompt}</h2>
                <div className="mission-two-assessment-options">{question.options.map((option, optionIndex) => <button type="button" key={option.value} aria-pressed={selected === option.value} onClick={() => choose(question.field, option.value)}><i>{optionIndex + 1}</i><span>{option.label}</span></button>)}</div>
              </article>;
            })}
          </div>
          <footer className="mission-two-assessment-save"><span>{missionTwoTicketComplete(ticket) ? "ตอบครบทั้ง 3 ข้อแล้ว กดบันทึกได้เลย" : `ตอบแล้ว ${Object.values(ticket).filter(Boolean).length}/3 ข้อ`}</span><button className="button button-orange" type="button" disabled={!missionTwoTicketComplete(ticket)} onClick={saveCurrent}>บันทึกคำตอบคนนี้</button></footer>
        </>}
      </section>
    </main>
    <div className="mission-two-assessment-finish"><span>{allConfirmed ? "✓ บันทึกครบทุกคนแล้ว" : `บันทึกแล้ว ${confirmedCount}/${members.length} คน ต้องครบทุกคนจึงไปต่อได้`}</span><button className="button button-orange" type="button" disabled={!allConfirmed} onClick={onDone}>ไปหน้าแสดงความยินดี ›</button></div>
  </div>;
}

function MissionTwoComplete({ team, onHome }: { team: TeamMember[]; onHome: () => void }) {
  return <div className="screen mission-complete-screen mission-two-complete-celebration">
    <div className="mission-complete-rays" aria-hidden="true" />
    <div className="mission-complete-confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} />)}</div>
    <section className="mission-complete-card" aria-labelledby="mission-two-complete-title">
      <div className="mission-complete-mascot-wrap" aria-hidden="true"><span>★</span><span>✦</span><div className="mission-complete-mascot" style={{ backgroundImage: `url(${asset("mascot/parcel-guide-sprite.png")})` }} /></div>
      <p className="mission-complete-kicker">ยอดเยี่ยม นักวิทยาศาสตร์น้อย!</p>
      <h1 id="mission-two-complete-title">ทำภารกิจที่ 2 เสร็จแล้ว</h1>
      <p className="mission-complete-copy">ทุกคนทดลองวัสดุ เชื่อมโยงผลกับส่วนของกล่อง และตอบคำถามรายบุคคลครบทั้ง 3 ข้อแล้ว</p>
      <p className="mission-two-complete-members">{team.map((member) => member.name).join(" · ")}</p>
      <div className="mission-complete-reward"><AppIcon name="unlock" /><div><b>ปลดล็อกภารกิจที่ 3</b><small>ใช้หลักฐานเลือกวัสดุและออกแบบกล่องพัสดุ</small></div></div>
      <button className="button button-orange mission-complete-home" type="button" onClick={onHome}>กลับหน้าภารกิจ <span aria-hidden="true">›</span></button>
    </section>
  </div>;
}

function Recap({ index, answers, onAnswer, onDone }: { index: number; answers: Record<string, number[]>; onAnswer: (answers: Record<string, number[]>) => void; onDone: () => void }) {
  const [message, setMessage] = useState("ช่วยกันดูผล แล้วเลือกคำตอบของทีม");
  const item = RECAP[index];
  const passed = answers[String(index)]?.includes(item.answer) ?? false;
  const choose = (choice: number) => {
    if (passed) return;
    const key = String(index);
    onAnswer({ ...answers, [key]: [...(answers[key] ?? []), choice] });
    setMessage(choice === item.answer ? "ถูกต้อง! หยุดรอครูถามว่าเรารู้จากผลตรงไหน" : "ลองกลับไปดูผลที่เพิ่งทดลองอีกครั้งนะ");
  };
  return <div className="screen recap-screen lab-recap-screen"><div className="quiz-card lab-recap-card">
    <header className="lab-recap-heading"><span className="lab-recap-icon" aria-hidden="true"><img src={asset(`menu/lab-room-${item.lab}.png`)} alt="" /></span><div><div className="step-pill">{item.label}</div><h1>{item.question}</h1></div></header>
    <div className="quiz-choices lab-recap-choices">{item.choices.map((choice, choiceIndex) => <button key={choice.label} type="button" disabled={passed} aria-pressed={passed && choiceIndex === item.answer} onClick={() => choose(choiceIndex)}><span className="recap-choice-number" aria-hidden="true">{choiceIndex + 1}</span><span className="recap-choice-images">{choice.materialIds.map((materialId) => { const material = MATERIALS.find((entry) => entry.id === materialId); return material ? <img key={material.id} src={asset(`materials/${material.image}`)} alt="" /> : null; })}</span><b>{choice.label}</b></button>)}</div>
    <p className={passed ? "is-correct" : ""}>{passed ? "ถูกต้อง! หยุดรอครูถามว่า “เรารู้จากผลตรงไหน”" : message}</p>{passed && <><aside className="lab-recap-conclusion">{item.conclusion}</aside><button className="button button-orange lab-recap-next" onClick={onDone}>ครูถามแล้ว ไปต่อ ›</button></>}
  </div></div>;
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
      ? `กด: ยุบ ${compression.deformationMm ?? compression.measurements.at(-1) ?? 0} มม. · น้ำ: ${absorption.riseCm !== undefined ? `รอยเปียก ${absorption.riseCm.toFixed(1)} ซม.` : `ซึม ${absorption.absorbed ?? 0} หน่วย`} · ยืด: คืน ${elasticity.recovered} มม.`
      : "รอเลือกวัสดุ";
    return <label key={part}><b>{part}</b><select value={values[part] ?? ""} onChange={(event) => onChange({ ...values, [part]: event.target.value })}><option value="">เลือกวัสดุ</option>{MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><span>{report}</span></label>;
  })}</div><button className="button button-orange prediction-done" disabled={!complete} onClick={onDone}>บันทึกคำตอบทีม</button></div>;
}

function Summary({ save, onReplay, onReset }: { save: GameSave; onReplay: () => void; onReset: () => void }) {
  const names = save.team.map((m) => m.name).join(" · ");
  const labsComplete = allLabsComplete(save);
  return <div className="screen summary-screen"><div className="summary-card">
    <div className="step-pill">{labsComplete ? "จบภารกิจทดลองวัสดุ" : "จบกิจกรรมคาบที่ 1"}</div><div className="medal"><AppIcon name="search" /></div>
    <h1>{labsComplete ? "บันทึกกิจกรรมทดลองที่เปิดใช้ครบแล้ว!" : "วิเคราะห์ปัญหาและกำหนดสมบัติที่ต้องศึกษาเรียบร้อยแล้ว"}</h1><p>{names}</p>
    <section className="summary-next-lesson"><span>{labsComplete ? "สิ่งที่ได้สังเกต" : "คาบต่อไป"}</span><h2>{labsComplete ? "ความต้านทานแรงกดทับ การลดความเสียหายจากแรงกระแทก และการดูดซับน้ำ" : "เราจะทดสอบสมบัติของวัสดุทั้ง 3 ด้าน"}</h2>{labsComplete && <p>นำสิ่งที่สังเกตจากแบบจำลองมาเปรียบเทียบและอภิปรายร่วมกัน</p>}</section>
    <div className="summary-actions"><button className="button button-yellow" onClick={onReplay}>เริ่มภารกิจรอบใหม่</button><button className="button button-white" onClick={onReset}>กลับหน้าปก</button></div>
  </div></div>;
}
