"use client";

import { useMemo, useState } from "react";
import type { GameSave, MissionThreeLayer, MissionThreeZone } from "./data";
import { LAB_MATERIALS } from "./labs";
import { recordedExperimentResult } from "./mission-three-evidence";
import styles from "./MissionThree.module.css";
import { AppIcon, type AppIconName } from "@/components/AppIcon";

export type MissionThreeStage =
  | "mission3Review"
  | "mission3Question"
  | "mission3Intro"
  | "mission3Data"
  | "mission3Parts"
  | "mission3Materials"
  | "mission3Design"
  | "mission3Build"
  | "mission3Reason"
  | "mission3Complete";

type MissionThreeProps = {
  stage: MissionThreeStage;
  save: GameSave;
  onPatch: (next: Partial<GameSave>) => void;
  onBack: () => void;
  onNext: (stage: MissionThreeStage) => void;
  onComplete: () => void;
  onFinish: () => void;
};

type RoleKey = "structure" | "impact" | "water";
type MaterialStep = RoleKey | "reuse";

const PART_GUIDE_ITEMS: readonly {
  key: MaterialStep;
  label: string;
  detail: string;
  icon: AppIconName;
}[] = [
  { key: "structure", label: "โครงกล่อง", detail: "รับแรงกดและช่วยให้กล่องคงรูป", icon: "package" },
  { key: "impact", label: "ชั้นกันกระแทก", detail: "ช่วยลดความเสียหายของสิ่งของ", icon: "egg" },
  { key: "water", label: "ชั้นลดการเปียก", detail: "ช่วยชะลอน้ำซึมเข้าสู่กล่อง", icon: "drop" },
  { key: "reuse", label: "เลือกวัสดุเหลือใช้", detail: "เลือกใช้วัสดุเหลือใช้อย่างน้อย 1 ส่วน", icon: "recycle" },
] as const;

const ROLE_DEFINITIONS: readonly {
  key: RoleKey;
  label: string;
  short: string;
  icon: AppIconName;
  hint: string;
  evidence: "compression" | "impact" | "water";
}[] = [
  {
    key: "structure",
    label: "โครงกล่อง",
    short: "รับแรงกด",
    icon: "package",
    hint: "เลือกวัสดุที่ยุบหรือเปลี่ยนรูปน้อยกว่า",
    evidence: "compression",
  },
  {
    key: "impact",
    label: "ชั้นกันกระแทก",
    short: "ป้องกันสิ่งของ",
    icon: "egg",
    hint: "เลือกวัสดุที่ทำให้สิ่งของเสียหายน้อยกว่า",
    evidence: "impact",
  },
  {
    key: "water",
    label: "ชั้นลดการเปียก",
    short: "ชะลอน้ำซึม",
    icon: "drop",
    hint: "เลือกวัสดุที่มีรอยเปียกหรือดูดซับน้ำน้อยกว่า",
    evidence: "water",
  },
] as const;

const ZONES: readonly { key: MissionThreeZone; label: string; detail: string; icon: AppIconName }[] = [
  { key: "outside", label: "ด้านนอกกล่อง", detail: "ชั้นนอกสุด", icon: "box" },
  { key: "inside", label: "ด้านในกล่อง", detail: "ชั้นกลาง", icon: "package" },
  { key: "around", label: "รอบสิ่งของ", detail: "ชั้นใกล้แก้ว", icon: "shield" },
] as const;

const REASON_OPTIONS = [
  { value: "compression", label: "ยุบหรือเปลี่ยนรูปน้อยกว่า" },
  { value: "impact", label: "ทำให้สิ่งของเสียหายน้อยกว่า" },
  { value: "water", label: "มีรอยเปียกหรือดูดซับน้ำน้อยกว่า" },
] as const;

const REVIEW_ITEMS = [
  {
    cause: "แรงกด",
    evidence: "กล่องยุบ",
    image: "inspection/damaged_box_preview_top.png",
    imageAlt: "รอยยุบด้านบนของกล่อง",
    property: "ทดสอบความต้านทานแรงกดทับ",
    icon: "package" as AppIconName,
  },
  {
    cause: "แรงกระแทก",
    evidence: "สิ่งของภายในเสียหาย",
    image: "cutscene/shot_09_cracked_cup.png",
    imageAlt: "สิ่งของภายในกล่องเสียหาย",
    property: "ทดสอบการลดความเสียหายจากแรงกระแทก",
    icon: "shield" as AppIconName,
  },
  {
    cause: "น้ำ",
    evidence: "กล่องเปียก",
    image: "inspection/damaged_box_preview_wet.png",
    imageAlt: "รอยเปียกบนกล่อง",
    property: "ทดสอบการดูดซับน้ำของวัสดุ",
    icon: "drop" as AppIconName,
  },
] as const;

