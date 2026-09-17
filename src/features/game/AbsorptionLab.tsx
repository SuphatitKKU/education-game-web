"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { AbsorptionLevel, GameSave, MaterialDefinition, WaterAbsorptionResult } from "./data";
import { LAB_MATERIALS } from "./labs";
import { ABSORPTION_DURATION_MS, absorptionPhaseDuration, absorptionProgress, observationLabel, recordAbsorption, type AbsorptionPhase } from "./absorption";
import { LabIcon, type LabIconName } from "./LabIcon";
import { AbsorptionScale3D } from "./AbsorptionScale3D";
import base from "./CompressionLab.module.css";
import styles from "./AbsorptionLab.module.css";

const asset = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/${path}`;
const resultMap = (save: GameSave) => save.absorptionResults ?? {};
const ABSORPTION_CHOICES: { id: AbsorptionLevel; label: string; visual: string }[] = [
  { id: "none", label: "ไม่ดูดซับ", visual: "น้ำสีไม่ไต่ขึ้น" },
  { id: "low", label: "ดูดซับน้อย", visual: "รอยเปียกขึ้นเล็กน้อย" },
  { id: "high", label: "ดูดซับมาก", visual: "รอยเปียกขึ้นสูง" },
];

function Title({ icon, children }: { icon: LabIconName; children: ReactNode }) {
  return <h2 className={base.panelTitle}><LabIcon name={icon} />{children}</h2>;
}

function shortMaterialName(material: MaterialDefinition) {
  if (material.id === "corrugated_cardboard") return "กระดาษลูกฟูก";
  if (material.id === "cardboard") return "กระดาษหน้าขาว";
  if (material.id === "bubble_wrap") return "พลาสติกฟองอากาศ";
  return material.name;
}

function formatElapsed(ms: number) {
  return (Math.max(0, Math.min(ms, ABSORPTION_DURATION_MS)) / 1000).toFixed(1);
}

function StripComparisonStage({ materials, phase, focusedMaterialId, elapsedMs }: { materials: MaterialDefinition[]; phase: AbsorptionPhase; focusedMaterialId: string | null; elapsedMs: number }) {
  const visibleWet = phase === "holding" || phase === "done";
  const wetProgress = phase === "done" ? 1 : phase === "holding" ? absorptionProgress(elapsedMs) : 0;
  const phaseLabel = phase === "idle" ? "พร้อมจุ่ม" : phase === "prepare" ? "เตรียมแถบวัสดุ" : phase === "immersing" ? "จุ่มพร้อมกัน" : phase === "holding" ? "จับเวลา 30 วินาที" : "สังเกตรอยเปียก";
  return <div className={styles.comparisonStage} role="img" aria-label={`การทดลองน้ำสีของวัสดุทั้ง ${materials.length} ชนิด`}>
    <div className={styles.comparisonCups}>
      {materials.map((material) => {
        const wetRise = Math.min(100, Math.max(0, material.waterRiseCm / 10 * 100));
        const style = {
          "--wet-rise": `${wetRise * wetProgress}%`,
          "--strip-color": material.id === "bubble_wrap" ? "#b9dff0" : material.id === "pe_sheet" ? "#dce8ed" : "#d8b487",
          "--strip-lift": material.id === focusedMaterialId ? "-.55cqw" : "0cqw",
        } as CSSProperties;
        return <figure key={material.id} className={styles.comparisonItem}>
          <div className={styles.comparisonCup}>
            <div className={styles.comparisonWater} />
            <div className={styles.comparisonStrip} style={style}>
              <img src={asset(`compression/materials/${material.testFrames.idle}`)} alt="" />
              <i className={visibleWet && material.waterRiseCm > 0 ? styles.stripWet : ""} />
            </div>
          </div>
          <figcaption>{shortMaterialName(material)}</figcaption>
        </figure>;
      })}
    </div>
    <div className={styles.stripStageLegend}>
      <b>{phaseLabel}</b>
      <span>{phase === "done" ? "เปรียบเทียบความสูงของรอยเปียกที่เห็น" : "จุ่มแถบวัสดุทุกชิ้นพร้อมกัน แล้วสังเกตน้ำสี"}</span>
    </div>
  </div>;
}

export function AbsorptionLab({ save, onSave, onDone }: {
  save: GameSave;
  onSave: (results: Record<string, WaterAbsorptionResult>, index: number) => void;
  onDone: () => void;
}) {
  const records = resultMap(save);
  const [phase, setPhase] = useState<AbsorptionPhase>("idle");
  const [observations, setObservations] = useState<Record<string, AbsorptionLevel>>({});
  const [focusedMaterialId, setFocusedMaterialId] = useState<string | null>(LAB_MATERIALS[Math.max(0, Math.min(save.absorptionIndex, LAB_MATERIALS.length - 1))]?.id ?? null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [showRecords, setShowRecords] = useState(false);
  const [showConditions, setShowConditions] = useState(false);
  const [pending, setPending] = useState<null | (() => void)>(null);
  const recordsDialog = useRef<HTMLDialogElement>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const timerStartedAtRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const running = phase !== "idle" && phase !== "done";
  const done = phase === "done";
  const dirty = done && !accepted;
  const count = LAB_MATERIALS.filter((item) => records[item.id]).length;
  const observedCount = LAB_MATERIALS.filter((item) => observations[item.id]).length;
  const allObserved = observedCount === LAB_MATERIALS.length;
  const focusStep = running ? "experiment" : !done ? "experiment" : !allObserved ? "result" : !accepted ? "save" : "next";

  useEffect(() => {
    if (!running) return;
    const next: Record<Exclude<AbsorptionPhase, "idle" | "done">, AbsorptionPhase> = {
      prepare: "immersing", immersing: "holding", holding: "done",
    };
    const timer = window.setTimeout(() => setPhase(next[phase as Exclude<AbsorptionPhase, "idle" | "done">]), absorptionPhaseDuration(phase));
    return () => window.clearTimeout(timer);
  }, [phase, running]);
  useEffect(() => {
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (phase === "done") {
      timerStartedAtRef.current = null;
      setElapsedMs(ABSORPTION_DURATION_MS);
      return;
    }
    if (phase !== "holding") {
      timerStartedAtRef.current = null;
      setElapsedMs(0);
      return;
    }
    timerStartedAtRef.current = performance.now();
    const tick = () => {
      if (timerStartedAtRef.current !== null) setElapsedMs(Math.min(ABSORPTION_DURATION_MS, performance.now() - timerStartedAtRef.current));
    };
    tick();
    // Update more often than the displayed tenth of a second so the fallback
    // wet front also moves smoothly instead of appearing in visible steps.
    timerIntervalRef.current = window.setInterval(tick, 50);
    return () => {
      if (timerIntervalRef.current !== null) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [phase]);
  useEffect(() => { if (showRecords) recordsDialog.current?.showModal(); else recordsDialog.current?.close(); }, [showRecords]);
  useEffect(() => { if (pending) confirmDialog.current?.showModal(); else confirmDialog.current?.close(); }, [pending]);

  const guard = (action: () => void) => { if (dirty) setPending(() => action); else action(); };
  const start = () => guard(() => { setObservations({}); setAccepted(false); setFocusedMaterialId(null); setElapsedMs(0); setPhase("prepare"); });
  const selectMaterial = (materialId: string) => {
    if (running) return;
    setFocusedMaterialId(materialId);
  };
  const chooseObservation = (materialId: string, level: AbsorptionLevel) => {
    if (!done || accepted) return;
    setObservations((current) => ({ ...current, [materialId]: level }));
  };
  const record = () => {
    if (!done || !allObserved || accepted) return;
    const nextRecords = { ...records };
    for (const material of LAB_MATERIALS) nextRecords[material.id] = recordAbsorption(material, observations[material.id]);
    onSave(nextRecords, 0);
    setAccepted(true);
  };

  return <div className={`screen ${base.screen} ${styles.screen}`} data-focus={focusStep}>
    <header className={base.header}>
      <button className={base.home} onClick={() => guard(onDone)} disabled={running} aria-label="กลับไปหน้าเลือกห้องทดลอง"><LabIcon name="home" />กลับไปหน้าเลือกห้องทดลอง</button>
      <div className={base.heading}><h1>ห้องทดลองที่ 3 : การดูดซับน้ำของวัสดุ</h1><p>วัสดุใดบ้างดูดซับน้ำน้อย?</p></div>
    </header>

    <aside id="absorption-conditions" data-collapsed={!showConditions} className={`${base.panel} ${base.conditions}`}>
      <Title icon="scale">เงื่อนไขการทดลอง</Title>
      <p className={base.conditionSummary}><LabIcon name="scale" /><b>ควบคุมให้เหมือนกันทุกวัสดุ</b><span>จุ่มพร้อมกัน แล้วดูรอยเปียก</span></p>
      <div className={`${base.conditionList} ${styles.conditionsList}`}>
        <div><LabIcon name="size" /><p>ขนาดชิ้นวัสดุ<small>กว้าง 2 ซม.<br />ยาว 10 ซม.</small></p></div>
      <div><LabIcon name="drop" /><p>ปริมาณน้ำสี<small>เท่ากันทุกแก้ว<br />ใช้ภาชนะเหมือนกัน</small></p></div>
        <div><LabIcon name="surface" /><p>ระดับการจุ่ม<small>ปลายแถบแตะน้ำ<br />ลึกเท่ากัน</small></p></div>
        <div><LabIcon name="clock" /><p>เวลาสัมผัส<small>เริ่มพร้อมกัน<br />30 วินาที</small></p></div>
        <section><LabIcon name="surface" /><p>หลักฐาน<small>รอยเปียกและ<br />ระดับน้ำสีที่ซึมขึ้น</small></p></section>
      </div>
    </aside>

    <section className={`${base.panel} ${base.experiment} ${styles.experiment}`} aria-label="ขั้นตอนการทดสอบการดูดซับน้ำ">
      <Title icon="flask">การทดลองพร้อมกันทั้ง 5 วัสดุ</Title>
      <AbsorptionScale3D materials={LAB_MATERIALS} phase={phase} focusedMaterialId={focusedMaterialId}>
        <div className={styles.demonstration}><StripComparisonStage materials={LAB_MATERIALS} phase={phase} focusedMaterialId={focusedMaterialId} elapsedMs={elapsedMs} /><div className={styles.stageCopy}>
          <h3>{phase === "idle" ? "เตรียมการทดลอง" : phase === "prepare" ? "เตรียมแถบวัสดุขนาดเท่ากัน" : phase === "immersing" ? "จุ่มปลายแถบลงในน้ำสี" : phase === "holding" ? "รอพร้อมกัน 30 วินาที" : "สังเกตรอยเปียกและระดับน้ำสี"}</h3>
          <p>{phase === "idle" ? "กดเริ่มทดลองเพื่อจุ่มวัสดุทั้ง 5 ชนิดพร้อมกัน" : phase === "prepare" ? "เตรียมน้ำสีและแถบวัสดุให้มีขนาดเท่ากัน" : phase === "immersing" ? "จุ่มปลายแถบวัสดุทั้ง 5 ชิ้นลงพร้อมกัน" : phase === "holding" ? "จับเวลาพร้อมกัน แล้วดูน้ำสีค่อย ๆ ซึมขึ้น" : "เปรียบเทียบความสูงของรอยเปียกที่เห็น"}</p>
        </div></div>
      </AbsorptionScale3D>
      <div className={base.experimentMeasurements} role="status" aria-live="polite">
        <div className={base.digitalStopwatch} role="timer" aria-label={`เวลาทดลอง ${formatElapsed(elapsedMs)} วินาที จาก 30 วินาที`}>
          <strong>{formatElapsed(elapsedMs)}</strong><small>วินาที</small>
        </div>
      </div>
      <div className={base.progressTrack} aria-hidden="true"><i style={{ width: `${Math.min(100, elapsedMs / ABSORPTION_DURATION_MS * 100)}%` }} /></div>
    </section>

    <aside className={`${base.panel} ${base.materials}`}>
      <Title icon="layers">วัสดุที่ทดลองทั้ง 5 ชนิด</Title>
      <div className={`${base.materialList} ${styles.materialLegend}`}>{LAB_MATERIALS.map((item) => <button key={item.id} type="button" aria-pressed={focusedMaterialId === item.id} aria-label={`เลือกและยกวัสดุ ${item.name}`} disabled={running} onClick={() => selectMaterial(item.id)}>
        <img src={asset(`materials/${item.image}`)} alt="" /><span>{item.name}</span>
        {focusedMaterialId === item.id ? <b className={base.selectedCheck} aria-hidden="true">✓</b> : records[item.id] ? <b className={base.savedDot} aria-label="บันทึกแล้ว">✓</b> : null}
      </button>)}</div>
    </aside>

    <section className={`${base.panel} ${base.startPanel}`}>
      <button className={base.start} disabled={running} onClick={start}><LabIcon name="play" />{running ? "กำลังทดลองพร้อมกัน…" : done ? "ทดลองใหม่ทั้ง 5 วัสดุ" : "เริ่มทดลองทั้ง 5 วัสดุ"}</button>
      <button className={base.conditionToggle} type="button" aria-expanded={showConditions} aria-controls="absorption-conditions" onClick={() => setShowConditions((visible) => !visible)}><LabIcon name="scale" />{showConditions ? "ซ่อนเงื่อนไข" : "ดูเงื่อนไข"}</button>
    </section>

    <section className={`${base.panel} ${base.results} ${styles.results}`} aria-label="ผลการดูดซับน้ำ">
      <Title icon="chart">ผลการทดลอง <small>(เลือกสิ่งที่สังเกตเห็น)</small></Title>
      {!done ? <div className={base.resultPlaceholder} role="status"><span aria-hidden="true">5</span><b>{running ? "กำลังทดลองพร้อมกัน…" : "เริ่มทดลองก่อน"}</b><small>สังเกตรอยเปียกของวัสดุทั้ง 5 ชนิด</small></div> : <>
        <div className={styles.observationMatrix} role="group" aria-label="ผลการสังเกตวัสดุทั้งห้าชนิด">
          {LAB_MATERIALS.map((material) => <article key={material.id}>
            <h3>{shortMaterialName(material)}</h3>
            <div>{ABSORPTION_CHOICES.map((choice) => <button key={choice.id} type="button" aria-label={`${shortMaterialName(material)} ${choice.label}`} aria-pressed={observations[material.id] === choice.id} onClick={() => chooseObservation(material.id, choice.id)}><i aria-hidden="true">{observations[material.id] === choice.id ? "✓" : ""}</i><b>{choice.label}</b></button>)}</div>
          </article>)}
        </div>
        {accepted && <p className={base.feedback} role="status">✓ บันทึกคำตอบแล้ว</p>}
      </>}
    </section>

    <section className={`${base.panel} ${base.recordPanel}`}>
      <div className={base.recordButtons}>
        <button data-saved={accepted} disabled={accepted ? false : !done || !allObserved} onClick={accepted ? onDone : record}><LabIcon name={accepted ? "play" : "save"} />{accepted ? "ตอบคำถามสรุป" : !done ? "เริ่มทดลองก่อน" : !allObserved ? `เลือกผลให้ครบ (${observedCount}/5)` : "บันทึกคำตอบ"}</button>
        <button onClick={() => setShowRecords(true)}><LabIcon name="book" />ดูตารางผลการทดลอง</button>
      </div>
    </section>

    <dialog ref={recordsDialog} className={base.dialog} onCancel={() => setShowRecords(false)} onClose={() => setShowRecords(false)} aria-labelledby="water-records-title">
      <header><h2 id="water-records-title">บันทึกผลการดูดซับน้ำ</h2><button autoFocus onClick={() => setShowRecords(false)} aria-label="ปิดบันทึก">×</button></header>
      <p>บันทึกแล้ว {count}/{LAB_MATERIALS.length} วัสดุ</p>
      <table><thead><tr><th>วัสดุ</th><th>คำตอบของทีม</th><th>สถานะ</th></tr></thead><tbody>{LAB_MATERIALS.map((item) => {
        const saved = records[item.id];
        return <tr key={item.id} className={!saved ? base.missingRecord : undefined}><td><img src={asset(`materials/${item.image}`)} alt="" />{item.name}</td><td>{saved ? observationLabel(saved.observation) : "ยังไม่บันทึก"}</td><td>{saved ? "บันทึกแล้ว" : "รอการทดลอง"}</td></tr>;
      })}</tbody></table>
      <p className={base.recordNote}>ผลนี้เป็นหลักฐานเชิงประจักษ์จากแบบจำลองเพื่อฝึกเปรียบเทียบวัสดุ ไม่ใช่ค่าทดสอบวัสดุจริง</p>
      <button className={base.dialogDone} onClick={() => { setShowRecords(false); guard(onDone); }}>{count === LAB_MATERIALS.length ? "ตอบคำถามสรุป" : "กลับไปทดลองต่อ"}</button>
    </dialog>
    <dialog ref={confirmDialog} className={`${base.dialog} ${base.confirm}`} onCancel={() => setPending(null)} aria-labelledby="water-confirm-title">
      <h2 id="water-confirm-title">ยังไม่ได้บันทึกผลครั้งนี้</h2><p>จะกลับไปบันทึกก่อน หรือออกจากการทดลองครั้งนี้?</p><div><button autoFocus onClick={() => setPending(null)}>กลับไปบันทึก</button><button onClick={() => { pending?.(); setPending(null); }}>ไปต่อโดยไม่บันทึก</button></div>
    </dialog>
  </div>;
}
