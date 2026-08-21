"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  AVATARS, BOX_PARTS, COMPRESSION_FRAME_KEYS, DAMAGES, DESIGN_QUESTIONS, EMPTY_SAVE, MATERIALS, RECAP, STORY,
  type CompressionFrameKey, type CompressionResult, type GameSave, type Stage, type TeamMember,
} from "./data";

const SAVE_KEY = "parcel-lab-web-save-v1";
const STATS_KEY = "parcel-lab-group-design-statistics-v1";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

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
      try { setSave({ ...EMPTY_SAVE, ...JSON.parse(raw) }); } catch { /* keep fresh save */ }
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
  const saveGroupDesign = (designChoices: Record<string, string>) => {
    const runId = save.runId || createRunId();
    try {
      const raw = localStorage.getItem(STATS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const records = Array.isArray(parsed) ? parsed : [];
      if (!records.some((record) => typeof record === "object" && record !== null && "runId" in record && record.runId === runId)) {
        records.push({ runId, submittedAt: new Date().toISOString(), members: save.team.map((member) => member.name), answers: designChoices });
        localStorage.setItem(STATS_KEY, JSON.stringify(records));
      }
    } catch { /* keep the game playable if browser storage is unavailable */ }
    patch({ runId, designChoices, stage: "compression" });
  };

  if (!loaded) return <main className="loading-screen">กำลังเตรียมห้องทดลอง…</main>;

  return (
    <main className="app-shell">
      {save.stage !== "menu" && <audio className="game-bgm" src={asset("audio/happy_clappy_loop.ogg")} autoPlay loop muted={!save.audio} />}
      <section className="game-frame" aria-live="polite">
        {save.stage === "menu" && <MainMenu onStart={() => go("team")} />}
        {save.stage === "team" && <TeamSetup initial={save.team} onBack={() => go("menu")} onDone={(team) => patch({ team, runId: createRunId(), designChoices: {}, stage: "story", storyIndex: 0 })} />}
        {save.stage === "story" && <ComicStory index={save.storyIndex} audio={save.audio} onAudio={() => patch({ audio: !save.audio })} onIndex={(storyIndex) => patch({ storyIndex })} onDone={() => go("inspection")} />}
        {save.stage === "inspection" && <DamageInspection index={save.inspectionIndex} audio={save.audio} onIndex={(inspectionIndex) => patch({ inspectionIndex })} onDone={() => go("materials")} />}
        {save.stage === "materials" && <MaterialGuide onDone={() => go("design")} />}
        {save.stage === "design" && <GroupBoxDesign initial={save.designChoices} onDone={saveGroupDesign} />}
        {save.stage === "compression" && <CompressionLab save={save} onSave={(compressionResults, compressionIndex) => patch({ compressionResults, compressionIndex })} onAudio={() => patch({ audio: !save.audio })} onDone={() => go("recap")} />}
        {save.stage === "recap" && <Recap index={save.recapIndex} onIndex={(recapIndex) => patch({ recapIndex })} onDone={() => go("prediction")} />}
        {save.stage === "prediction" && <Prediction values={save.predictions} results={save.compressionResults} onChange={(predictions) => patch({ predictions })} onDone={() => go("summary")} />}
        {save.stage === "summary" && <Summary save={save} onReplay={() => patch({ stage: "story", runId: createRunId(), designChoices: {}, storyIndex: 0, inspectionIndex: 0, recapIndex: 0 })} onReset={reset} />}
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
    setHint("ถูกต้อง! พบความเสียหายแล้ว");
    setTimeout(() => { if (index >= DAMAGES.length - 1) onDone(); else onIndex(index + 1); }, 1200);
  };
  const damage = DAMAGES[index];
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
      <div className={`inspection-hint ${solved ? "is-success" : ""}`}>{solved ? `ถูกต้อง! ${damage.success}` : hint}</div>
    </div>
  );
}

function MaterialGuide({ onDone }: { onDone: () => void }) {
  return (
    <div className="screen material-guide-screen">
      <img className="material-guide-bg" src={asset("compression/lab_background.png")} alt="" />
      <header className="material-guide-header">
        <span>ขั้นที่ 4/9</span>
        <div>
          <h1>รู้จักวัสดุก่อนออกแบบ</h1>
          <p>อ่านคุณสมบัติของวัสดุทั้ง 7 ชนิด แล้วช่วยกันคุยในทีม</p>
        </div>
      </header>
      <section className="material-guide-grid" aria-label="ข้อมูลวัสดุสำหรับออกแบบกล่อง">
        {MATERIALS.map((material) => (
          <article key={material.id}>
            <img src={asset(`materials/${material.image}`)} alt={material.name} />
            <div><h2>{material.name}</h2><p>{material.guide}</p></div>
          </article>
        ))}
      </section>
      <footer className="material-guide-footer">
        <span>เมื่อทีมอ่านครบแล้ว ไปเลือกวัสดุเพื่อแก้ปัญหาที่กล่องใบเดิมเคยพบ</span>
        <button className="button button-orange" onClick={onDone}>อ่านครบแล้ว เริ่มออกแบบ</button>
      </footer>
    </div>
  );
}