function asset(path: string) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${base}/assets/${path}`;
}

function materialById(id?: string) {
  return LAB_MATERIALS.find((material) => material.id === id);
}

function evidenceFor(save: GameSave, materialId: string, evidence: "compression" | "impact" | "water") {
  return recordedExperimentResult(save, materialId, evidence);
}

function layerRole(layer?: MissionThreeLayer): RoleKey | null {
  if (!layer) return null;
  if (layer === "structure") return "structure";
  return layer.startsWith("impact") ? "impact" : "water";
}

function layerLabel(layer: MissionThreeLayer, save: GameSave) {
  const role = layerRole(layer)!;
  const material = materialById(save.mission3Selections?.[role]);
  const label = ROLE_DEFINITIONS.find((item) => item.key === role)?.label ?? "ส่วนของกล่อง";
  return `${label}${layer.endsWith("extra") ? " (ชิ้นเสริม)" : ""} · ${material?.name ?? "ยังไม่เลือกวัสดุ"}`;
}

function ScreenHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return <>
    <button className={styles.back} type="button" onClick={onBack}>‹ ย้อนกลับ</button>
    <header className={`${styles.header} ${styles.lessonHeader} ${styles.centeredHeader}`}>
      <div><h1>{title}</h1><p>{subtitle}</p></div>
    </header>
  </>;
}

function PartOutlineGraphic({ part }: { part: RoleKey }) {
  if (part === "structure") return <svg viewBox="0 0 220 120" role="img" aria-label="ภาพเส้นประรูปโครงกล่อง">
    <path d="M45 40 110 14l65 26-65 28Z" />
    <path d="M45 40v48l65 26V68m65-28v48l-65 26" />
    <path d="m45 40 65 25 65-25" />
  </svg>;
  if (part === "impact") return <svg viewBox="0 0 220 120" role="img" aria-label="ภาพเส้นประรูปชั้นกันกระแทก">
    <path d="M45 43 104 18c5-2 10-2 15 0l56 24c6 3 6 9 0 12l-58 27c-5 2-10 2-15 0L45 56c-7-3-7-10 0-13Z" />
    <path d="M40 49v20c0 4 2 7 7 9l55 25c5 2 10 2 15 0l57-27c4-2 6-5 6-9V48" />
    <path d="m104 82-1 20m14-21v21" />
    <path d="M68 43c9-4 17-4 25 0 8 5 17 5 26 0 8-4 17-4 26 0" />
    <path d="M64 60c9-4 18-4 26 0s17 4 26 0 17-4 26 0" />
  </svg>;
  return <svg viewBox="0 0 220 120" role="img" aria-label="ภาพเส้นประรูปชั้นลดการเปียก">
    <path d="M35 41c24-15 45 12 69-3s46 12 81-3v53c-35 15-57-12-81 3S59 79 35 94Z" />
    <path d="M111 28c-13 18-20 27-20 38a20 20 0 0 0 40 0c0-11-7-20-20-38Z" />
  </svg>;
}

function MissionThreeReview({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return <div className={`screen mission-two-screen mission-two-review-screen ${styles.mission3Review}`}>
    <button className="button button-white mission-two-back" type="button" onClick={onBack}>‹ กลับหน้าภารกิจ</button>
    <header><span>ทบทวนภารกิจที่ 1 และ 2</span><h1>สิ่งที่เราทำมาแล้ว</h1><p>เราพบร่องรอย แล้วทดลองสมบัติของวัสดุที่เกี่ยวข้อง</p></header>
    <main className="mission-two-review-table" role="table" aria-label="ทบทวนร่องรอยและการทดลองที่ผ่านมา">
      <div className="mission-two-review-table-head" role="row"><span /><b>ร่องรอยที่พบ</b><span /><b>สิ่งที่เราทดลอง</b></div>
      {REVIEW_ITEMS.map((item, index) => <article key={item.cause} role="row">
        <strong>{index + 1}</strong>
        <div className="mission-two-review-evidence" role="cell"><img src={asset(item.image)} alt={item.imageAlt} /><span><b>{item.evidence}</b><em>{item.cause}</em></span></div>
        <i className="mission-two-review-arrow" aria-hidden="true"><svg viewBox="0 0 120 48" focusable="false"><path d="M6 24h91" /><path d="m82 7 17 17-17 17" /></svg></i>
        <div className="mission-two-review-property" role="cell"><AppIcon name={item.icon} /><span><b>{item.property}</b></span></div>
      </article>)}
    </main>
    <footer className="mission-two-review-footer"><p><b>ตอนนี้เรามีหลักฐานแล้ว</b><span>ต่อไปมาดูว่าเราจะใช้หลักฐานนี้สร้างกล่องอย่างไร</span></p><button className={`button ${styles.mission3Primary}`} type="button" onClick={onNext}>ไปดูคำถามสำคัญ ›</button></footer>
  </div>;
}

function MissionThreeQuestion({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return <div className={`screen mission-two-screen mission-two-question-screen ${styles.mission3Question}`}>
    <button className="button button-white mission-two-back" type="button" onClick={onBack}>‹ กลับไปทบทวน</button>
    <section className="mission-two-question-card" aria-labelledby="mission-three-question-title">
      <div className="mission-two-question-symbol"><AppIcon name="message" /></div>
      <span className="mission-two-question-label">คำถามสำคัญของภารกิจ</span>
      <h1 id="mission-three-question-title"><span>เราจะเลือกวัสดุและจัดวางส่วนต่าง ๆ อย่างไร</span><span>ให้กล่องแข็งแรง กันกระแทก และช่วยลดการเปียก?</span></h1>
      <p>ใช้ผลทดลองจากภารกิจที่ 2 เป็นหลักฐาน แล้วสร้างกล่องตามข้อกำหนด</p>
      <button className={`button mission-two-question-start ${styles.mission3Primary}`} type="button" onClick={onNext}>ไปดูภาพรวมภารกิจ ›</button>
    </section>
  </div>;
}

function MissionThreeIntro({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return <div className={`screen mission-two-screen mission-two-intro mission-two-welcome-screen ${styles.mission3Welcome}`}>
    <img className="mission-route-bg" src={asset("menu/cover.png")} alt="" />
    <button className="mission-briefing-back mission-two-welcome-back" type="button" onClick={onBack}>‹ กลับไปดูคำถามสำคัญ</button>
    <main className="mission-two-welcome-card">
      <span className="mission-two-welcome-label">ภารกิจที่ 3</span>
      <div className={`mission-two-welcome-illustrations ${styles.mission3WelcomeIcons}`} aria-hidden="true">
        <span><AppIcon name="microscope" /></span><span><AppIcon name="map" /></span><span><AppIcon name="hammer" /></span>
      </div>
      <h1>ออกแบบและสร้างกล่องพัสดุต้นแบบ</h1>
      <p className="mission-two-welcome-copy">ทีมเลือกวัสดุและตำแหน่งจัดวาง</p>
      <div className="mission-two-route" aria-label="เส้นทางภารกิจที่ 3">
        <article><i>1</i><b>ดูหลักฐาน</b><span>เลือกวัสดุจากผลทดลอง</span></article>
        <article><i>2</i><b>จัดวาง 3 จุด</b><span>ด้านนอก ด้านใน รอบสิ่งของ</span></article>
        <article><i>3</i><b>สร้างตาม 7 ขั้น</b><span>ใช้แม่แบบที่ครูเตรียม</span></article>
        <article><i>4</i><b>สรุปคำตอบกลุ่ม</b><span>บันทึกสั้น ๆ ใน SIM</span></article>
      </div>
      <button
        className={`button mission-briefing-start mission-two-primary ${styles.mission3Primary}`}
        type="button"
        onClick={onNext}
      >เริ่มทำภารกิจ <b aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg></b></button>
    </main>
  </div>;
}

function MissionThreeData({ save, onNext, onBack }: { save: GameSave; onNext: () => void; onBack: () => void }) {
  return <div className={`${styles.screen} ${styles.guidedScreen}`}>
    <ScreenHeader title="ทบทวนผลการทดลองของกลุ่ม" subtitle="อ่านผลที่กลุ่มบันทึกไว้จากภารกิจที่ 2 ครบทั้ง 3 ด้าน" onBack={onBack} />
    <main className={styles.resultsReview}>
      <section className={styles.resultsTable} role="table" aria-label="ผลการทดลองวัสดุของกลุ่มทั้ง 3 ด้าน">
        <div className={styles.resultsHead} role="row">
          <b role="columnheader">วัสดุ</b>
          <b role="columnheader"><img src={asset("menu/lab-room-compression.png")} alt="" /><span>ผลแรงกด</span></b>
          <b role="columnheader"><img src={asset("menu/lab-room-impact.png")} alt="" /><span>ผลแรงกระแทก</span></b>
          <b role="columnheader"><img src={asset("menu/lab-room-absorption.png")} alt="" /><span>ผลการดูดซับน้ำ</span></b>
        </div>
        {LAB_MATERIALS.map((material) => <article key={material.id} className={styles.resultsRow} role="row">
          <div className={styles.materialIdentity} role="cell"><img width="72" height="72" src={asset(`materials/${material.image}`)} alt="" /><strong>{material.name}</strong></div>
          <span role="cell">{evidenceFor(save, material.id, "compression")}</span>
          <span role="cell">{evidenceFor(save, material.id, "impact")}</span>
          <span role="cell">{evidenceFor(save, material.id, "water")}</span>
        </article>)}
      </section>
    </main>
    <footer className={styles.footer}><span><AppIcon name="idea" /> ผลเหล่านี้จะใช้เป็นหลักฐานในการเลือกวัสดุ</span><button className="button button-orange" type="button" onClick={onNext}>ทบทวนส่วนของกล่อง ›</button></footer>
  </div>;
}

function MissionThreeParts({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [activePart, setActivePart] = useState<MaterialStep>("structure");

  return <div className={`${styles.screen} ${styles.guidedScreen}`}>
    <ScreenHeader title="กล่องต้นแบบมี 4 สิ่งสำคัญ" subtitle="ทบทวน 3 ส่วนของกล่องและเกณฑ์วัสดุเหลือใช้ ก่อนเลือกวัสดุ" onBack={onBack} />
    <main className={styles.partsGuide}>
      <section className={styles.partsIllustration}>
        <div className={styles.partsBlueprint} aria-label="ภาพเส้นประแทนส่วนสำคัญทั้ง 3 ส่วน">
          {PART_GUIDE_ITEMS.filter((item): item is typeof item & { key: RoleKey } => item.key !== "reuse").map((item) => <button
            key={item.key}
            type="button"
            aria-label={`ดู${item.label}`}
            aria-pressed={activePart === item.key}
            className={activePart === item.key ? styles.partOutlineActive : ""}
            onClick={() => setActivePart(item.key)}
          >
            <PartOutlineGraphic part={item.key} />
            <b>{item.label}</b>
          </button>)}
        </div>
      </section>
      <section className={styles.partsCards} aria-label="สามส่วนของกล่องและเกณฑ์วัสดุเหลือใช้">
        {PART_GUIDE_ITEMS.map((item, index) => <button
          key={item.key}
          type="button"
          aria-pressed={activePart === item.key}
          className={activePart === item.key ? styles.partCardActive : ""}
          onClick={() => setActivePart(item.key)}
        >
          <i>{index + 1}</i><span className={styles.partsCardIcon}><AppIcon name={item.icon} /></span><div><h2>{item.label}</h2><p>{item.detail}</p></div>
        </button>)}
      </section>
    </main>
    <footer className={`${styles.footer} ${styles.partsFooter}`}><button className="button button-orange" type="button" onClick={onNext}>เข้าใจครบ 4 เรื่องแล้ว ไปเลือกวัสดุ ›</button></footer>
  </div>;
}

function MissionThreeMaterials({ save, onPatch, onNext, onBack }: { save: GameSave; onPatch: (next: Partial<GameSave>) => void; onNext: () => void; onBack: () => void }) {
  const [activeStep, setActiveStep] = useState<MaterialStep>("structure");
  const selections = save.mission3Selections ?? {};
  const reuse = save.mission3Reuse ?? {};
  const selectedRoles = ROLE_DEFINITIONS.filter((role) => selections[role.key]);
  const reusedRole = ROLE_DEFINITIONS.find((role) => reuse[role.key])?.key ?? "";
  const reuseMaterialId = save.mission3ReuseMaterial ?? (reusedRole ? selections[reusedRole] : "");
  const complete = selectedRoles.length === ROLE_DEFINITIONS.length && Boolean(reusedRole && reuseMaterialId);
  const unlockedSteps: Record<MaterialStep, boolean> = {
    structure: true,
    impact: Boolean(selections.structure),
    water: Boolean(selections.impact),
    reuse: Boolean(selections.water),
  };
  const activeRole = activeStep === "reuse" ? null : ROLE_DEFINITIONS.find((role) => role.key === activeStep)!;
  const activeMaterial = activeRole ? materialById(selections[activeRole.key]) : undefined;
  const activeRoleIndex = activeRole ? ROLE_DEFINITIONS.findIndex((role) => role.key === activeRole.key) : -1;
  const nextStep: MaterialStep | null = activeRoleIndex < 0
    ? null
    : activeRoleIndex === ROLE_DEFINITIONS.length - 1
      ? "reuse"
      : ROLE_DEFINITIONS[activeRoleIndex + 1].key;
  const chooseMaterial = (role: RoleKey, materialId: string) => onPatch({
    mission3Selections: { ...selections, [role]: materialId },
    ...(reusedRole === role ? { mission3ReuseMaterial: materialId } : {}),
  });
  const chooseReuseRole = (role: RoleKey) => onPatch({
    mission3Reuse: Object.fromEntries(ROLE_DEFINITIONS.map((item) => [item.key, item.key === role])),
    ...(reuseMaterialId ? { mission3Selections: { ...selections, [role]: reuseMaterialId } } : {}),
  });
  const chooseReuseMaterial = (materialId: string) => onPatch({
    mission3ReuseMaterial: materialId,
    ...(reusedRole ? { mission3Selections: { ...selections, [reusedRole]: materialId } } : {}),
  });

  return <div className={`${styles.screen} ${styles.guidedScreen}`}>
    <ScreenHeader title="เลือกวัสดุทำส่วนต่างๆ" subtitle="ดูผลการทดลองสมบัติทั้ง 3 ด้านแล้วเลือกวัสดุที่จะใช้ทำส่วนต่างๆ" onBack={onBack} />
    <main className={styles.materialRoomLayout}>
      <nav className={styles.roomTabs} aria-label="เลือกห้องวัสดุ" role="tablist">
        {ROLE_DEFINITIONS.map((role, index) => <button key={role.key} type="button" role="tab" aria-selected={role.key === activeStep} disabled={!unlockedSteps[role.key]} className={role.key === activeStep ? styles.roomTabActive : ""} onClick={() => setActiveStep(role.key)}>
          <i>{selections[role.key] ? "✓" : index + 1}</i><span><b>{`ห้องเลือก${role.label}`}</b></span>
        </button>)}
        <button type="button" role="tab" aria-selected={activeStep === "reuse"} disabled={!unlockedSteps.reuse} className={activeStep === "reuse" ? styles.roomTabActive : ""} onClick={() => setActiveStep("reuse")}>
          <i>{reusedRole && reuseMaterialId ? "✓" : 4}</i><span><b>วัสดุเหลือใช้</b></span>
        </button>
      </nav>
      {activeRole ? <section className={styles.materialRoomPanel} aria-labelledby={`room-${activeRole.key}`}>
        <header><i><AppIcon name={activeRole.icon} /></i><div><h2 id={`room-${activeRole.key}`}>{`ห้องเลือก${activeRole.label}`}</h2><p>เลือกได้จากวัสดุทั้ง 5 ชนิด</p></div></header>
        <div className={styles.materialRoomContent}>
          <div className={styles.materialEvidence}>
            <div className={styles.roomResultTable} role="table" aria-label={`ผลทดลองสำหรับ${activeRole.label}`}>
              <div className={styles.roomResultHead} role="row"><b role="columnheader">วัสดุ</b><b role="columnheader">ผลการทดลอง</b><b role="columnheader">เลือก</b></div>
              {LAB_MATERIALS.map((material) => {
                const selected = selections[activeRole.key] === material.id;
                return <article key={material.id} className={selected ? styles.roomResultSelected : ""} role="row">
                  <div className={styles.materialIdentity} role="cell"><img width="72" height="72" src={asset(`materials/${material.image}`)} alt="" /><strong>{material.name}</strong></div>
                  <span role="cell">{evidenceFor(save, material.id, activeRole.evidence)}</span>
                  <div role="cell"><button type="button" aria-pressed={selected} onClick={() => chooseMaterial(activeRole.key, material.id)}>{selected ? "✓ เลือกแล้ว" : "เลือกวัสดุ"}</button></div>
                </article>;
              })}
            </div>
            <div className={styles.roomNext}>
              <span>{activeMaterial ? `เลือก ${activeMaterial.name} สำหรับ${activeRole.label}` : `อ่านผลแล้วเลือกวัสดุ 1 อย่างสำหรับ${activeRole.label}`}</span>
              {nextStep && <button className="button button-orange" type="button" disabled={!activeMaterial} onClick={() => setActiveStep(nextStep)}>{nextStep === "reuse" ? "ไปเลือกวัสดุเหลือใช้" : `ไปห้องเลือก${ROLE_DEFINITIONS.find((role) => role.key === nextStep)?.label}`} ›</button>}
            </div>
          </div>
          <aside className={styles.materialPreview} aria-live="polite">
            <h3>วัสดุที่เลือก</h3>
            <div className={`${styles.materialPreviewShape} ${activeMaterial ? styles.materialPreviewFilled : ""}`}>
              <span><AppIcon name={activeRole.icon} /></span>
              {activeMaterial && <img
                src={activeRole.key === "structure"
                  ? asset(`mission3/structure-previews/${activeMaterial.id}.png`)
                  : asset(`materials/${activeMaterial.image}`)}
                alt={`${activeMaterial.name} สำหรับ${activeRole.label}`}
              />}
            </div>
            <b>{activeMaterial?.name ?? "ยังไม่ได้เลือกวัสดุ"}</b>
          </aside>
        </div>
      </section> : <section className={styles.reuseRoomPanel} aria-labelledby="room-reuse">
        <header><i><AppIcon name="recycle" /></i><div><h2 id="room-reuse">เลือกใช้วัสดุเหลือใช้</h2><p>เลือก 1 ส่วนของกล่อง แล้วเลือกวัสดุ 1 จาก 5 ชนิด</p></div></header>
        <div className={styles.reuseRoomGrid}>
          <section><h3><i>1</i> เลือกส่วนของกล่อง</h3><div className={styles.reusePartChoices}>{ROLE_DEFINITIONS.map((role) => <button key={role.key} type="button" aria-pressed={reusedRole === role.key} className={reusedRole === role.key ? styles.reuseSelected : ""} onClick={() => chooseReuseRole(role.key)}><AppIcon name={role.icon} /><span><b>{role.label}</b><small>{role.short}</small></span></button>)}</div></section>
          <section><h3><i>2</i> เลือกวัสดุเหลือใช้</h3><div className={styles.reuseMaterialChoices}>{LAB_MATERIALS.map((material) => <button key={material.id} type="button" aria-pressed={reuseMaterialId === material.id} className={reuseMaterialId === material.id ? styles.reuseSelected : ""} onClick={() => chooseReuseMaterial(material.id)}><img src={asset(`materials/${material.image}`)} alt="" /><b>{material.name}</b></button>)}</div></section>
        </div>
        <div className={styles.reuseRoomSummary}>{reusedRole && reuseMaterialId ? <><AppIcon name="check" /><span>ทีมจะใช้ <b>{materialById(reuseMaterialId)?.name}</b> ที่เป็นวัสดุเหลือใช้ทำ <b>{ROLE_DEFINITIONS.find((role) => role.key === reusedRole)?.label}</b></span></> : <><AppIcon name="idea" /><span>เลือกให้ครบทั้ง “ส่วนของกล่อง” และ “วัสดุ”</span></>}</div>
      </section>}
    </main>
    <footer className={styles.footer}><span className={complete ? styles.readyText : ""}>{complete ? "✓ เลือกวัสดุครบ 3 ส่วนและเลือกวัสดุเหลือใช้แล้ว" : "เลือกวัสดุให้ครบ 3 ส่วน แล้วทำขั้นวัสดุเหลือใช้เป็นขั้นสุดท้าย"}</span><button className="button button-orange" type="button" disabled={!complete} onClick={onNext}>ไปจัดวางวัสดุ ›</button></footer>
  </div>;
}

const PLACEMENT_PATHS: Record<MissionThreeZone, string> = {
  outside: "M70 78 H535 V350 L424 432 H72",
  inside: "M92 116 H497 V326 L402 397 H86",
  around: "M116 154 H459 V302 L377 363 H103",
};

const MATERIAL_TEXTURE_ASSETS: Record<string, string> = {
  corrugated_cardboard: "mission3/material-textures/corrugated_cardboard-v1.png",
  cardboard: "mission3/material-textures/cardboard-v1.png",
  bubble_wrap: "mission3/material-textures/bubble_wrap-v1.png",
  closed_cell_pe_foam: "mission3/material-textures/closed_cell_pe_foam-v1.png",
  pe_sheet: "mission3/material-textures/pe_sheet-v1.png",
};

function materialTexture(material: (typeof LAB_MATERIALS)[number]) {
  return asset(MATERIAL_TEXTURE_ASSETS[material.id] ?? `materials/${material.image}`);
}

const PLACEMENT_LABELS: Record<MissionThreeZone, { x: number; y: number; width: number }> = {
  outside: { x: 62, y: 44, width: 138 },
  inside: { x: 200, y: 83, width: 132 },
  around: { x: 320, y: 121, width: 138 },
};

function PlacementDiagram({ save, placements }: { save: GameSave; placements: Partial<Record<MissionThreeZone, MissionThreeLayer>> }) {
  const placementAt = (zone: MissionThreeZone): RoleKey | undefined => {
    const layer = placements[zone];
    return layer === "structure" || layer === "impact" || layer === "water" ? layer : undefined;
  };

  return <svg className={styles.placementDiagram} viewBox="0 0 620 470" role="img" aria-label="ภาพตัดกล่องสามชั้น มีด้านนอก ด้านใน รอบสิ่งของ และแก้วอยู่ตรงกลาง">
    <defs>
      {ZONES.map((zone) => {
        const role = placementAt(zone.key);
        const material = role ? materialById(save.mission3Selections?.[role]) : undefined;
        return material && <pattern key={zone.key} id={`placement-material-${zone.key}`} patternUnits="userSpaceOnUse" width="84" height="84">
          <image href={materialTexture(material)} width="84" height="84" preserveAspectRatio="xMidYMid slice" />
        </pattern>;
      })}
      <filter id="placement-shadow" x="-30%" y="-30%" width="160%" height="180%">
        <feDropShadow dx="0" dy="7" stdDeviation="7" floodColor="#254f45" floodOpacity=".22" />
      </filter>
    </defs>
    <ellipse className={styles.diagramFloorShadow} cx="286" cy="399" rx="128" ry="22" />
    {ZONES.map((zone) => {
      const role = placementAt(zone.key);
      const material = role ? materialById(save.mission3Selections?.[role]) : undefined;
      const label = PLACEMENT_LABELS[zone.key];
      return <g key={zone.key}>
        <path className={styles.diagramGuide} d={PLACEMENT_PATHS[zone.key]} />
        {material && <>
          <path className={styles.diagramMaterialBase} d={PLACEMENT_PATHS[zone.key]} />
          <path className={styles.diagramMaterialTexture} d={PLACEMENT_PATHS[zone.key]} stroke={`url(#placement-material-${zone.key})`} />
        </>}
        <g className={styles.diagramLabel} transform={`translate(${label.x} ${label.y})`}>
          <rect width={label.width} height="31" rx="15.5" />
          <text x={label.width / 2} y="21" textAnchor="middle">{zone.label}</text>
        </g>
      </g>;
    })}
    <image className={styles.diagramCup} href={asset("mission3/cup-cutout-v1.png")} x="154" y="169" width="205" height="195" preserveAspectRatio="xMidYMid meet" filter="url(#placement-shadow)" />
  </svg>;
}

