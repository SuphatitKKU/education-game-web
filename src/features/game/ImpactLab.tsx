"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { GameSave, ImpactDamage, ImpactResult, MaterialDefinition } from "./data";
import { LAB_MATERIALS } from "./labs";
import { IMPACT_DROP_MS, IMPACT_SETTLE_MS, IMPACT_OBSERVATIONS, impactDamageFor, impactObservationLabel, recordImpact, type ImpactPhase } from "./impact";
import { LabIcon, type LabIconName } from "./LabIcon";
import { ImpactEgg } from "./ImpactEgg";
import base from "./CompressionLab.module.css";
import styles from "./ImpactLab.module.css";

const asset = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/${path}`;
const resultMap = (save: GameSave) => save.impactResults ?? {};
function Title({ icon, children }: { icon: LabIconName; children: ReactNode }) {
  return <h2 className={base.panelTitle}><LabIcon name={icon} />{children}</h2>;
}

function DropRig({ material, phase }: { material: MaterialDefinition; phase: ImpactPhase }) {
  const id = useId().replace(/:/g, "");
  const hit = phase === "settling" || phase === "done";
  const lowered = phase !== "idle" && phase !== "preparing";
  return <div className={styles.rig}>
    <svg viewBox="0 0 425 395" role="img" aria-label={`เครื่องปล่อยไข่จำลองลงบน${material.name}${hit ? " หลังตกกระแทก" : ""}`}>
      <defs>
        <linearGradient id={`${id}-metal`}><stop stopColor="#8796a3" /><stop offset=".42" stopColor="#e5ebf0" /><stop offset=".65" stopColor="#bac4cc" /><stop offset="1" stopColor="#6c7d8b" /></linearGradient>
        <linearGradient id={`${id}-beam`} x1="0" x2="0" y1="0" y2="1"><stop stopColor="#bed3f2" /><stop offset=".75" stopColor="#7899c3" /><stop offset="1" stopColor="#526f96" /></linearGradient>
      </defs>
      <ellipse cx="144" cy="372" rx="126" ry="10" fill="#dce3ec" />
      <path d="M21 340h244v26H21Z" fill={`url(#${id}-metal)`} stroke="#7a8793" strokeWidth="2" />
      <path d="m21 340 20-21h203l21 21Z" fill="#d0d8df" stroke="#8899a6" />
      {[37, 232].map((x) => <g key={x}><rect x={x} y="42" width="17" height="284" rx="5" fill={`url(#${id}-metal)`} stroke="#7c8d9d" /><ellipse cx={x+8.5} cy="326" rx="9" ry="5" fill="#718596" /><circle cx={x+8.5} cy="325" r="3" fill="#475d72" /></g>)}
      <rect x="24" y="23" width="245" height="29" rx="6" fill={`url(#${id}-beam)`} stroke="#5e789a" strokeWidth="2" />
      <path d="M29 28h233" stroke="#e3eeff" strokeWidth="2" />
      <rect x="139" y="53" width="14" height="28" fill={`url(#${id}-metal)`} stroke="#8595a2" />
      <rect x="118" y="78" width="56" height="39" rx="7" fill={`url(#${id}-metal)`} stroke="#7c8b99" />
      <path d="M120 110h15m25 0h13" stroke="#475e74" strokeWidth="2" />
      <path d="M146 182v54" stroke="#68a1ff" strokeWidth="2" strokeDasharray="6 5" /><path d="m140 230 6 9 6-9" fill="none" stroke="#68a1ff" strokeWidth="2" />
      <path d="M183 119h81M184 311h81" stroke="#6ca0fa" strokeWidth="1.3" strokeDasharray="4 3" />
      <g className={styles.callout} fill="#293e80"><text x="274" y="117">ปล่อยไข่จำลอง</text><text x="274" y="137">จากความสูงเท่ากัน</text><text x="274" y="307">ชิ้นวัสดุที่เลือกใช้</text></g>
      <path d="m60 326 18-20h136l20 20Z" fill={material.id === "corrugated_cardboard" ? "#e9ba78" : material.id === "pe_sheet" ? "#d4edff" : "#e5e9ed"} stroke="#a4a8a9" />
      <image href={asset(`compression/materials/${material.testFrames.idle}`)} x="56" y="320" width="184" height="21" preserveAspectRatio="none" />
      <g className={styles.fallingEgg} style={{ transform: `translateY(${lowered ? 139 : 0}px)`, transitionDuration: phase === "dropping" ? `${IMPACT_DROP_MS}ms` : "0ms" }}>
        <foreignObject x="116" y="114" width="62" height="77"><ImpactEgg damage={hit ? impactDamageFor(material.id) : "none"} /></foreignObject>
      </g>
      {hit && <g stroke="#7baaff" strokeWidth="2.4" strokeLinecap="round"><path d="m98 293-8-9m5 21-12-1m111-11 8-9m-5 21 12-1" /></g>}
    </svg>
  </div>;
}