function GroupBoxDesign({ initial, onDone }: { initial: Record<string, string>; onDone: (values: Record<string, string>) => void }) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const complete = DESIGN_QUESTIONS.every((question) => Boolean(values[question.id]));
  return (
    <div className="screen group-design-screen">
      <img className="group-design-bg" src={asset("compression/lab_background.png")} alt="" />
      <header className="group-design-header">
        <span>ขั้นที่ 5/9</span>
        <div>
          <h1>ช่วยกันสร้างกล่องที่ดีขึ้น</h1>
          <p>เลือกคำตอบของกลุ่ม ไม่มีคำตอบผิดหรือถูก</p>
        </div>
        <strong>ตอบร่วมกันทั้งกลุ่ม</strong>
      </header>
      <section className="group-design-grid" aria-label="คำถามเลือกวัสดุของกลุ่ม">
        {DESIGN_QUESTIONS.map((question) => (
          <article key={question.id}>
            <div className="design-problem"><small>ปัญหาของกล่องเดิม</small><b>{question.damage}</b></div>
            <h2>{question.prompt}</h2>
            <div className="design-options">
              {question.choices.map((materialId) => {
                const material = MATERIALS.find((item) => item.id === materialId);
                if (!material) return null;
                const selected = values[question.id] === materialId;
                return (
                  <button
                    key={materialId}
                    className={selected ? "selected" : ""}
                    aria-pressed={selected}
                    onClick={() => setValues((current) => ({ ...current, [question.id]: materialId }))}
                  >
                    <img src={asset(`materials/${material.image}`)} alt="" />
                    <span>{material.name}</span>
                    {selected && <i>เลือกแล้ว</i>}
                  </button>
                );
              })}
            </div>
          </article>
        ))}
      </section>
      <footer className="group-design-footer">
        <span>คำตอบของทีมจะถูกเก็บเป็นสถิติ โดยไม่ตัดสินถูกหรือผิด</span>
        <button className="button button-orange" disabled={!complete} onClick={() => onDone(values)}>บันทึกคำตอบของกลุ่ม</button>
      </footer>
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

function Prediction({ values, results, onChange, onDone }: { values: Record<string, string>; results: Record<string, CompressionResult>; onChange: (v: Record<string, string>) => void; onDone: () => void }) {
  const complete = BOX_PARTS.every((part) => values[part]);
  return <div className="screen prediction-screen"><header><span>ขั้นที่ 8/9</span><div><h1>ทีมเราจะเลือกวัสดุอะไร?</h1><p>ใช้ผลที่วัดได้ช่วยตัดสินใจ ไม่มีคำตอบผิด</p></div></header><div className="prediction-list">{BOX_PARTS.map((part) => {
    const selected = MATERIALS.find((m) => m.id === values[part]); const result = selected ? results[selected.id] : undefined;
    return <label key={part}><b>{part}</b><select value={values[part] ?? ""} onChange={(event) => onChange({ ...values, [part]: event.target.value })}><option value="">เลือกวัสดุ</option>{MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><span>{result ? `ยุบ ${result.measurements[2]} มม. · คืน ${result.recovered} มม.` : "รอเลือกวัสดุ"}</span></label>;
  })}</div><button className="button button-orange prediction-done" disabled={!complete} onClick={onDone}>บันทึกคำตอบทีม</button></div>;
}

function Summary({ save, onReplay, onReset }: { save: GameSave; onReplay: () => void; onReset: () => void }) {
  const names = save.team.map((m) => m.name).join(" · ");
  return <div className="screen summary-screen"><div className="summary-card"><div className="step-pill">ขั้นที่ 9/9</div><div className="medal">★</div><h1>ทีมผ่านภารกิจกล่องแกร่ง!</h1><p>{names}</p><div className="summary-grid">{BOX_PARTS.map((part) => { const material = MATERIALS.find((m) => m.id === save.predictions[part]); return <article key={part}><b>{part}</b><span>{material?.name ?? "-"}</span></article>; })}</div><div className="summary-actions"><button className="button button-yellow" onClick={onReplay}>เล่นเนื้อเรื่องใหม่</button><button className="button button-white" onClick={onReset}>กลับหน้าปก</button></div></div></div>;
}