function MissionThreeDesign({ save, onPatch, onNext, onBack }: { save: GameSave; onPatch: (next: Partial<GameSave>) => void; onNext: () => void; onBack: () => void }) {
  const placements = save.mission3Placements ?? {};
  const tokens = ROLE_DEFINITIONS.map((role) => role.key);
  const placementAt = (zone: MissionThreeZone): RoleKey | undefined => {
    const layer = placements[zone];
    return layer === "structure" || layer === "impact" || layer === "water" ? layer : undefined;
  };
  const used = ZONES.map((zone) => placementAt(zone.key)).filter((role): role is RoleKey => Boolean(role));
  const ready = ZONES.every((zone) => placementAt(zone.key)) && tokens.every((token) => used.includes(token));

  const place = (zone: MissionThreeZone, layer: RoleKey) => {
    const next = { ...placements };
    const active = placementAt(zone);
    if (active === layer) {
      delete next[zone];
    } else {
      const previousZone = ZONES.find((item) => placementAt(item.key) === layer)?.key;
      if (previousZone && previousZone !== zone) {
        if (active) next[previousZone] = active;
        else delete next[previousZone];
      }
      next[zone] = layer;
    }
    onPatch({ mission3Extra: "", mission3Placements: next });
  };

  return <div className={`${styles.screen} ${styles.guidedScreen}`}>
    <ScreenHeader title="เลือกว่าจะวางวัสดุไว้ตรงไหน" subtitle="มี 3 ตำแหน่ง ทีมเป็นผู้ตัดสินใจ และยังไม่มีคำตอบถูกหรือผิดในขั้นนี้" onBack={onBack} />
    <main className={styles.placementLayout}>
      <section className={styles.placementPreviewPanel} aria-label="ภาพตัวอย่างตำแหน่งวัสดุสามชั้น">
        <h2>ภาพกล่องของทีม</h2>
        <div className={styles.placementPreviewScene} aria-live="polite">
          <PlacementDiagram save={save} placements={placements} />
        </div>
      </section>
      <section className={styles.zoneBoard}>
        <h2>เลือกวัสดุให้แต่ละตำแหน่ง</h2>
        <div className={styles.zoneGrid}>{ZONES.map((zone) => <article key={zone.key} className={placementAt(zone.key) ? styles.zoneFilled : ""}>
          <header><i><AppIcon name={zone.icon} /></i><div><b>{zone.label}</b><small>{zone.detail}</small></div></header>
          <div>{tokens.map((token) => {
            const role = ROLE_DEFINITIONS.find((item) => item.key === token)!;
            const material = materialById(save.mission3Selections?.[token]);
            const active = placementAt(zone.key) === token;
            return <button key={token} type="button" disabled={!material} aria-pressed={active} className={active ? styles.tokenSelected : ""} onClick={() => place(zone.key, token)}>
              {material && <img src={materialTexture(material)} alt="" />}
              <span><b>{role.label}</b><small>{material?.name ?? "ยังไม่ได้เลือกวัสดุ"}</small></span>
              {active && <i>✓</i>}
            </button>;
          })}</div>
        </article>)}</div>
      </section>
    </main>
    <footer className={styles.footer}><span className={ready ? styles.readyText : ""}>{ready ? "✓ วางส่วนของกล่องครบทั้ง 3 ตำแหน่งแล้ว" : "กดเลือกวัสดุ · กดตัวเดิมซ้ำเพื่อยกเลิก"}</span><button className="button button-orange" type="button" disabled={!ready} onClick={onNext}>ดูขั้นตอนสร้าง ›</button></footer>
  </div>;
}

