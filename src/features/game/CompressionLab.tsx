"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { CompressionResult, GameSave, MaterialDefinition } from "./data";
import { LAB_MATERIALS } from "./labs";
import { APPROACH_DURATION_MS, COMPRESSION_CONDITIONS, COMPRESSION_OBSERVATIONS, LIFT_DURATION_MS, PRESS_DURATION_MS, compressionMaterialResult, compressionModelObservationLabel, compressionObservationLabel, compressionVisualScale, formatCompressionMm, recordCompression, type CompressionObservation, type CompressionPhase } from "./compression";
import { CompressionPress3D } from "./CompressionPress3D";
import styles from "./CompressionLab.module.css";

const asset = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/${path}`;
type Phase = CompressionPhase;
type IconName = "flask" | "scale" | "clock" | "layers" | "home" | "save" | "book" | "chart" | "arrow" | "play" | "size";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    flask: <><path d="M9 3h6M10 3v7L5 19q-.6 2 2 2h10q2.6 0 2-2l-5-9V3M8 15h8" /><circle cx="11" cy="18" r=".6" /></>,
    scale: <><path d="M12 3v18M7 21h10M3 7h18M6 7l-4 8h8L6 7Zm12 0-4 8h8l-4-8Z" /><circle cx="12" cy="5" r="2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 3M12 3v1M12 20v1M3 12h1M20 12h1" /></>,
    layers: <><path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5" /></>,
    home: <><path d="m2 11 10-9 10 9M5 9v12h5v-7h4v7h5V9" /></>,
    save: <><path d="M4 3h13l4 4v14H3V3h1ZM7 3v7h10V3M7 21v-7h10v7" /></>,
    book: <><path d="M6 3h14v18H6q-3 0-3-3V6q0-3 3-3Zm0 0v18M10 7h6M10 11h6M10 15h4" /></>,
    chart: <><path d="M4 21V12h4v9M10 21V3h4v18M16 21V8h4v13" /></>,
    arrow: <path d="M9 3h6v11h5l-8 8-8-8h5V3Z" fill="currentColor" stroke="none" />,
    play: <path d="m7 3 15 9L7 21V3Z" fill="currentColor" stroke="none" />,
    size: <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 2" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function PanelTitle({ icon, children }: { icon: IconName; children: ReactNode }) {
  return <h2 className={styles.panelTitle}><Icon name={icon} />{children}</h2>;
}

/** The result choices use the same code-native material cues as the 3D specimen. */
function CompressionSampleArt({ material, observation }: { material: MaterialDefinition; observation: CompressionObservation }) {
  const choice = COMPRESSION_OBSERVATIONS.find((item) => item.id === observation)!;
  const scale = choice.scale;
  const transform = `translate(0 48) scale(1 ${Math.max(.05, scale)}) translate(0 -48)`;
  const outline = "#38566d";

  return <svg className={styles.sampleArt} viewBox="0 0 240 56" aria-hidden="true">
    <ellipse cx="120" cy="49" rx="108" ry="4" fill="#8da4b5" opacity=".2" />
    <g transform={transform}>
      {material.id === "corrugated_cardboard" && <>
        <rect x="10" y="14" width="220" height="6" rx="2" fill="#d99b49" stroke="#795027" strokeWidth="2" />
        {Array.from({ length: 11 }, (_, index) => <path key={index} d={`M${11 + index * 20} 43 Q${16 + index * 20} -3 ${21 + index * 20} 43 Q${26 + index * 20} -3 ${31 + index * 20} 43`} fill="none" stroke="#9b6327" strokeWidth="3" strokeLinejoin="round" />)}
        <rect x="10" y="42" width="220" height="6" rx="2" fill="#d99b49" stroke="#795027" strokeWidth="2" />
        <path d="M20 17h48m17 0h72m15 0h48" stroke="#efbd79" strokeWidth="1.5" strokeLinecap="round" opacity=".8" />
      </>}
      {material.id === "bubble_wrap" && <>
        <rect x="10" y="42" width="220" height="6" rx="2" fill="#dcecf4" stroke={outline} strokeWidth="2" />
        {Array.from({ length: 8 }, (_, index) => <ellipse key={`back-${index}`} cx={36 + index * 24} cy="31" rx="10" ry="12" fill="#d8edf8" stroke="#7d9db2" strokeWidth="1.4" opacity=".82" />)}
        {Array.from({ length: 9 }, (_, index) => <ellipse key={`front-${index}`} cx={24 + index * 24} cy="34" rx="11" ry="14" fill="#e6f5ff" stroke="#63849b" strokeWidth="2" />)}
        <path d="M13 43h214" stroke="#f8fdff" strokeWidth="2" opacity=".9" />
      </>}
      {material.id === "closed_cell_pe_foam" && <>
        <rect x="10" y="17" width="220" height="31" rx="6" fill="#f0f2e9" stroke={outline} strokeWidth="2" />
        {Array.from({ length: 18 }, (_, index) => <circle key={index} cx={20 + (index * 37) % 205} cy={23 + (index * 11) % 19} r="1.6" fill="#c3cec6" />)}
      </>}
      {material.id === "cardboard" && <>
        <rect x="10" y="17" width="220" height="31" rx="3" fill="#a5a7a5" stroke={outline} strokeWidth="2" />
        <rect x="10" y="17" width="220" height="8" rx="3" fill="#fafaf7" stroke="#87949f" strokeWidth="1.5" />
        {[31, 37, 43].map((y) => <path key={y} d={`M12 ${y}h216`} stroke="#7d8589" strokeWidth="1" opacity=".75" />)}
      </>}
      {material.id === "pe_sheet" && <>
        <rect x="10" y="17" width="220" height="31" rx="5" fill="#92d0f4" fillOpacity=".82" stroke={outline} strokeWidth="2" />
        <path d="m34 43 45-21m29 21 45-21m29 21 28-13" stroke="#d8f0ff" strokeWidth="5" strokeLinecap="round" opacity=".85" />
      </>}
    </g>
  </svg>;
}

/** Code-native press: the specimen and platen share a contact plane while moving. */
function PressMachine({ material, phase = "idle", baseline = false }: { material: MaterialDefinition; phase?: Phase; baseline?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const loaded = !baseline && (phase === "pressing" || phase === "done");
  const contact = !baseline && phase !== "idle" && phase !== "lifting";
  const compressionResult = compressionMaterialResult(material);
  const ratio = loaded ? compressionVisualScale(material) : 1;
  const paper = material.id === "corrugated_cardboard";
  const top = paper ? "#edb766" : material.id === "pe_sheet" ? "#cde9fa" : "#f2f3f1";
  return <svg className={styles.machine} viewBox="0 0 360 370" role="img" aria-label={`${material.name} ${baseline ? "ก่อนกด" : loaded ? "ขณะรับแรงกด" : "พร้อมทดสอบ"}`}>
    <defs>
      <linearGradient id={`${uid}-beam`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e2e8ed" /><stop offset=".4" stopColor="#aeb9c3" /><stop offset="1" stopColor="#8795a1" /></linearGradient>
      <linearGradient id={`${uid}-post`}><stop stopColor="#7a8791" /><stop offset=".45" stopColor="#e8edef" /><stop offset=".65" stopColor="#c8d0d5" /><stop offset="1" stopColor="#6e7c86" /></linearGradient>
      <pattern id={`${uid}-surface`} width="18" height="15" patternUnits="userSpaceOnUse"><path d="m0 5 9 2M10 12l8-3M4 14l1-4" stroke={paper ? "#b88340" : "#9aaebb"} strokeWidth=".6" opacity=".28" /></pattern>
    </defs>
    <ellipse cx="180" cy="344" rx="156" ry="12" fill="#dae3ee" opacity=".65" />
    <path d="M22 318h316v23H22Z" fill={`url(#${uid}-beam)`} stroke="#657785" strokeWidth="2" />
    <path d="m22 318 24-22h268l24 22Z" fill="#dbe2e6" stroke="#81909c" strokeWidth="2" />
    {[48, 293].map((x) => <g key={x}><rect x={x-6} y="73" width="31" height="235" rx="7" fill="#6b7c88" /><rect x={x} y="80" width="20" height="221" rx="5" fill={`url(#${uid}-post)`} stroke="#73838f" /><ellipse cx={x+10} cy="308" rx="10" ry="5" fill="#768793" /><circle cx={x+10} cy="308" r="3" fill="#4c6174" /></g>)}
    <rect x="33" y="46" width="293" height="33" rx="7" fill={`url(#${uid}-beam)`} stroke="#5c7081" strokeWidth="2.5" />
    <path d="M41 52h277" stroke="#f8fcff" strokeWidth="3" strokeLinecap="round" />
    <g className={styles.specimen} style={{ transform: `translateY(307px) scaleY(${ratio}) translateY(-307px)`, transitionDuration: phase === "lifting" ? `${LIFT_DURATION_MS}ms` : "1800ms" }}>
      <path d="m65 279 28-29h179l28 29Z" fill={top} stroke={paper ? "#bc863d" : "#9dacb5"} strokeWidth="1.4" />
      <path d="m65 279 28-29h179l28 29Z" fill={`url(#${uid}-surface)`} />
      <image href={asset(`compression/materials/${material.testFrames.idle}`)} x="62" y="273" width="241" height="38" preserveAspectRatio="none" />
    </g>
    <g className={styles.platen} style={{ transform: `translateY(${contact ? 139 + 28 * (1 - ratio) - (compressionResult.modelObservation === "none" ? 4 : 0) : 0}px)`, transitionDuration: phase === "lifting" ? `${LIFT_DURATION_MS}ms` : phase === "approach" ? `${APPROACH_DURATION_MS}ms` : "1800ms" }}>
      <path d="m65 118 28-28h179l28 28v23H65Z" fill={`url(#${uid}-beam)`} stroke="#6f808d" strokeWidth="2" />
      <path d="m65 118 28-28h179l28 28Z" fill="#d8dfe3" stroke="#87949f" strokeWidth="1.5" />
      <path d="M69 122h226" stroke="#eef4f7" strokeWidth="2" />
    </g>
    {contact && <path className={styles.forceArrow} d="M172 157h17v34h13l-22 23-21-23h13Z" fill="#2478f3" stroke="#0c5dcd" strokeWidth="1.5" />}
    {loaded && <g stroke="#8cb9f5" strokeWidth="3" strokeLinecap="round"><path d="m31 274-12-7m14 17-17 1m313-11 12-7m-14 17 17 1" /></g>}
  </svg>;
}

