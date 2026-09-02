"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { GameSave, MaterialDefinition, WaterAbsorptionResult } from "./data";
import { LAB_MATERIALS } from "./labs";
import { ABSORPTION_STEP_MS, absorptionLevel, absorptionLevelLabel, absorptionStep, recordAbsorption, type AbsorptionPhase } from "./absorption";
import { LabIcon, type LabIconName } from "./LabIcon";
import base from "./CompressionLab.module.css";
import styles from "./AbsorptionLab.module.css";

const asset = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/${path}`;
const resultMap = (save: GameSave) => save.absorptionResults ?? {};

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
          <img src={asset(`materials/${material.image}`)} alt="" />
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
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState("เลือกวัสดุ แล้วกดเริ่มทดสอบ");
  const [showRecords, setShowRecords] = useState(false);
  const [pending, setPending] = useState<null | (() => void)>(null);
  const recordsDialog = useRef<HTMLDialogElement>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const running = phase !== "idle" && phase !== "done";
  const done = phase === "done";
  const dirty = done && !accepted;
  const amount = material.waterDrops[2];
  const level = absorptionLevel(amount);
  const count = LAB_MATERIALS.filter((item) => records[item.id]).length;

  useEffect(() => {
    if (!running) return;
    const next: Record<Exclude<AbsorptionPhase, "idle" | "done">, AbsorptionPhase> = {
      weighBefore: "wetting", wetting: "wiping", wiping: "weighAfter", weighAfter: "done",
    };
    const timer = window.setTimeout(() => {
      const nextPhase = next[phase as Exclude<AbsorptionPhase, "idle" | "done">];
      setPhase(nextPhase);
      if (nextPhase === "done") setMessage("ดูผลการดูดซับน้ำ แล้วกดบันทึกผลการทดลอง");
    }, ABSORPTION_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [phase, running]);
  useEffect(() => { if (showRecords) recordsDialog.current?.showModal(); else recordsDialog.current?.close(); }, [showRecords]);
  useEffect(() => { if (pending) confirmDialog.current?.showModal(); else confirmDialog.current?.close(); }, [pending]);

  const guard = (action: () => void) => { if (dirty) setPending(() => action); else action(); };
  const reset = () => { setPhase("idle"); setAccepted(false); };
  const selectMaterial = (nextIndex: number) => {
    if (running || nextIndex === index) return;
    guard(() => { reset(); onSave(records, nextIndex); setMessage("เลือกวัสดุแล้ว กดเริ่มทดสอบได้เลย"); });
  };
  const start = () => guard(() => { setAccepted(false); setPhase("weighBefore"); setMessage("กำลังทดลอง ทำตามขั้นตอนและสังเกตการเปลี่ยนแปลงนะ"); });
  const record = () => {
    if (!done || accepted) return;
    onSave({ ...records, [material.id]: recordAbsorption(material) }, index);
    setAccepted(true);
    setMessage(preview ? "บันทึกในรอบทดลองอิสระแล้ว · เลือกวัสดุถัดไปได้เลย" : "รับผลเข้าภารกิจแล้ว · ดูสถานะการบันทึกที่มุมจอ");
  };
  const step = absorptionStep(phase);
  const stepLabels = ["ชั่งก่อนสัมผัสน้ำ", "ให้น้ำสัมผัสผิวด้านเดียว", "ซับน้ำส่วนเกินบนผิว", "ชั่งหลังสัมผัสน้ำ"];

  return <div className={`screen ${base.screen} ${styles.screen}`}>
    <header className={base.header}>
      <div className={base.brand}><span><LabIcon name="flask" /></span><b>วิทยาศาสตร์ ป.2</b></div>
      <div className={`${base.heading} ${styles.heading}`}><h1>วัสดุดูดน้ำแค่ไหน?</h1><p>ห้องที่ 3 : การดูดซับน้ำของวัสดุ</p></div>
      <button className={base.home} onClick={() => guard(onDone)} disabled={running}><LabIcon name="home" />หน้าหลัก</button>
    </header>

    <aside className={`${base.panel} ${base.conditions}`}>
      <Title icon="scale">เงื่อนไขการทดลอง</Title>
      <p className={styles.sameCondition}>ทุกการทดลองใช้เงื่อนไขเดียวกัน</p>
      <div className={`${base.conditionList} ${styles.conditionsList}`}>
        <div><LabIcon name="size" /><p>ขนาดชิ้นทดสอบเท่ากัน</p></div>
        <div><LabIcon name="drop" /><p>ปริมาณน้ำเท่ากัน</p></div>
        <div><LabIcon name="surface" /><p>พื้นที่สัมผัสน้ำเท่ากัน</p></div>
        <div><LabIcon name="clock" /><p>เวลาสัมผัสน้ำเท่ากัน</p></div>
        <section><LabIcon name="surface" /><p>ชุดทดสอบการดูดซับน้ำ<small>แบบจำลองเพื่อการเรียนรู้ ป.2</small></p><b className={styles.check} aria-hidden="true">✓</b></section>
      </div>
    </aside>

    <section className={`${base.panel} ${base.experiment} ${styles.experiment}`} aria-label="ขั้นตอนการทดสอบการดูดซับน้ำ">
      <Title icon="flask">ขั้นตอนการทดลอง</Title>
      <div className={styles.demonstration}><ScaleStage material={material} phase={phase} /><div className={styles.stageCopy}>
        <h3>{stepLabels[step - 1]}</h3>
        <p>{step === 1 ? "วางชิ้นทดสอบบนเครื่องชั่งก่อนสัมผัสน้ำ" : step === 2 ? "หยดน้ำให้ทั่วพื้นที่ที่กำหนด โดยให้น้ำสัมผัสผิวด้านเดียว" : step === 3 ? "ซับเฉพาะน้ำส่วนเกินที่ยังค้างอยู่บนผิว" : "ชั่งอีกครั้งเพื่อดูปริมาณน้ำที่วัสดุดูดซับ"}</p>
      </div></div>
      <div className={styles.instruction}><LabIcon name="bulb" /><p>หยดน้ำให้ทั่วบริเวณที่กำหนด โดยให้น้ำสัมผัสผิวด้านเดียว</p></div>
    </section>

    <aside className={`${base.panel} ${base.materials}`}>
      <Title icon="layers">เลือกวัสดุ</Title>
      <div className={styles.materialGrid}>{LAB_MATERIALS.map((item, itemIndex) => <button key={item.id} aria-label={`เลือกวัสดุ ${item.name}`} aria-pressed={itemIndex === index} disabled={running} onClick={() => selectMaterial(itemIndex)}>
        <img src={asset(`materials/${item.image}`)} alt="" /><span>{item.name}</span>
        {itemIndex === index ? <b className={base.selectedCheck} aria-hidden="true">✓</b> : records[item.id] ? <b className={base.savedDot} aria-label="บันทึกแล้ว">✓</b> : null}
      </button>)}</div>
    </aside>

    <section className={`${base.panel} ${base.startPanel}`}>
      <button className={base.start} disabled={running} onClick={start}><LabIcon name="play" />{running ? "กำลังทดสอบ…" : done ? "ทดสอบอีกครั้ง" : "เริ่มทดสอบ"}</button>
      <p className={base.hint} role="status"><span aria-hidden="true">★</span>{message}</p>
    </section>

    <section className={`${base.panel} ${base.results} ${styles.results}`} aria-label="ผลการดูดซับน้ำ">
      <Title icon="chart">ผลการทดลอง <small>(จะแสดงหลังทดลอง)</small></Title>
      <p>น้ำที่วัสดุดูดซับได้</p>
      <div className={`${styles.meter} ${done ? styles.revealed : ""}`} aria-label={done ? `ระดับ${absorptionLevelLabel(recordAbsorption(material))}` : "รอผลการทดลอง"}>
        <div><i style={{ left: level === "low" ? "8%" : level === "medium" ? "50%" : "92%" }} /></div>
        <ol><li>น้อย</li><li>ปานกลาง</li><li>มาก</li></ol>
      </div>
      <small>{done ? `${amount} หน่วย · ${material.waterSummary}` : ""}</small>
    </section>

    <section className={`${base.panel} ${base.recordPanel}`}>
      <Title icon="save">บันทึกผล <small>{count}/{LAB_MATERIALS.length}</small></Title>
      <div className={base.recordButtons}>
        <button disabled={!done || accepted} onClick={record}><LabIcon name="save" />{accepted ? "✓ รับผลแล้ว" : "บันทึกผลการทดลอง"}</button>
        <button onClick={() => setShowRecords(true)}><LabIcon name="book" />ดูบันทึกผลการทดลอง</button>
      </div>
      <small className={base.sessionNote}>{preview ? "ทดลองอิสระ · ไม่บันทึกเข้าทีม" : "บันทึกผลในภารกิจของทีม"} · ผลจำลอง ไม่ใช่ผลทดสอบจริง</small>
    </section>

    <dialog ref={recordsDialog} className={base.dialog} onCancel={() => setShowRecords(false)} onClose={() => setShowRecords(false)} aria-labelledby="water-records-title">
      <header><h2 id="water-records-title">บันทึกผลการดูดซับน้ำ</h2><button autoFocus onClick={() => setShowRecords(false)} aria-label="ปิดบันทึก">×</button></header>
      <p>บันทึกแล้ว {count}/{LAB_MATERIALS.length} วัสดุ</p>
      <table><thead><tr><th>วัสดุ</th><th>ปริมาณจำลอง</th><th>ระดับการดูดซับ</th></tr></thead><tbody>{LAB_MATERIALS.map((item) => <tr key={item.id}><td><img src={asset(`materials/${item.image}`)} alt="" />{item.name}</td><td>{records[item.id] ? `${records[item.id].absorbed} หน่วย` : "—"}</td><td>{absorptionLevelLabel(records[item.id])}</td></tr>)}</tbody></table>
      <p className={base.recordNote}>ผลนี้เป็นค่าจากสถานการณ์จำลองเพื่อฝึกเปรียบเทียบ ไม่ใช่ค่าทดสอบวัสดุจริง{preview ? " · บันทึกเฉพาะรอบทดลองอิสระนี้" : ""}</p>
      <button className={base.dialogDone} onClick={() => { setShowRecords(false); guard(onDone); }}>กลับไปเลือกห้องทดลอง</button>
    </dialog>
    <dialog ref={confirmDialog} className={`${base.dialog} ${base.confirm}`} onCancel={() => setPending(null)} aria-labelledby="water-confirm-title">
      <h2 id="water-confirm-title">ยังไม่ได้บันทึกผลครั้งนี้</h2><p>จะกลับไปบันทึกก่อน หรือออกจากการทดลองครั้งนี้?</p><div><button autoFocus onClick={() => setPending(null)}>กลับไปบันทึก</button><button onClick={() => { pending?.(); setPending(null); }}>ไปต่อโดยไม่บันทึก</button></div>
    </dialog>
  </div>;
}