function MissionThreeBuild({ save, onPatch, onNext, onBack }: { save: GameSave; onPatch: (next: Partial<GameSave>) => void; onNext: () => void; onBack: () => void }) {
  const steps = [
    { id: "build-v2-materials", title: "รับวัสดุจากครู", summary: "ตรวจรายการของทีมให้ครบก่อนเริ่ม", icon: "truck" as AppIconName },
    { id: "build-v2-rules", title: "ข้อกำหนดการสร้างกล่อง", summary: "อ่านขนาด อุปกรณ์ และความปลอดภัย", icon: "notebook" as AppIconName },
    { id: "build-v2-structure", title: "ทำชั้นโครงกล่อง", summary: "ทาบแบบ ตัดเส้นทึบ และพับเส้นประ", icon: "package" as AppIconName },
    { id: "build-v2-impact", title: "ทำชั้นกันกระแทก", summary: "ประกอบด้วยวัสดุและตำแหน่งที่ทีมเลือก", icon: "shield" as AppIconName },
    { id: "build-v2-water", title: "ชั้นลดการเปียก", summary: "ประกอบด้วยวัสดุและตำแหน่งที่ทีมเลือก", icon: "drop" as AppIconName },
    { id: "build-v2-object", title: "วางวัสดุรอบสิ่งของ", summary: "ใช้ดินน้ำมันเป็นสิ่งของจำลอง", icon: "target" as AppIconName },
    { id: "build-v2-check", title: "ปิดงานและตรวจความเรียบร้อย", summary: "ตรวจทีละข้อก่อนนำไปทดสอบ", icon: "check" as AppIconName },
  ];
  const completed = save.mission3BuildSteps ?? {};
  const firstOpen = steps.findIndex((step) => !completed[step.id]);
  const [active, setActive] = useState(firstOpen < 0 ? steps.length - 1 : firstOpen);
  const doneCount = steps.filter((step) => completed[step.id]).length;
  const ready = doneCount === steps.length;
  const markDone = () => {
    const next = { ...completed, [steps[active].id]: true };
    onPatch({ mission3BuildSteps: next });
    if (active < steps.length - 1) setActive(active + 1);
  };

  const reusedRole = ROLE_DEFINITIONS.find((role) => save.mission3Reuse?.[role.key]);
  const reuseMaterial = materialById(save.mission3ReuseMaterial || (reusedRole ? save.mission3Selections?.[reusedRole.key] : ""));
  const selectedParts = ROLE_DEFINITIONS.map((role) => ({
    ...role,
    material: materialById(save.mission3Selections?.[role.key]),
    zone: ZONES.find((zone) => layerRole(save.mission3Placements?.[zone.key]) === role.key),
  }));
  const renderLayerDetail = (roleKey: "impact" | "water") => {
    const part = selectedParts.find((item) => item.key === roleKey)!;
    return <div className={styles.buildLayerDetail}>
      <figure>
        {part.material && <img src={asset(`materials/${part.material.image}`)} alt={part.material.name} />}
        <figcaption>{part.label}</figcaption>
      </figure>
      <section>
        <span className={styles.buildAnswerBadge}>คำตอบของทีม</span>
        <h3>{part.material?.name ?? "ยังไม่ได้เลือกวัสดุ"}</h3>
        <p><b>ตำแหน่ง:</b> {part.zone?.label ?? "ยังไม่ได้กำหนดตำแหน่ง"}</p>
        <ol>
          <li>นำวัสดุของทีมมาเทียบกับภาพและชื่อด้านซ้าย</li>
          <li>วางวัสดุที่ <b>{part.zone?.label ?? "ตำแหน่งตามแบบของทีม"}</b> แล้วประกอบให้แนบกับชั้นข้างเคียง</li>
          <li>ตรวจว่าไม่มีช่องว่าง ขอบแหลม หรือส่วนที่หลุดง่าย</li>
        </ol>
      </section>
    </div>;
  };
  const renderBuildDetail = () => {
    if (active === 0) return <>
      <div className={styles.buildMaterialList}>{selectedParts.map((part) => <article key={part.key}>
        {part.material && <img src={asset(`materials/${part.material.image}`)} alt="" />}
        <span><small>{part.label}</small><b>{part.material?.name ?? "ยังไม่ได้เลือกวัสดุ"}</b></span>
        {reusedRole?.key === part.key && <em>วัสดุเหลือใช้</em>}
      </article>)}</div>
      <div className={styles.buildSupplyStrip}>
        <span><AppIcon name="map" /><b>แบบคลี่กล่อง 8 × 8 × 8 ซม.</b></span>
        <span><AppIcon name="target" /><b>ดินน้ำมันและกระดาษทิชชู</b></span>
        {reusedRole && reuseMaterial && <span><AppIcon name="recycle" /><b>{reuseMaterial.name} สำหรับ{reusedRole.label}</b></span>}
      </div>
    </>;
    if (active === 1) return <div className={styles.buildRules}>
      <article><i><AppIcon name="ruler" /></i><div><b>ขนาดสำเร็จ</b><span>กว้าง 8 ซม. × ยาว 8 ซม. × สูง 8 ซม.</span></div></article>
      <article><i><AppIcon name="package" /></i><div><b>ส่วนประกอบที่ต้องมี</b><span>โครงกล่อง ชั้นกันกระแทก ชั้นลดการเปียก และใช้วัสดุเหลือใช้อย่างน้อย 1 ส่วน</span></div></article>
      <article><i><AppIcon name="pencil" /></i><div><b>อุปกรณ์ที่ใช้ได้</b><span>ไม้บรรทัด ปากกา กรรไกรปลายมน เทปใส และกาวสำหรับงานเรียน</span></div></article>
      <article><i><AppIcon name="shield" /></i><div><b>ความปลอดภัย</b><span>ตัดบนโต๊ะ หันกรรไกรออกจากตัว ไม่หยอกล้อ ปิดกรรไกรแล้วหันด้ามให้ผู้รับ และให้ครูช่วยเมื่อวัสดุตัดยาก</span></div></article>
      <article><i><AppIcon name="check" /></i><div><b>เกณฑ์ร่วมของทุกทีม</b><span>ใช้เฉพาะวัสดุที่บันทึกไว้ใน Sim ประกอบให้แน่น และยังไม่ปิดฝากล่องจนกว่าจะตรวจครบทุกชั้น</span></div></article>
    </div>;
    if (active === 2) return <>
      <div className={styles.buildNetGuide}>
        <figure><img src={asset("mission3/cube-net-8cm-v1.svg")} alt="แบบคลี่กล่องลูกบาศก์ขนาด 8 คูณ 8 คูณ 8 เซนติเมตร เส้นทึบใช้ตัด เส้นประใช้พับ" /></figure>
        <ol>
          <li><b>ดูแบบโครงกล่อง</b><span>แต่ละหน้าเป็นสี่เหลี่ยม 8 × 8 ซม. เส้นทึบใช้ตัด เส้นประใช้พับ</span></li>
          <li><b>รับแม่แบบจากครู</b><span>ทาบแบบลงบน <strong>{selectedParts[0].material?.name ?? "วัสดุโครงกล่องของทีม"}</strong> แล้วตัดและพับตามรอย</span></li>
          <li><b>ขออุปกรณ์เพิ่มเมื่อจำเป็น</b><span>ไม้บรรทัด ปากกา กรรไกรปลายมน เทปใส หรือกาว</span></li>
        </ol>
      </div>
      <div className={styles.buildToolStrip}>{["ไม้บรรทัด", "ปากกา", "กรรไกรปลายมน", "เทปใส", "กาว"].map((tool) => <span key={tool}>{tool}</span>)}</div>
    </>;
    if (active === 3) return renderLayerDetail("impact");
    if (active === 4) return renderLayerDetail("water");
    if (active === 5) {
      const aroundLayer = layerRole(save.mission3Placements?.around);
      const aroundPart = selectedParts.find((item) => item.key === aroundLayer);
      return <div className={styles.buildObjectDetail}>
        <figure><img src={asset("mission3/clay-object-v1.png")} alt="ดินน้ำมันสีส้มห่อด้วยกระดาษทิชชูสำหรับใช้เป็นสิ่งของจำลอง" /><figcaption>สิ่งของจำลอง: ดินน้ำมันห่อทิชชู</figcaption></figure>
        <section>
          <span className={styles.buildAnswerBadge}>วัสดุรอบสิ่งของของทีม</span>
          <div className={styles.buildAroundMaterial}>{aroundPart?.material && <img src={asset(`materials/${aroundPart.material.image}`)} alt="" />}<span><small>{aroundPart?.label ?? "ส่วนที่ทีมเลือก"}</small><b>{aroundPart?.material?.name ?? "ยังไม่ได้เลือกวัสดุ"}</b></span></div>
          <ol><li>ห่อดินน้ำมันด้วยทิชชูให้มองเห็นรอยเปลี่ยนแปลงหลังทดสอบได้</li><li>วางดินน้ำมันไว้กลางกล่อง</li><li>จัด <b>{aroundPart?.material?.name ?? "วัสดุของทีม"}</b> รอบสิ่งของ โดยไม่กดดินน้ำมันจนเสียรูป</li></ol>
        </section>
      </div>;
    }
    return <div className={styles.buildFinalCheck}>
      <img src={asset("mission3/final-inspection-v1.png")} alt="กล่องที่ปิดเรียบร้อยพร้อมแว่นขยายสำหรับตรวจงาน" />
      <ul>
        <li>กล่องมีขนาดประมาณ 8 × 8 × 8 ซม. และตั้งได้ตรง</li>
        <li>ชั้นทั้ง 3 อยู่ตามตำแหน่งที่ทีมออกแบบไว้</li>
        <li>ดินน้ำมันอยู่กลางกล่องและไม่ถูกกดจนเสียรูป</li>
        <li>รอยต่อแน่น เทปและกาวไม่ยื่น ไม่มีขอบแหลม</li>
        <li>ปิดฝากล่องและติดชื่อทีมให้เรียบร้อย</li>
        <li>เก็บเศษวัสดุและอุปกรณ์คืนครู ก่อนนำกล่องไปทดสอบ</li>
      </ul>
    </div>;
  };

  return <div className={`${styles.screen} ${styles.guidedScreen}`}>
    <ScreenHeader title="สร้างตามขั้นตอนทีละข้อ" subtitle="เปิดหน้านี้ไว้ระหว่างสร้าง ไม่ต้องจำขั้นตอนเอง" onBack={onBack} />
    <main className={styles.buildLayout}>
      <aside className={styles.buildSteps}>{steps.map((step, index) => <button key={step.id} type="button" className={index === active ? styles.buildActive : completed[step.id] ? styles.buildDone : ""} onClick={() => setActive(index)}><i>{completed[step.id] ? "✓" : index + 1}</i><span><b>{step.title}</b><small>{completed[step.id] ? "ทำเสร็จแล้ว" : "แตะเพื่อเปิด"}</small></span></button>)}</aside>
      <section className={styles.buildCard}>
        <header className={styles.buildCardHeader}><span>ขั้นที่ {active + 1} จาก {steps.length}</span><i><AppIcon name={steps[active].icon} /></i><div><h2>{steps[active].title}</h2><p>{steps[active].summary}</p></div></header>
        <div className={styles.buildDetailBody}>{renderBuildDetail()}</div>
        <footer className={styles.buildCardFooter}><small><AppIcon name="shield" /> ทำงานบนโต๊ะและขอให้ครูช่วยเมื่อวัสดุตัดยาก</small><button className="button button-orange" type="button" onClick={markDone}>{completed[steps[active].id] ? "เปิดดูหรือทำซ้ำอีกครั้ง ✓" : "ทำขั้นนี้เสร็จแล้ว ✓"}</button></footer>
      </section>
    </main>
    <footer className={styles.footer}><span className={ready ? styles.readyText : ""}>{ready ? "✓ สร้างครบทุกขั้นแล้ว พร้อมสรุปคำตอบของทีม" : `ทำเสร็จแล้ว ${doneCount}/${steps.length} ขั้น`}</span><button className="button button-orange" type="button" disabled={!ready} onClick={onNext}>สรุปคำตอบทีม ›</button></footer>
  </div>;
}

