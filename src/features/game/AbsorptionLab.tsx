"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { GameSave, MaterialDefinition, WaterAbsorptionResult } from "./data";
import { LAB_MATERIALS } from "./labs";
import { ABSORPTION_STEP_MS, absorptionLevelLabel, absorptionStep, recordAbsorption, type AbsorptionLevel, type AbsorptionPhase } from "./absorption";
import { LabIcon, type LabIconName } from "./LabIcon";
import { AbsorptionScale3D } from "./AbsorptionScale3D";
import base from "./CompressionLab.module.css";
import styles from "./AbsorptionLab.module.css";

const asset = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/${path}`;
const resultMap = (save: GameSave) => save.absorptionResults ?? {};
const ABSORPTION_CHOICES: { id: AbsorptionLevel; label: string; drops: string }[] = [
  { id: "low", label: "ดูดซับน้อย", drops: "💧" },
  { id: "medium", label: "ดูดซับปานกลาง", drops: "💧💧" },
  { id: "high", label: "ดูดซับมาก", drops: "💧💧💧" },
];

function Title({ icon, children }: { icon: LabIconName; children: ReactNode }) {
  return <h2 className={base.panelTitle}><LabIcon name={icon} />{children}</h2>;
}

function ScaleStage({ material, phase }: { material: MaterialDefinition; phase: AbsorptionPhase }) {
  const step = absorptionStep(phase);
  const wet = step >= 2;
  const wiping = phase === "wiping";
  const weighed = phase === "weighAfter" || phase === "done";
  const amount = material.waterDrops[2];
  return <div className={styles.scaleStage} role="img" aria-label={`ชุดทดสอบการดูดซับน้ำของ${material.name} ขั้นที่ ${step}`}>
    <div className={`${styles.waterDrop} ${phase === "wetting" ? styles.dropActive : ""}`} aria-hidden="true"><LabIcon name="drop" /></div>
    <div className={styles.scaleBody}>
      <div className={styles.scaleTop}>
        <div className={styles.scaleWell} />
        <div className={styles.sample} data-material={material.id}>
          <img src={asset(`compression/materials/${material.testFrames.idle}`)} alt="" />
          <i className={wet ? styles.wet : ""} style={{ opacity: wet ? Math.max(.18, amount / 10) : 0 }} />
          {wiping && <span className={styles.wipe} aria-hidden="true" />}
        </div>
      </div>
      <div className={styles.display}><span aria-hidden="true">–</span><b>{weighed ? amount : 0}</b><small>หน่วย</small></div>
    </div>
    <div className={styles.scaleFoot} />
  </div>;
}

export function AbsorptionLab({ save, onSave, onDone, preview = false }: {
  save: GameSave;
  onSave: (results: Record<string, WaterAbsorptionResult>, index: number) => void;
  onDone: () => void;
  preview?: boolean;
}) {
  const index = Math.max(0, Math.min(save.absorptionIndex ?? 0, LAB_MATERIALS.length - 1));
  const material = LAB_MATERIALS[index];
  const records = resultMap(save);
  const [phase, setPhase] = useState<AbsorptionPhase>("idle");
  const [observation, setObservation] = useState<AbsorptionLevel | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [showRecords, setShowRecords] = useState(false);
  const [showConditions, setShowConditions] = useState(false);
  const [pending, setPending] = useState<null | (() => void)>(null);
  const recordsDialog = useRef<HTMLDialogElement>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const running = phase !== "idle" && phase !== "done";
  const done = phase === "done";
  const dirty = done && !accepted;
  const count = LAB_MATERIALS.filter((item) => records[item.id]).length;
  const focusStep = running ? "experiment" : !done ? "material" : !observation ? "result" : !accepted ? "save" : "next";
  const nextMaterialIndex = LAB_MATERIALS.findIndex((item, itemIndex) => itemIndex !== index && !records[item.id]);

  useEffect(() => {
    if (!running) return;
    const next: Record<Exclude<AbsorptionPhase, "idle" | "done">, AbsorptionPhase> = {
      weighBefore: "wetting", wetting: "wiping", wiping: "weighAfter", weighAfter: "done",
    };
    const timer = window.setTimeout(() => {
      const nextPhase = next[phase as Exclude<AbsorptionPhase, "idle" | "done">];
      setPhase(nextPhase);
    }, ABSORPTION_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [phase, running]);
  useEffect(() => { if (showRecords) recordsDialog.current?.showModal(); else recordsDialog.current?.close(); }, [showRecords]);
  useEffect(() => { if (pending) confirmDialog.current?.showModal(); else confirmDialog.current?.close(); }, [pending]);

  const guard = (action: () => void) => { if (dirty) setPending(() => action); else action(); };
  const reset = () => { setPhase("idle"); setObservation(null); setAccepted(false); };
  const selectMaterial = (nextIndex: number) => {
    if (running || nextIndex === index) return;
    guard(() => { reset(); onSave(records, nextIndex); });
  };
  const start = () => guard(() => { setObservation(null); setAccepted(false); setPhase("weighBefore"); });
  const record = () => {
    if (!done || !observation || accepted) return;
    onSave({ ...records, [material.id]: recordAbsorption(material, observation) }, index);
    setAccepted(true);
  };
  const advance = () => {
    if (nextMaterialIndex >= 0) selectMaterial(nextMaterialIndex);
    else onDone();
  };
  const step = absorptionStep(phase);
  const stepLabels = ["ชั่งก่อนสัมผัสน้ำ", "ให้น้ำสัมผัสผิวด้านเดียว", "ซับน้ำส่วนเกินบนผิว", "ชั่งหลังสัมผัสน้ำ"];

  return <div className={`screen ${base.screen} ${styles.screen}`} data-focus={focusStep}>
    <header className={base.header}>
      <button className={base.home} onClick={() => guard(onDone)} disabled={running} aria-label="กลับไปหน้าเลือกห้องทดลอง"><LabIcon name="home" />กลับไปหน้าเลือกห้องทดลอง</button>
      <div className={base.heading}><h1>ห้องที่ 3 : การดูดซับน้ำของวัสดุ</h1><p>วัสดุดูดน้ำแค่ไหน?</p></div>
    </header>

    <aside id="absorption-conditions" data-collapsed={!showConditions} className={`${base.panel} ${base.conditions}`}>
      <Title icon="scale">เงื่อนไขการทดลอง</Title>
      <p className={base.conditionSummary}><LabIcon name="scale" /><b>เงื่อนไขเหมือนกันทุกวัสดุ</b><span>ขนาด ปริมาณน้ำ พื้นที่และเวลาสัมผัสเท่ากัน</span></p>
      <div className={`${base.conditionList} ${styles.conditionsList}`}>
        <div><LabIcon name="size" /><p>ชิ้นวัสดุ<small>ขนาดเท่ากัน<br />วางด้านเดียวกัน</small></p></div>
        <div><LabIcon name="drop" /><p>ปริมาณน้ำ<small>ปริมาณเท่ากัน<br />ทุกการทดลอง</small></p></div>
        <div><LabIcon name="surface" /><p>พื้นที่สัมผัสน้ำ<small>พื้นที่เท่ากัน<br />สัมผัสเพียงด้านเดียว</small></p></div>
        <div><LabIcon name="clock" /><p>เวลาสัมผัสน้ำ<small>ระยะเวลาเท่ากัน<br />ระบบควบคุมอัตโนมัติ</small></p></div>
        <section><LabIcon name="surface" /><p>สังเกตการดูดซับ<small>ชั่งก่อนและหลัง<br />สัมผัสน้ำ</small></p></section>
      </div>
    </aside>

    <section className={`${base.panel} ${base.experiment} ${styles.experiment}`} aria-label="ขั้นตอนการทดสอบการดูดซับน้ำ">
      <Title icon="flask">การทดลอง</Title>
      <AbsorptionScale3D material={material} phase={phase}>
        <div className={styles.demonstration}><ScaleStage material={material} phase={phase} /><div className={styles.stageCopy}>
          <h3>{stepLabels[step - 1]}</h3>
          <p>{step === 1 ? "วางชิ้นทดสอบบนเครื่องชั่งก่อนสัมผัสน้ำ" : step === 2 ? "หยดน้ำให้ทั่วพื้นที่ที่กำหนด โดยให้น้ำสัมผัสผิวด้านเดียว" : step === 3 ? "ซับเฉพาะน้ำส่วนเกินที่ยังค้างอยู่บนผิว" : "ชั่งอีกครั้งเพื่อดูปริมาณน้ำที่วัสดุดูดซับ"}</p>
        </div></div>
      </AbsorptionScale3D>
    </section>

    <aside className={`${base.panel} ${base.materials}`}>
      <Title icon="layers">เลือกวัสดุ</Title>
      <div className={base.materialList}>{LAB_MATERIALS.map((item, itemIndex) => <button key={item.id} aria-label={`เลือกวัสดุ ${item.name}`} aria-pressed={itemIndex === index} disabled={running} onClick={() => selectMaterial(itemIndex)}>
        <img src={asset(`materials/${item.image}`)} alt="" /><span>{item.name}</span>
        {itemIndex === index ? <b className={base.selectedCheck} aria-hidden="true">✓</b> : records[item.id] ? <b className={base.savedDot} aria-label="บันทึกแล้ว">✓</b> : null}
      </button>)}</div>
    </aside>

    <section className={`${base.panel} ${base.startPanel}`}>
      <button className={base.start} disabled={running} onClick={start}><LabIcon name="play" />{running ? "กำลังทดสอบ…" : done ? "ทดสอบอีกครั้ง" : "เริ่มทดสอบ"}</button>
      <button className={base.conditionToggle} type="button" aria-expanded={showConditions} aria-controls="absorption-conditions" onClick={() => setShowConditions((visible) => !visible)}><LabIcon name="scale" />{showConditions ? "ซ่อนเงื่อนไข" : "ดูเงื่อนไข"}</button>
    </section>

    <section className={`${base.panel} ${base.results} ${styles.results}`} aria-label="ผลการดูดซับน้ำ">
      <Title icon="chart">ผลการทดลอง <small>(เลือกสิ่งที่สังเกตเห็น)</small></Title>
      {!done ? <div className={base.resultPlaceholder} role="status"><span aria-hidden="true">3</span><b>{running ? "กำลังทดลอง…" : "ทดลองวัสดุก่อน"}</b><small>เมื่อทดลองเสร็จ คำตอบจะปรากฏตรงนี้</small></div> : <>
        <p>วัสดุดูดซับน้ำระดับใด?</p>
        <div className={styles.absorptionChoices} role="group" aria-label="ระดับการดูดซับน้ำที่สังเกตเห็น">
          {ABSORPTION_CHOICES.map((choice) => <button key={choice.id} aria-pressed={observation === choice.id} onClick={() => { setObservation(choice.id); setAccepted(false); }}><i aria-hidden="true">{observation === choice.id ? "✓" : ""}</i><span aria-hidden="true">{choice.drops}</span><b>{choice.label}</b></button>)}
        </div>
        {accepted && <p className={base.feedback} role="status">✓ บันทึกคำตอบแล้ว</p>}
      </>}
    </section>

    <section className={`${base.panel} ${base.recordPanel}`}>
      <div className={base.recordButtons}>
        <button data-saved={accepted} disabled={!accepted && (!done || !observation)} onClick={accepted ? advance : record}><LabIcon name={accepted ? "play" : "save"} />{accepted ? (nextMaterialIndex >= 0 ? "ทดลองวัสดุถัดไป" : "กลับไปเลือกห้องทดลอง") : done && !observation ? "เลือกผลก่อน" : "บันทึกผลการทดลอง"}</button>
        <button onClick={() => setShowRecords(true)}><LabIcon name="book" />ดูตารางผลการทดลอง</button>
      </div>
    </section>

    <dialog ref={recordsDialog} className={base.dialog} onCancel={() => setShowRecords(false)} onClose={() => setShowRecords(false)} aria-labelledby="water-records-title">
      <header><h2 id="water-records-title">บันทึกผลการดูดซับน้ำ</h2><button autoFocus onClick={() => setShowRecords(false)} aria-label="ปิดบันทึก">×</button></header>
      <p>บันทึกแล้ว {count}/{LAB_MATERIALS.length} วัสดุ</p>
      <table><thead><tr><th>วัสดุ</th><th>ผลที่สังเกต</th><th>ข้อมูลแบบจำลอง</th></tr></thead><tbody>{LAB_MATERIALS.map((item) => <tr key={item.id} className={!records[item.id] ? base.missingRecord : undefined}><td><img src={asset(`materials/${item.image}`)} alt="" />{item.name}</td><td>{records[item.id] ? records[item.id].observation ? ABSORPTION_CHOICES.find((choice) => choice.id === records[item.id].observation)?.label : absorptionLevelLabel(records[item.id]) : "ยังไม่บันทึก"}</td><td>{records[item.id] ? `${records[item.id].absorbed} หน่วย · ${absorptionLevelLabel(records[item.id])}` : "—"}</td></tr>)}</tbody></table>
      <p className={base.recordNote}>ผลนี้เป็นค่าจากสถานการณ์จำลองเพื่อฝึกเปรียบเทียบ ไม่ใช่ค่าทดสอบวัสดุจริง{preview ? " · บันทึกเฉพาะรอบทดลองอิสระนี้" : ""}</p>
      <button className={base.dialogDone} onClick={() => { setShowRecords(false); guard(onDone); }}>กลับไปเลือกห้องทดลอง</button>
    </dialog>
    <dialog ref={confirmDialog} className={`${base.dialog} ${base.confirm}`} onCancel={() => setPending(null)} aria-labelledby="water-confirm-title">
      <h2 id="water-confirm-title">ยังไม่ได้บันทึกผลครั้งนี้</h2><p>จะกลับไปบันทึกก่อน หรือออกจากการทดลองครั้งนี้?</p><div><button autoFocus onClick={() => setPending(null)}>กลับไปบันทึก</button><button onClick={() => { pending?.(); setPending(null); }}>ไปต่อโดยไม่บันทึก</button></div>
    </dialog>
  </div>;
}