export function ImpactLab({ save, onSave, onAnswer, onDone, preview = false }: {
  save: GameSave; onSave: (results: Record<string, ImpactResult>, index: number) => void; onDone: () => void; preview?: boolean;
  onAnswer?: (materialId: string, answer: string) => void;
}) {
  const index = Math.max(0, Math.min(save.impactIndex ?? 0, LAB_MATERIALS.length - 1));
  const material = LAB_MATERIALS[index];
  const records = resultMap(save);
  const [phase, setPhase] = useState<ImpactPhase>("idle");
  const [observation, setObservation] = useState<ImpactDamage | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState("กดปุ่มเริ่มทดลอง เพื่อดูการตกกระแทก");
  const [showRecords, setShowRecords] = useState(false);
  const [pending, setPending] = useState<null | (() => void)>(null);
  const recordsDialog = useRef<HTMLDialogElement>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const running = phase === "preparing" || phase === "dropping" || phase === "settling";
  const done = phase === "done";
  const hit = done || phase === "settling";
  const dirty = done && !accepted;
  const count = LAB_MATERIALS.filter((item) => records[item.id]).length;

  useEffect(() => {
    if (phase !== "preparing" && phase !== "dropping" && phase !== "settling") return;
    const timer = window.setTimeout(() => {
      if (phase === "preparing") setPhase("dropping");
      else if (phase === "dropping") setPhase("settling");
      else { setPhase("done"); setMessage("สังเกตสิ่งของหลังตก แล้วเลือกผลที่เห็น"); }
    }, phase === "preparing" ? 100 : phase === "dropping" ? IMPACT_DROP_MS : IMPACT_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);
  useEffect(() => { if (showRecords) recordsDialog.current?.showModal(); else recordsDialog.current?.close(); }, [showRecords]);
  useEffect(() => { if (pending) confirmDialog.current?.showModal(); else confirmDialog.current?.close(); }, [pending]);
  const guard = (action: () => void) => { if (dirty) setPending(() => action); else action(); };
  const reset = () => { setPhase("idle"); setObservation(null); setAccepted(false); };
  const select = (nextIndex: number) => {
    if (running || nextIndex === index) return;
    guard(() => { reset(); onSave(records, nextIndex); setMessage("เลือกวัสดุแล้ว กดเริ่มทดลองได้เลย"); });
  };
  const start = () => guard(() => { setPhase("preparing"); setObservation(null); setAccepted(false); setMessage("กำลังปล่อยไข่จำลอง สังเกตการกระแทกนะ"); });
  const record = () => {
    if (!done || !observation || accepted) return;
    onSave({ ...records, [material.id]: recordImpact(material.id, observation) }, index);
    setAccepted(true);
    setMessage(preview ? "บันทึกในรอบทดลองอิสระแล้ว เลือกวัสดุถัดไปได้" : "รับผลเข้าภารกิจแล้ว ดูสถานะการบันทึกที่มุมจอ");
  };

  return <div className={`screen ${base.screen} ${styles.screen}`}>
    <header className={base.header}>
      <div className={base.brand}><span><LabIcon name="flask" /></span><b>วิทยาศาสตร์ ป.2</b></div>
      <div className={`${base.heading} ${styles.heading}`}><h1>กระแทกแล้ว ของเสียหายไหม?</h1><p>ห้องที่ 2 : ความสามารถในการลดความเสียหายจากแรงกระแทก</p></div>
      <button className={base.home} onClick={() => guard(onDone)} disabled={running}><LabIcon name="home" />เลือกห้อง</button>
    </header>

    <aside className={base.panel}>
      <Title icon="scale">เงื่อนไขการทดลอง</Title>
      <div className={`${base.conditionList} ${styles.conditions}`}>
        <div><ImpactEgg /><p>สิ่งของเหมือนกัน</p></div>
        <div><LabIcon name="height" /><p>ความสูงเท่ากัน</p></div>
        <div><LabIcon name="size" /><p>ชิ้นวัสดุขนาดเท่ากัน</p></div>
        <section><LabIcon name="flask" /><p>เครื่องทดสอบแรงกระแทก<small>แบบจำลองเพื่อการเรียนรู้ ป.2</small></p><b className={styles.check} aria-hidden="true">✓</b></section>
      </div>
    </aside>

    <section className={`${base.panel} ${base.experiment} ${styles.experiment}`} aria-label="ทดลองปล่อยสิ่งของจำลอง">
      <Title icon="flask">ขั้นทดลอง</Title>
      <div className={styles.demonstration}>
        <DropRig material={material} phase={phase} />
        <div className={styles.comparison}>
          <h3>สิ่งของจำลอง (ไข่)</h3>
          <figure><figcaption>ก่อนกระแทก</figcaption><ImpactEgg label="ไข่จำลองก่อนกระแทก ไม่เสียหาย" /></figure>
          <span className={styles.downArrow} aria-hidden="true">⬇</span>
          <figure><figcaption>หลังกระแทก</figcaption>{hit ? <ImpactEgg damage={impactDamageFor(material.id)} label="สภาพไข่จำลองหลังกระแทก" /> : <div className={styles.waiting}><span>?</span><small>{running ? "กำลังทดลอง…" : "รอเริ่มทดลอง"}</small></div>}</figure>
        </div>
      </div>
      <div className={styles.instruction}><LabIcon name="bulb" /><p>เลือกวัสดุรองรับ แล้วทดสอบการตกกระแทก<br />สังเกตและบันทึกสภาพของสิ่งของจำลอง</p></div>
    </section>

    <aside className={`${base.panel} ${base.materials}`}>
      <Title icon="layers">เลือกวัสดุ</Title>
      <div className={styles.materialGrid}>{LAB_MATERIALS.map((item, i) => <button key={item.id} aria-label={`เลือกวัสดุ ${item.name}`} aria-pressed={i === index} disabled={running} onClick={() => select(i)}>
        <img src={asset(`materials/${item.image}`)} alt="" /><span>{item.name}</span>
        {i === index ? <b className={base.selectedCheck} aria-hidden="true">✓</b> : records[item.id] ? <b className={base.savedDot} aria-label="บันทึกแล้ว">✓</b> : null}
      </button>)}</div>
    </aside>

    <section className={`${base.panel} ${base.startPanel}`}>
      <button className={base.start} disabled={running} onClick={start}><LabIcon name="play" />{running ? "กำลังทดลอง…" : done ? "ทดลองอีกครั้ง" : "เริ่มทดลอง"}</button>
      <p className={base.hint} role="status"><span aria-hidden="true">★</span>{message}</p>
    </section>

    <section className={`${base.panel} ${base.results} ${styles.results}`} aria-label="บันทึกสิ่งที่สังเกตได้">
      <Title icon="chart">ผลการทดลอง <small>(บันทึกสิ่งที่สังเกตได้)</small></Title>
      <p className={styles.resultQuestion}>สิ่งของจำลองมีสภาพอย่างไร?</p>
      <div className={styles.observations} role="group" aria-label="สภาพของสิ่งของจำลอง">
        {IMPACT_OBSERVATIONS.map((item) => <button key={item.id} aria-pressed={observation === item.id} disabled={!done} onClick={() => { setObservation(item.id); onAnswer?.(material.id, item.id); setAccepted(false); setMessage("เลือกผลแล้ว กดบันทึกผลการทดลอง"); }}>
          <i aria-hidden="true">{observation === item.id ? "✓" : ""}</i><span>{item.label}</span><ImpactEgg damage={item.id} />
        </button>)}
      </div>
    </section>

    <section className={`${base.panel} ${base.recordPanel}`}>
      <Title icon="save">บันทึกผล <small>{count}/5</small></Title>
      <div className={base.recordButtons}>
        <button disabled={!done || !observation || accepted} onClick={record}><LabIcon name="save" />{accepted ? "✓ รับผลแล้ว" : "บันทึกผลการทดลอง"}</button>
        <button onClick={() => setShowRecords(true)}><LabIcon name="book" />ดูบันทึกผลการทดลอง</button>
      </div>
      <small className={base.sessionNote}>{preview ? "ทดลองอิสระ · ไม่บันทึกเข้าทีม" : "บันทึกผลในภารกิจของทีม"} · ผลจำลอง ไม่ใช่ผลทดสอบจริง</small>
    </section>

    <dialog ref={recordsDialog} className={base.dialog} onCancel={() => setShowRecords(false)} onClose={() => setShowRecords(false)} aria-labelledby="impact-records-title">
      <header><h2 id="impact-records-title">บันทึกผลแรงกระแทก</h2><button autoFocus onClick={() => setShowRecords(false)} aria-label="ปิดบันทึก">×</button></header>
      <p>สภาพสิ่งของจำลองหลังตกกระแทก · บันทึกแล้ว {count}/5 วัสดุ</p>
      <table><thead><tr><th>วัสดุรองรับ</th><th>ผลที่เราสังเกต</th></tr></thead><tbody>{LAB_MATERIALS.map((item) => <tr key={item.id}><td><img src={asset(`materials/${item.image}`)} alt="" />{item.name}</td><td>{impactObservationLabel(records[item.id])}</td></tr>)}</tbody></table>
      <p className={base.recordNote}>เป็นคำตอบจากการสังเกตสถานการณ์จำลอง ไม่ใช่ค่าทดสอบหรือการจัดอันดับวัสดุจริง{preview ? " · เก็บเฉพาะรอบทดลองอิสระนี้" : ""}</p>
      <button className={base.dialogDone} onClick={() => { setShowRecords(false); guard(onDone); }}>กลับไปเลือกห้องทดลอง</button>
    </dialog>
    <dialog ref={confirmDialog} className={`${base.dialog} ${base.confirm}`} onCancel={() => setPending(null)} aria-labelledby="impact-confirm-title">
      <h2 id="impact-confirm-title">ยังไม่ได้บันทึกผลครั้งนี้</h2><p>จะกลับไปบันทึกก่อน หรือออกจากการทดลองครั้งนี้?</p><div><button autoFocus onClick={() => setPending(null)}>กลับไปบันทึก</button><button onClick={() => { pending?.(); setPending(null); }}>ไปต่อโดยไม่บันทึก</button></div>
    </dialog>
  </div>;
}