function MissionThreeReason({ save, onPatch, onComplete, onBack }: { save: GameSave; onPatch: (next: Partial<GameSave>) => void; onComplete: () => void; onBack: () => void }) {
  const reasons = save.mission3Reasons ?? {};
  const ready = ROLE_DEFINITIONS.every((role) => reasons[role.key]) && Boolean(reasons.reuse);
  const chooseReason = (question: string, value: string) => onPatch({ mission3Reasons: { ...reasons, [question]: value } });
  const reuseRole = ROLE_DEFINITIONS.find((role) => save.mission3Reuse?.[role.key]);
  const reuseMaterial = materialById(save.mission3ReuseMaterial || (reuseRole ? save.mission3Selections?.[reuseRole.key] : ""));

  return <div className={`${styles.screen} ${styles.guidedScreen}`}>
    <ScreenHeader title="บัตรสรุปสั้น ๆ ของทีม" subtitle="ตอบให้ครบ 4 ข้อ โดยใช้สิ่งที่ทีมทดลองและเลือกไว้ก่อนหน้า" onBack={onBack} />
    <main className={styles.groupSummary}>
      <section className={styles.reasonChoices}>{ROLE_DEFINITIONS.map((role) => {
        const material = materialById(save.mission3Selections?.[role.key]);
        return <article key={role.key}><header><i><AppIcon name={role.icon} /></i><div><span>{role.label}</span><h2>{material?.name}</h2><small>หลักฐาน: {material ? evidenceFor(save, material.id, role.evidence) : "—"}</small></div></header><p>ทีมเลือกวัสดุนี้ เพราะผลทดลองแสดงว่า…</p><div>{REASON_OPTIONS.map((option) => <button key={option.value} type="button" aria-pressed={reasons[role.key] === option.value} className={reasons[role.key] === option.value ? styles.reasonSelected : ""} onClick={() => chooseReason(role.key, option.value)}>{option.label}</button>)}</div></article>;
      })}
        <article className={styles.reuseReasonCard}>
          <header><i><AppIcon name="recycle" /></i><div><span>วัสดุเหลือใช้</span><h2>{reuseMaterial?.name ?? "ยังไม่ได้เลือกวัสดุ"}</h2><small>ย้อนดูสิ่งที่ทีมเลือกไว้ในห้องวัสดุ</small></div></header>
          <p>ทีมเลือกใช้วัสดุเหลือใช้ทำส่วนใด?</p>
          <div>{ROLE_DEFINITIONS.map((role) => {
            const value = `part-${role.key}`;
            return <button key={role.key} type="button" aria-pressed={reasons.reuse === value} className={reasons.reuse === value ? styles.reasonSelected : ""} onClick={() => chooseReason("reuse", value)}>{role.label}</button>;
          })}</div>
        </article>
      </section>
    </main>
    <footer className={styles.footer}><span className={ready ? styles.readyText : ""}>{ready ? "✓ ตอบคำถามกลุ่มครบทั้ง 4 ข้อแล้ว" : "ตอบคำถามให้ครบทั้ง 4 ข้อ"}</span><button className="button button-orange" type="button" disabled={!ready} onClick={onComplete}>บันทึกและจบภารกิจ ›</button></footer>
  </div>;
}

