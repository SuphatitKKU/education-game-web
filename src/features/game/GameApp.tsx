"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  AVATARS, BOX_PARTS, COMPRESSION_FRAME_KEYS, DAMAGES, EMPTY_SAVE, MATERIALS, RECAP, ROUTE_EVENTS, STORY,
  type CompressionFrameKey, type CompressionResult, type ElasticityResult, type ExitTicket, type GameSave, type Stage, type TeamMember, type WaterAbsorptionResult,
} from "./data";

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

function playSound(name: string, enabled: boolean) {
  if (!enabled) return;
  const audio = new Audio(asset(`audio/${name}`));
  audio.volume = 0.55;
  void audio.play().catch(() => undefined);
}

export function GameApp() {
  const [save, setSave] = useState<GameSave>(EMPTY_SAVE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
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

  const patch = (next: Partial<GameSave>) => setSave((current) => ({ ...current, ...next }));
  const go = (stage: Stage) => patch({ stage });
  const reset = () => {
    localStorage.removeItem(SAVE_KEY);
    setSave(EMPTY_SAVE);
  };
  const goBack = () => {
    if (labRoomsPaused) { go("exitTicket"); return; }
    if (save.stage === "team") { go("menu"); return; }
    if (save.stage === "story") {
      if (save.storyIndex > 0) patch({ storyIndex: save.storyIndex - 1 });
      else go("team");
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
    patch({ runId, exitTickets, stage: LAB_ROOMS_ENABLED ? "testHub" : PREDICTION_ENABLED ? "prediction" : "summary" });
  };
  const saveExitTicketDraft = (exitTickets: Record<string, ExitTicket>) => {
    patch({ runId: save.runId || createRunId(), exitTickets });
  };
  const labRoomsPaused = !LAB_ROOMS_ENABLED && DISABLED_LAB_STAGES.has(save.stage);

  if (!loaded) return <main className="loading-screen">กำลังเตรียมห้องทดลอง…</main>;

  return (
    <main className="app-shell">
      {save.stage !== "menu" && <audio className="game-bgm" src={asset("audio/happy_clappy_loop.ogg")} autoPlay loop muted={!save.audio} />}
      <section className="game-frame" aria-live="polite">
        {save.stage === "menu" && <MainMenu onStart={() => go("team")} />}
        {labRoomsPaused && <LabRoomsPaused onContinue={() => go(PREDICTION_ENABLED ? "prediction" : "summary")} />}
        {!labRoomsPaused && save.stage === "team" && <TeamSetup initial={save.team} onBack={() => go("menu")} onDone={(team) => patch({ team, runId: createRunId(), missionStudent: "", routeEvents: {}, studyFocus: {}, exitTickets: {}, compressionResults: {}, absorptionResults: {}, elasticityResults: {}, stage: "story", storyIndex: 0 })} />}
        {!labRoomsPaused && save.stage === "story" && <ComicStory index={save.storyIndex} audio={save.audio} onAudio={() => patch({ audio: !save.audio })} onIndex={(storyIndex) => patch({ storyIndex })} onDone={() => go("inspection")} />}
        {!labRoomsPaused && save.stage === "inspection" && <DamageInspection index={save.inspectionIndex} audio={save.audio} onIndex={(inspectionIndex) => patch({ inspectionIndex })} onDone={() => go("materials")} />}
        {!labRoomsPaused && save.stage === "materials" && <MaterialGuide onBack={() => patch({ stage: "inspection", inspectionIndex: DAMAGES.length - 1 })} onDone={() => go("studyFocus")} />}
        {!labRoomsPaused && save.stage === "studyFocus" && <StudyFocusScreen values={save.studyFocus} onBack={() => go("materials")} onChange={(studyFocus) => patch({ studyFocus })} onDone={() => go("exitTicket")} />}
        {!labRoomsPaused && save.stage === "exitTicket" && <ExitTicketScreen team={save.team} initial={save.exitTickets} onBack={() => go("studyFocus")} onSaveDraft={saveExitTicketDraft} onDone={saveExitTickets} />}
        {!labRoomsPaused && save.stage === "testHub" && <TestHub onStart={() => go("compression")} />}
        {!labRoomsPaused && save.stage === "compression" && <CompressionLab save={save} onSave={(compressionResults, compressionIndex) => patch({ compressionResults, compressionIndex })} onAudio={() => patch({ audio: !save.audio })} onDone={() => go("absorption")} />}
        {!labRoomsPaused && save.stage === "absorption" && <AbsorptionLab save={save} onSave={(absorptionResults, absorptionIndex) => patch({ absorptionResults, absorptionIndex })} onDone={() => go("elasticity")} />}
        {!labRoomsPaused && save.stage === "elasticity" && <ElasticityLab save={save} onSave={(elasticityResults, elasticityIndex) => patch({ elasticityResults, elasticityIndex })} onDone={() => go("recap")} />}
        {!labRoomsPaused && save.stage === "recap" && <Recap index={save.recapIndex} onIndex={(recapIndex) => patch({ recapIndex })} onDone={() => go(PREDICTION_ENABLED ? "prediction" : "summary")} />}
        {!labRoomsPaused && PREDICTION_ENABLED && save.stage === "prediction" && <Prediction labsEnabled={LAB_ROOMS_ENABLED} values={save.predictions} compressionResults={save.compressionResults} absorptionResults={save.absorptionResults} elasticityResults={save.elasticityResults} onChange={(predictions) => patch({ predictions })} onDone={() => go("summary")} />}
        {!labRoomsPaused && save.stage === "summary" && <Summary save={save} onReplay={() => patch({ stage: "story", runId: createRunId(), missionStudent: "", routeEvents: {}, studyFocus: {}, exitTickets: {}, storyIndex: 0, inspectionIndex: 0, compressionIndex: 0, absorptionIndex: 0, elasticityIndex: 0, recapIndex: 0 })} onReset={reset} />}
        {(save.stage === "story" || save.stage === "inspection") && <button className="back-nav-button" onClick={(event) => { event.stopPropagation(); goBack(); }}>‹ ย้อนกลับ</button>}
        {save.stage !== "menu" && save.stage !== "team" && save.stage !== "story" && save.stage !== "inspection" && save.stage !== "materials" && save.stage !== "studyFocus" && save.stage !== "exitTicket" && <button className="home-reset-button" onClick={(event) => { event.stopPropagation(); reset(); }}>หน้าปก</button>}
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
      </div>
    </div>
  );
}

function TeamSetup({ initial, onBack, onDone }: { initial: TeamMember[]; onBack: () => void; onDone: (team: TeamMember[]) => void }) {
  const seed = initial.length >= 6 ? initial : Array.from({ length: 6 }, (_, index) => ({ name: "", avatar: AVATARS[index] }));
  const [members, setMembers] = useState<TeamMember[]>(seed);
  const valid = members.length >= 6 && members.every((m) => m.name.trim()) && new Set(members.map((m) => m.avatar)).size === members.length;
  const update = (index: number, next: Partial<TeamMember>) => setMembers((current) => current.map((m, i) => i === index ? { ...m, ...next } : m));
  return (
    <div className="screen team-screen">
      <img className="soft-bg" src={asset("menu/cover.png")} alt="" />
      <header className="team-header">
        <button className="button button-yellow compact" onClick={onBack}>กลับหน้าปก</button>
        <div><h1>จัดทีมออกแบบกล่อง</h1><p>ใส่ชื่อเล่น แล้วเลือกนักสำรวจที่ไม่ซ้ำกัน</p></div>
        <div className="count-badge">{members.length} / 7 คน</div>
      </header>
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
        <span>{valid ? "ทีมพร้อมออกเดินทาง!" : "กรอกชื่อและเลือกตัวละครให้ครบทุกคน"}</span>
        <button className="button button-orange" disabled={!valid} onClick={() => onDone(members)}>ทีมพร้อมแล้ว</button>
      </footer>
    </div>
  );
}

function MissionRoute({ team, selectedStudent, values, audio, onAudio, onSelectStudent, onChange, onDone }: { team: TeamMember[]; selectedStudent: string; values: Record<string, boolean>; audio: boolean; onAudio: () => void; onSelectStudent: (name: string) => void; onChange: (values: Record<string, boolean>) => void; onDone: () => void }) {
  const trackedCount = ROUTE_EVENTS.filter((event) => values[event.id]).length;
  const ready = Boolean(selectedStudent) && trackedCount === ROUTE_EVENTS.length;
  const toggleEvent = (eventId: string) => {
    const next = { ...values, [eventId]: !values[eventId] };
    onChange(next);
    playSound("10_idea_chime.ogg", audio);
  };
  return (
    <div className="screen mission-route-screen">
      <img className="mission-route-bg" src={asset("menu/cover.png")} alt="" />
      <header className="mission-route-header">
        <span>ตอนที่ 1 · ส่วนที่ 1/4</span>
        <div>
          <h1>รับภารกิจและติดตามเส้นทางพัสดุ</h1>
          <p>เลือกชื่อของตนเอง รับภารกิจ แล้วกดติดตามเหตุการณ์ระหว่างทางให้ครบ 3 จุด</p>
        </div>
        <button className="audio-fab route-audio" aria-label="เปิดหรือปิดเสียง" onClick={onAudio}>{audio ? "🔊" : "🔇"}</button>
      </header>

      <aside className="mission-team-card" aria-label="รายชื่อนักเรียนที่รับภารกิจ">
        <h2>เลือกชื่อผู้รับภารกิจ</h2>
        <div className="mission-member-list">
          {team.map((member) => (
            <button key={member.name} className={selectedStudent === member.name ? "selected" : ""} onClick={() => onSelectStudent(member.name)}>
              <img src={asset(`profiles/${member.avatar}.png`)} alt="" />
              <span>{member.name}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="route-map-card" aria-label="แผนที่เส้นทางพัสดุจากผู้ส่งถึงผู้รับ">
        <div className="route-line" />
        <div className="route-stop sender"><b>ผู้ส่ง</b><span>แพ็กกล่อง</span></div>
        <div className="route-stop receiver"><b>ผู้รับ</b><span>เปิดตรวจ</span></div>
        {ROUTE_EVENTS.map((event, index) => {
          const selected = values[event.id];
          return (
            <button
              key={event.id}
              className={`route-event event-${index + 1} ${selected ? "selected" : ""}`}
              aria-pressed={Boolean(selected)}
              onClick={() => toggleEvent(event.id)}
            >
              <img src={asset(`cutscene/${event.image}`)} alt="" />
              <b>{event.short}</b>
              <span>{selected ? "ติดตามแล้ว" : "กดติดตาม"}</span>
            </button>
          );
        })}
      </section>

      <aside className="mission-log-card" aria-label="บันทึกเหตุการณ์ระหว่างขนส่ง">
        <h2>บันทึกระหว่างทาง</h2>
        {ROUTE_EVENTS.map((event) => (
          <article key={event.id} className={values[event.id] ? "selected" : ""}>
            <b>{event.title}</b>
            <p>{event.note}</p>
            <small>หลักฐานที่ต้องตามหา: {event.evidence}</small>
          </article>
        ))}
      </aside>

      <footer className="mission-route-footer">
        <span>{ready ? `${selectedStudent} รับภารกิจและติดตามครบแล้ว ไปสำรวจกล่องที่มาถึงผู้รับ` : `เลือกชื่อ 1 คน และติดตามเหตุการณ์ ${trackedCount} / ${ROUTE_EVENTS.length} จุด`}</span>
        <button className="button button-orange" disabled={!ready} onClick={onDone}>ไปสำรวจกล่อง</button>
      </footer>
    </div>
  );
}

function ComicStory({ index, audio, onAudio, onIndex, onDone }: { index: number; audio: boolean; onAudio: () => void; onIndex: (n: number) => void; onDone: () => void }) {
  const scene = STORY[index];
  const effects = ["01_paper_wrap.ogg", "02_tape_seal.ogg", "03_scooter_move.ogg", "04_rain.ogg", "05_conveyor_pressure.ogg", "06_box_impact.ogg", "07_paper_friction.ogg", "08_handoff.ogg", "09_unpack.ogg", "10_idea_chime.ogg"];
  const next = () => {
    playSound(effects[index], audio);
    if (index >= STORY.length - 1) onDone(); else onIndex(index + 1);
  };
  return (
    <div className="screen comic-screen" onClick={next} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") next(); }}>
      <img className="comic-image" src={asset(`cutscene/${scene[0]}`)} alt={scene[1]} />
      <button className="audio-fab" aria-label="เปิดหรือปิดเสียง" onClick={(event) => { event.stopPropagation(); onAudio(); }}>{audio ? "🔊" : "🔇"}</button>
      <div className="comic-progress">{index + 1} / {STORY.length}</div>
      <button className="comic-next-button" onClick={(event) => { event.stopPropagation(); next(); }} aria-label="ไปฉากถัดไป">
        <span>{index >= STORY.length - 1 ? "เริ่มสำรวจ" : "ถัดไป"}</span>
        <b>›</b>
      </button>
    </div>
  );
}

function DamageInspection({ index, audio, onIndex, onDone }: { index: number; audio: boolean; onIndex: (n: number) => void; onDone: () => void }) {
  type ViewerMaterial = { name: string; pbrMetallicRoughness: { setBaseColorFactor: (color: string | number[]) => void } };
  type ViewerElement = HTMLElement & { model?: { materials: ViewerMaterial[] } };

  const defaultHint = "ลากเพื่อหมุนกล่อง แล้วแตะบริเวณที่คิดว่าถูก";
  const [hint, setHint] = useState(defaultHint);
  const [ready, setReady] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [solved, setSolved] = useState(false);
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
    setHint(defaultHint);
    setSolved(false);
  }, [index]);
  const answer = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (solved) return;
    setSolved(true);
    playSound("10_idea_chime.ogg", audio);
    if (index >= DAMAGES.length - 1) {
      setHint("พบความเสียหายครบทุกจุดแล้ว กดถัดไปเพื่อสำรวจวัสดุ");
      return;
    }
    setHint("ถูกต้อง! พบความเสียหายแล้ว");
    setTimeout(() => onIndex(index + 1), 1200);
  };
  const damage = DAMAGES[index];
  const readyToContinue = solved && index >= DAMAGES.length - 1;
  return (
    <div className="screen inspection-screen">
      <img className="inspection-bg" src={asset("inspection/background.png")} alt="โต๊ะตรวจสอบกล่อง" />
      <div className="floating-question">{damage.title}</div>
      <div className="inspection-counter">{index + 1} / {DAMAGES.length}</div>
      <div className="model-stage">
        {ready && (
          <model-viewer
            ref={viewerRef}
            src={asset("models/damaged_box.glb")}
            alt="กล่องพัสดุเสียหายที่หมุนตรวจสอบและแตะตอบได้"
            camera-controls
            disable-pan
            disable-zoom
            touch-action="none"
            camera-orbit="35deg 65deg 7m"
            camera-target="0m 0m 0m"
            field-of-view="35deg"
            exposure="1.05"
            shadow-intensity="1"
            onClick={() => { if (!solved) setHint(damage.hint); }}
          >
            {DAMAGES.map((spot) => {
              const active = spot.id === damage.id;
              return (
                <button
                  key={spot.id}
                  slot={`hotspot-${spot.id}`}
                  className={`damage-target ${active && solved ? "is-solved" : ""}`}
                  data-position={spot.position}
                  data-normal={spot.normal}
                  aria-label={active ? "เลือกบริเวณความเสียหายนี้" : undefined}
                  aria-hidden={!active}
                  tabIndex={active ? 0 : -1}
                  onClick={active ? answer : (event) => { event.stopPropagation(); if (!solved) setHint(damage.hint); }}
                >
                  {active && solved ? "✓" : null}
                </button>
              );
            })}
          </model-viewer>
        )}
        {!modelLoaded && <div className="model-loading" role="status"><span className="loading-box" /><b>กำลังเตรียมกล่อง 3 มิติ…</b></div>}
        {solved && <div className="inspection-success" role="status"><span>✓</span><div><b>ถูกต้อง!</b><small>{damage.success}</small></div></div>}
      </div>
      <div className={`inspection-hint ${solved ? "is-success" : ""}`}>{readyToContinue ? "พบความเสียหายครบทุกจุดแล้ว กดถัดไปเพื่อสำรวจวัสดุ" : solved ? `ถูกต้อง! ${damage.success}` : hint}</div>
      {readyToContinue && <button className="inspection-next-button" onClick={onDone}>ถัดไป ›</button>}
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
  { id: "compression", title: "การทนต่อแรงกด", icon: "📦", detail: "วัสดุยุบ บุบ หรือเปลี่ยนรูปร่างมากน้อยเพียงใดเมื่อได้รับแรงกด" },
  { id: "elasticity", title: "ความยืดหยุ่น", icon: "↔", detail: "วัสดุเปลี่ยนรูปร่างเมื่อได้รับแรง และกลับคืนสู่รูปร่างเดิมหรือใกล้เคียงเดิมได้เพียงใดเมื่อหยุดออกแรง" },
  { id: "water", title: "การดูดซับน้ำ", icon: "💧", detail: "น้ำซึมเข้าไปในเนื้อวัสดุมากน้อยเพียงใด" },
] as const;
const MATERIAL_GUIDE_ORDER = ["corrugated_cardboard", "pe_sheet", "bubble_wrap", "closed_cell_pe_foam", "cardboard", "kraft_paper", "waxed_paper"] as const;
const STUDY_FOCUS_WARNING = "ลองพิจารณาอีกครั้งว่า กล่องยุบ สิ่งของเสียหาย และกล่องเปียก ต้องศึกษาสมบัติใดบ้าง";

function MaterialGuide({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const orderedMaterials = MATERIAL_GUIDE_ORDER.map((id) => MATERIALS.find((material) => material.id === id)).filter((material): material is (typeof MATERIALS)[number] => Boolean(material));
  return (
    <div className="screen material-guide-screen">
      <img className="material-guide-bg" src={asset("compression/lab_background.png")} alt="" />
      <button className="material-guide-back-button" onClick={onBack}>‹ ย้อนกลับ</button>
      <header className="material-guide-header">
        <div>
          <h1>สำรวจวัสดุ</h1>
        </div>
      </header>
      <section className="material-guide-grid" aria-label="ข้อมูลวัสดุสำหรับออกแบบกล่อง">
        {orderedMaterials.map((material) => (
          <article key={material.id}>
            <img src={asset(`materials/${material.image}`)} alt={material.name} />
            <div><h2>{material.name}</h2></div>
          </article>
        ))}
      </section>
      <footer className="material-guide-footer">
        <button className="button button-orange" onClick={onDone}>ถัดไป</button>
      </footer>
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
        <div>
          <h1>จากภาพภายนอก เรายังตัดสินใจไม่ได้ว่าวัสดุใดเหมาะที่สุด</h1>
          <p>ควรศึกษาสมบัติใดบ้าง?</p>
        </div>
      </header>
      <div className="study-topic-title study-focus-title"><span>★</span> เลือกสมบัติที่จำเป็นต้องศึกษา</div>
      <section className="study-topic-panel study-focus-panel" aria-label="เลือกสมบัติที่ต้องศึกษา">
        {STUDY_TOPICS.map((topic) => (
          <button key={topic.id} className={values[topic.id] ? "selected" : ""} aria-pressed={Boolean(values[topic.id])} onClick={() => toggle(topic.id)}>
            <i>{topic.icon}</i>
            <b>{topic.title}</b>
            <span>{topic.detail}</span>
            {values[topic.id] && <em>✓</em>}
          </button>
        ))}
      </section>
      {warning && <div className="study-focus-warning" role="alert">{warning}</div>}
      <footer className="study-focus-footer">
        <span>เลือกแล้ว {selectedCount}/{STUDY_TOPICS.length} สมบัติ</span>
        <button className="button button-orange" onClick={saveFocus}>บันทึกสิ่งที่ต้องศึกษา</button>
      </footer>
    </div>
  );
}

const EMPTY_EXIT_TICKET: ExitTicket = { k: "", p: "", v: "" };

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
  const activeKey = exitTicketKey(activeIndex);
  const activeName = team[activeIndex]?.name ?? "นักเรียน";
  const current = values[activeKey] ?? EMPTY_EXIT_TICKET;
  const isTicketComplete = (ticket?: ExitTicket) => Boolean(ticket?.k.trim() && ticket.p.trim() && ticket.v.trim());
  const complete = team.length > 0 && team.every((_, index) => isTicketComplete(savedValues[exitTicketKey(index)]));
  const currentReady = isTicketComplete(current);
  const savedCurrent = isTicketComplete(savedValues[activeKey]);
  const completedCount = team.filter((_, index) => isTicketComplete(savedValues[exitTicketKey(index)])).length;
  const update = (field: keyof ExitTicket, value: string) => {
    setValues((all) => ({ ...all, [activeKey]: { ...current, [field]: value } }));
  };
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
            const done = isTicketComplete(savedValues[exitTicketKey(index)]);
            return <button key={`${index}-${member.name}`} className={activeIndex === index ? "active" : ""} onClick={() => setActiveIndex(index)}><strong>{index + 1}</strong><img src={asset(`profiles/${member.avatar}.png`)} alt="" /><span>{member.name}</span><i>{done ? "✓" : ""}</i></button>;
          })}
          <div className="system-record-card">
            <b>▣ บันทึกของระบบ</b>
            <p>{complete ? "บันทึกครบทุกคนแล้ว ไปต่อได้เลย" : `บันทึกแล้ว ${completedCount}/${team.length} คน`}</p>
            <span>{complete ? "✓" : `${completedCount}/${team.length}`}</span>
          </div>
        </aside>
        <div className="kpv-card">
          <label className="kpv-row k-row"><strong>K</strong><div><b>💡 จากการสำรวจ เราควรศึกษาสมบัติของวัสดุอะไรบ้าง?</b><textarea value={current.k} maxLength={120} onChange={(event) => update("k", event.target.value)} placeholder="เขียนคำตอบของนักเรียนที่นี่..." /></div><i>📖</i></label>
          <label className="kpv-row p-row"><strong>P</strong><div><b>🔍 ถ้าจะหาวัสดุที่เหมาะสม นักเรียนจะทำอย่างไร?</b><textarea value={current.p} maxLength={120} onChange={(event) => update("p", event.target.value)} placeholder="เขียนคำตอบของนักเรียนที่นี่..." /></div><i>📋</i></label>
          <label className="kpv-row v-row"><strong>V</strong><div><b>💗 การส่งพัสดุอย่างระมัดระวังสำคัญอย่างไร?</b><textarea value={current.v} maxLength={120} onChange={(event) => update("v", event.target.value)} placeholder="เขียนคำตอบของนักเรียนที่นี่..." /></div><i>📦</i></label>
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

function CompressionLab({ save, onSave, onAudio, onDone }: { save: GameSave; onSave: (r: Record<string, CompressionResult>, index: number) => void; onAudio: () => void; onDone: () => void }) {
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
      <button className="sound-button" onClick={onAudio}>เสียง {save.audio ? "เปิด" : "ปิด"}</button>
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
  return <div className="screen summary-screen"><div className="summary-card"><div className="step-pill">ขั้นที่ 9/9</div><div className="medal">★</div><h1>ทีมผ่านภารกิจกล่องแกร่ง!</h1><p>{names}</p><div className="summary-grid">{BOX_PARTS.map((part) => { const material = MATERIALS.find((m) => m.id === save.predictions[part]); return <article key={part}><b>{part}</b><span>{material?.name ?? "-"}</span></article>; })}</div><div className="summary-actions"><button className="button button-yellow" onClick={onReplay}>เล่นเนื้อเรื่องใหม่</button><button className="button button-white" onClick={onReset}>กลับหน้าปก</button></div></div></div>;
}