export function CompressionLab({ save, onSave, onAnswer, onDone, preview = false }: {
  save: GameSave; onSave: (results: Record<string, CompressionResult>, index: number) => void; onDone: () => void; preview?: boolean;
  onAnswer?: (materialId: string, answer: string) => void;
}) {
  const materialIndex = Math.max(0, Math.min(save.compressionIndex, LAB_MATERIALS.length - 1));
  const material = LAB_MATERIALS[materialIndex];
  const [phase, setPhase] = useState<Phase>("idle");
  const [observation, setObservation] = useState<CompressionObservation | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [message, setMessage] = useState("เลือกวัสดุ แล้วกดเริ่มทดสอบ");
  const [showRecords, setShowRecords] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | (() => void)>(null);
  const [elapsedMs, setElapsedMs] = useState(phase === "done" ? PRESS_DURATION_MS : 0);
  const recordsRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const running = phase === "lifting" || phase === "approach" || phase === "pressing";
  const dirty = phase === "done" && !justSaved;
  const count = LAB_MATERIALS.filter((item) => save.compressionResults[item.id]).length;
  const materialResult = compressionMaterialResult(material);

  useEffect(() => {
    if (phase !== "lifting" && phase !== "approach" && phase !== "pressing") return;
    const timer = window.setTimeout(() => {
      if (phase === "lifting") { setPhase("approach"); setMessage("ยกแท่นแล้ว กำลังเลื่อนแท่นลงมาเริ่มใหม่"); }
      else if (phase === "approach") { setPhase("pressing"); setMessage("กำลังกดและจับเวลา 3 วินาที"); }
      else { setPhase("done"); setMessage("สังเกตการยุบ แล้วเลือกผลที่เห็นด้านล่าง"); }
    }, phase === "lifting" ? LIFT_DURATION_MS : phase === "approach" ? APPROACH_DURATION_MS : PRESS_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);
  useEffect(() => { if (showRecords) recordsRef.current?.showModal(); else recordsRef.current?.close(); }, [showRecords]);
  useEffect(() => { if (pendingAction) confirmRef.current?.showModal(); else confirmRef.current?.close(); }, [pendingAction]);
  useEffect(() => {
    if (phase === "done") { setElapsedMs(PRESS_DURATION_MS); return; }
    setElapsedMs(0);
    if (phase !== "pressing") return;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const next = Math.min(PRESS_DURATION_MS, now - startedAt);
      setElapsedMs(next);
      if (next < PRESS_DURATION_MS) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  const reset = () => { setPhase("idle"); setObservation(null); setJustSaved(false); };
  const guard = (action: () => void) => { if (dirty) setPendingAction(() => action); else action(); };
  const selectMaterial = (index: number) => {
    if (running || index === materialIndex) return;
    guard(() => { reset(); onSave(save.compressionResults, index); setMessage("เลือกวัสดุแล้ว กดเริ่มทดสอบได้เลย"); });
  };
  const start = () => guard(() => {
    setObservation(null);
    setJustSaved(false);
    setPhase(phase === "done" ? "lifting" : "approach");
    setMessage(phase === "done" ? "กำลังยกแท่นกดเพื่อเริ่มการทดลองใหม่" : "เครื่องกำลังกดวัสดุ สังเกตเทียบกับก่อนกดนะ");
  });
  const record = () => {
    if (phase !== "done" || !observation || justSaved) return;
    onSave({ ...save.compressionResults, [material.id]: recordCompression(material, observation) }, materialIndex);
    setJustSaved(true);
    setMessage(preview ? "บันทึกในรอบทดลองอิสระแล้ว · เลือกวัสดุถัดไปได้เลย" : "รับผลเข้าภารกิจแล้ว · ดูสถานะการบันทึกที่มุมจอ");
  };

  return <div className={`screen ${styles.screen}`}>
    <header className={styles.header}>
      <div className={styles.brand}><span><Icon name="flask" /></span><b>วิทยาศาสตร์ ป.2</b></div>
      <div className={styles.heading}><h1>ห้องที่ 1 : ความต้านทานแรงกดทับ</h1><p>กดแล้ว ยุบแค่ไหน?</p></div>
      <button className={styles.home} onClick={() => guard(onDone)} disabled={running}><Icon name="home" />เลือกห้อง</button>
    </header>

    <aside className={`${styles.panel} ${styles.conditions}`}>
      <PanelTitle icon="scale">เงื่อนไขการทดลอง</PanelTitle>
      <div className={styles.conditionList}>
        <div><Icon name="size" /><p>ชิ้นวัสดุ<small>{COMPRESSION_CONDITIONS.specimenWidthCm} × {COMPRESSION_CONDITIONS.specimenLengthCm} ซม.<br />หนาเริ่มต้น {COMPRESSION_CONDITIONS.initialThicknessMm} มม.</small></p></div>
        <div><Icon name="arrow" /><p className={styles.forceCondition}>แรงกด<small>{COMPRESSION_CONDITIONS.forceN} นิวตัน<br />ความดัน {COMPRESSION_CONDITIONS.pressureKPa} kPa</small></p></div>
        <div><Icon name="clock" /><p>เวลากดเท่ากัน<small className={styles.conditionTimer} role="timer" data-active={phase === "pressing"}
          aria-label={phase === "lifting" ? "นาฬิกาจับเวลา กำลังยกแท่นกด" : phase === "approach" ? "นาฬิกาจับเวลา กำลังเตรียมกด" : `นาฬิกาจับเวลา ${(elapsedMs / 1000).toFixed(1)} จาก 3 วินาที`}>
          {phase === "lifting" ? "ยกแท่นกด" : phase === "approach" ? "เตรียมกด" : `${(elapsedMs / 1000).toFixed(1)} / 3.0 วินาที`}
        </small></p></div>
        <section><Icon name="flask" /><p>สังเกตความหนา<small>ขณะวัสดุรับแรง</small></p></section>
      </div>
    </aside>

    <section className={`${styles.panel} ${styles.experiment}`} aria-label="การทดลองเปรียบเทียบก่อนและขณะรับแรงกด">
      <PanelTitle icon="flask">การทดลอง</PanelTitle>
      <CompressionPress3D material={material} phase={phase}>
      <div className={styles.machines}>
        <figure><figcaption>ก่อนกด</figcaption><PressMachine material={material} baseline /></figure>
        <span className={styles.compareArrow} aria-hidden="true">···➜</span>
        <figure><figcaption className={styles.loadedLabel}>ขณะรับแรงกด</figcaption><PressMachine material={material} phase={phase} /></figure>
      </div>
      </CompressionPress3D>
      <p className={styles.experimentStatus} role="status">{phase === "idle" ? `${material.name} · หนาเริ่มต้น ${COMPRESSION_CONDITIONS.initialThicknessMm} มม.` : phase === "lifting" ? "กำลังยกแท่นกดเพื่อเริ่มใหม่…" : phase === "approach" ? "แท่นกดกำลังเลื่อนลง…" : phase === "pressing" ? "กำลังกดและจับเวลา…" : `ยุบ ${formatCompressionMm(materialResult.deformationMm)} มม. · เหลือหนา ${formatCompressionMm(materialResult.loadedThicknessMm)} มม.`}</p>
      <div className={styles.progressTrack} aria-hidden="true">{phase !== "idle" && <i className={phase === "pressing" ? styles.progressRunning : phase === "done" ? styles.progressDone : ""} />}</div>
    </section>

    <aside className={`${styles.panel} ${styles.materials}`}>
      <PanelTitle icon="layers">เลือกวัสดุ</PanelTitle>
      <div className={styles.materialList}>{LAB_MATERIALS.map((item, index) => <button key={item.id} aria-pressed={index === materialIndex} aria-label={`เลือกวัสดุ ${item.name}`} disabled={running} onClick={() => selectMaterial(index)}>
        <img src={asset(`materials/${item.image}`)} alt="" /><span>{item.name}</span>
        {index === materialIndex ? <b className={styles.selectedCheck} aria-hidden="true">✓</b> : save.compressionResults[item.id] ? <b className={styles.savedDot} aria-label="บันทึกแล้ว">✓</b> : null}
      </button>)}</div>
    </aside>

    <section className={`${styles.panel} ${styles.startPanel}`}>
      <button className={styles.start} disabled={running} onClick={start}><Icon name="play" />{running ? "กำลังทดสอบ…" : phase === "done" ? "ทดสอบอีกครั้ง" : "เริ่มทดสอบ"}</button>
      <p className={styles.hint} role="status"><span aria-hidden="true">★</span>{message}</p>
    </section>

    <section className={`${styles.panel} ${styles.results}`} aria-label="เลือกผลการสังเกต">
      <PanelTitle icon="chart">ผลการทดลอง <small>(ฉันสังเกตเห็นการยุบ…)</small></PanelTitle>
      <div className={styles.observations} role="group" aria-label="ฉันสังเกตเห็นการยุบ">
        {COMPRESSION_OBSERVATIONS.map((item) => <button key={item.id} aria-pressed={observation === item.id} disabled={phase !== "done"} onClick={() => { setObservation(item.id); onAnswer?.(material.id, item.id); setJustSaved(false); setMessage("เลือกผลแล้ว กดบันทึกผลการทดลอง"); }}>
          <span>{item.label}</span><div className={styles.sampleExample}><CompressionSampleArt material={material} observation={item.id} /></div><i aria-hidden="true">{observation === item.id ? "✓" : ""}</i>
        </button>)}
      </div>
    </section>

    <section className={`${styles.panel} ${styles.recordPanel}`}>
      <PanelTitle icon="save">บันทึกผล <small>{count}/{LAB_MATERIALS.length}</small></PanelTitle>
      <div className={styles.recordButtons}>
        <button onClick={record} disabled={phase !== "done" || !observation || justSaved}><Icon name="save" />{justSaved ? "✓ รับผลแล้ว" : "บันทึกผลการทดลอง"}</button>
        <button onClick={() => setShowRecords(true)}><Icon name="book" />ดูบันทึกผลการทดลอง</button>
      </div>
      <small className={styles.sessionNote}>{preview ? "ทดลองอิสระ · ไม่บันทึกเข้าทีม" : "บันทึกผลในภารกิจของทีม"}</small>
    </section>

    <dialog ref={recordsRef} className={styles.dialog} onCancel={() => setShowRecords(false)} onClose={() => setShowRecords(false)} aria-labelledby="press-record-title">
      <header><h2 id="press-record-title">บันทึกผลการทดลอง</h2><button autoFocus onClick={() => setShowRecords(false)} aria-label="ปิดบันทึก">×</button></header>
      <p>ความต้านทานแรงกดทับ · บันทึกแล้ว {count}/{LAB_MATERIALS.length} วัสดุ</p>
      <table><thead><tr><th>วัสดุ</th><th>ยุบ</th><th>ความหนาขณะกด</th><th>ผลจากข้อมูล</th><th>ผลที่เราสังเกต</th></tr></thead><tbody>{LAB_MATERIALS.map((item) => {
        const result = compressionMaterialResult(item);
        return <tr key={item.id}><td><img src={asset(`materials/${item.image}`)} alt="" />{item.name}</td><td>{formatCompressionMm(result.deformationMm)} มม.</td><td>{formatCompressionMm(result.loadedThicknessMm)} มม.</td><td>{compressionModelObservationLabel(item)}</td><td>{compressionObservationLabel(save.compressionResults[item.id])}</td></tr>;
      })}</tbody></table>
      <p className={styles.recordNote}>ค่าที่แสดงเป็นชุดข้อมูลอ้างอิงที่กำหนดให้ Simulation ภายใต้เงื่อนไขเดียวกัน เด็กยังบันทึกผลจากสิ่งที่ตนสังเกต{preview ? " · บันทึกเฉพาะรอบทดลองอิสระนี้" : ""}</p>
      <button className={styles.dialogDone} onClick={() => { setShowRecords(false); guard(onDone); }}>กลับไปเลือกห้องทดลอง</button>
    </dialog>
    <dialog ref={confirmRef} className={`${styles.dialog} ${styles.confirm}`} onCancel={() => setPendingAction(null)} aria-labelledby="press-confirm-title">
      <h2 id="press-confirm-title">ยังไม่ได้บันทึกผลครั้งนี้</h2><p>จะกลับไปบันทึกก่อน หรือออกจากการทดลองครั้งนี้?</p>
      <div><button autoFocus onClick={() => setPendingAction(null)}>กลับไปบันทึก</button><button onClick={() => { pendingAction?.(); setPendingAction(null); }}>ไปต่อโดยไม่บันทึก</button></div>
    </dialog>
  </div>;
}