function MissionThreeComplete({ save, onFinish }: { save: GameSave; onFinish: () => void }) {
  const reuseRole = ROLE_DEFINITIONS.find((role) => save.mission3Reuse?.[role.key]);
  return <div className={`${styles.screen} ${styles.completeScreen}`}>
    <section className={styles.completeCard}>
      <div className={styles.completeMedal}><AppIcon name="package" /></div><span className={styles.completePill}>ภารกิจที่ 3 สำเร็จ</span><h1>ทีมสร้างกล่องตามแบบสำเร็จแล้ว!</h1><p>ทีมเลือกวัสดุจากหลักฐาน จัดวางใน 3 ตำแหน่ง และบันทึกคำตอบร่วมกันเรียบร้อย</p>
      <div className={styles.completeGrid}><article><b>ขนาดกล่องที่กำหนด</b><span>8 × 8 × 8 ซม.</span></article><article><b>วัสดุเหลือใช้</b><span>{reuseRole ? materialById(save.mission3ReuseMaterial || save.mission3Selections?.[reuseRole.key])?.name : "บันทึกแล้ว"}</span></article><article><b>ขั้นต่อไป</b><span>ทดสอบแรงกด แรงกระแทก และน้ำ</span></article></div>
      <div className={styles.nextMission}><div><AppIcon name="hammer" /></div><span><b>ภารกิจที่ 4 จะให้คำตอบ</b><small>ตำแหน่งที่ทีมเลือกช่วยป้องกันกล่องและสิ่งของได้ดีเพียงใด</small></span><strong>→</strong></div>
      <button className="button button-orange" type="button" onClick={onFinish}>กลับเส้นทาง 5 ภารกิจ ›</button>
    </section>
  </div>;
}

export function MissionThreeScreen({ stage, save, onPatch, onBack, onNext, onComplete, onFinish }: MissionThreeProps) {
  if (stage === "mission3Review") return <MissionThreeReview onBack={onBack} onNext={() => onNext("mission3Question")} />;
  if (stage === "mission3Question") return <MissionThreeQuestion onBack={onBack} onNext={() => onNext("mission3Intro")} />;
  if (stage === "mission3Intro") return <MissionThreeIntro onBack={onBack} onNext={() => onNext("mission3Data")} />;
  if (stage === "mission3Data") return <MissionThreeData save={save} onBack={onBack} onNext={() => onNext("mission3Parts")} />;
  if (stage === "mission3Parts") return <MissionThreeParts onBack={onBack} onNext={() => onNext("mission3Materials")} />;
  if (stage === "mission3Materials") return <MissionThreeMaterials save={save} onPatch={onPatch} onBack={onBack} onNext={() => onNext("mission3Design")} />;
  if (stage === "mission3Design") return <MissionThreeDesign save={save} onPatch={onPatch} onBack={onBack} onNext={() => onNext("mission3Build")} />;
  if (stage === "mission3Build") return <MissionThreeBuild save={save} onPatch={onPatch} onBack={onBack} onNext={() => onNext("mission3Reason")} />;
  if (stage === "mission3Reason") return <MissionThreeReason save={save} onPatch={onPatch} onBack={onBack} onComplete={onComplete} />;
  return <MissionThreeComplete save={save} onFinish={onFinish} />;
}
