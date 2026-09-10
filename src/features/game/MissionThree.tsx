"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameSave, MissionThreeDesign } from "./data";
import { LAB_MATERIALS } from "./labs";
import styles from "./MissionThree.module.css";

export type MissionThreeStage = "mission3Intro" | "mission3Data" | "mission3Materials" | "mission3Design" | "mission3Reason" | "mission3Complete";

type MissionThreeProps = {
  stage: MissionThreeStage;
  save: GameSave;
  onPatch: (next: Partial<GameSave>) => void;
  onBack: () => void;
  onNext: (stage: MissionThreeStage) => void;
  onComplete: () => void;
  onFinish: () => void;
};

const ROLE_DEFINITIONS = [
  { key: "structure", label: "โครงกล่อง", icon: "▦", color: "blue", hint: "รับแรงกด ไม่ยุบง่าย", evidence: "compression" },
  { key: "impact", label: "วัสดุกันกระแทก", icon: "🥚", color: "purple", hint: "ลดความเสียหายของสิ่งของ", evidence: "impact" },
  { key: "water", label: "ชั้นป้องกันน้ำ", icon: "💧", color: "cyan", hint: "ลดการเปียกและการซึม", evidence: "water" },
  { key: "filler", label: "วัสดุเติมช่องว่าง", icon: "✦", color: "yellow", hint: "ลดการเคลื่อนที่ของของด้านใน", evidence: "impact" },
  { key: "joints", label: "จุดเชื่อมต่อ/ปิดฝากล่อง", icon: "⌁", color: "green", hint: "ยึดส่วนประกอบให้คงรูป", evidence: "compression" },
] as const;

const GOALS = [
  ["📦", "กล่องไม่ยุบง่าย"],
  ["🛡️", "ช่วยกันกระแทก"],
  ["💧", "ช่วยกันเปียก"],
  ["♻️", "ใช้วัสดุเก่าให้คุ้มค่า"],
] as const;

const STEPS = ["รับภารกิจ", "อ่านหลักฐาน", "เลือกตามหน้าที่", "ออกแบบสามมิติ", "บันทึกเหตุผล", "สรุปและไปทดสอบจริง"] as const;

function asset(path: string) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${base}/assets/${path}`;
}

function formatCompression(save: GameSave, materialId: string) {
  const result = save.compressionResults?.[materialId];
  if (!result) return "ยังไม่มีผล";
  return `ยุบ ${result.deformationMm ?? result.measurements?.at(-1) ?? 0} มม.`;
}

function formatImpact(save: GameSave, materialId: string) {
  const result = save.impactResults?.[materialId];
  if (!result) return "ยังไม่มีผล";
  return ({ none: "เสียหายน้อยมาก", slight: "เสียหายเล็กน้อย", much: "เสียหายมาก" } as const)[result.observation];
}

function formatWater(save: GameSave, materialId: string) {
  const result = save.absorptionResults?.[materialId];
  return result ? `ดูดซับ ${result.absorbed} หน่วย` : "ยังไม่มีผล";
}

function evidenceFor(save: GameSave, materialId: string, evidence: (typeof ROLE_DEFINITIONS)[number]["evidence"]) {
  if (evidence === "compression") return formatCompression(save, materialId);
  if (evidence === "water") return formatWater(save, materialId);
  return formatImpact(save, materialId);
}

function materialById(id?: string) {
  return LAB_MATERIALS.find((material) => material.id === id);
}

function MissionThreeProgress({ active }: { active: number }) {
  const [expanded, setExpanded] = useState(true);
  const stepLabel = STEPS[active - 1] ?? STEPS[0];

  useEffect(() => {
    if (!expanded) return;
    const timer = window.setTimeout(() => setExpanded(false), 3800);
    return () => window.clearTimeout(timer);
  }, [active, expanded]);

  return <aside className={`${styles.missionProgress} ${expanded ? "" : styles.progressCollapsed}`} role="status" aria-label={`ภารกิจที่ 3 ขั้นที่ ${active} จาก 6 ${stepLabel}`}>
    {expanded ? <div className={styles.progressDetails}>
      <div className={styles.progressHeading}><span>ภารกิจที่ 3</span><b>ขั้นที่ {active}/6</b></div>
      <strong><span aria-hidden="true">📦</span>{stepLabel}</strong>
      <div className={styles.progressTrack} role="progressbar" aria-label="ความคืบหน้าภารกิจที่ 3" aria-valuemin={1} aria-valuemax={6} aria-valuenow={active}>
        <i style={{ width: `${Math.round((active / STEPS.length) * 100)}%` }} />
      </div>
    </div> : <button className={styles.progressToggle} type="button" aria-label={`เปิดดูความคืบหน้า ขั้นที่ ${active} จาก 6`} onClick={() => setExpanded(true)}>
      <span aria-hidden="true">•••</span>
    </button>}
  </aside>;
}

function ScreenHeader({ step, title, subtitle, onBack, centered = false }: { step: number; title: string; subtitle: string; onBack: () => void; centered?: boolean }) {
  return <>
    <button className={styles.back} type="button" onClick={onBack}>‹ ย้อนกลับ</button>
    <header className={`${styles.header} ${centered ? styles.centeredHeader : ""}`}>
      <div>{!centered && <span>ภารกิจที่ 3 · ออกแบบและสร้าง</span>}<h1>{title}</h1><p>{subtitle}</p></div>
      <div className={styles.headerBadge}>ขั้นที่ <b>{step}/6</b></div>
    </header>
    <MissionThreeProgress active={step} />
  </>;
}

function MissionThreeIntro({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [showGoals, setShowGoals] = useState(false);
  return <div className={`screen mission-briefing-screen ${styles.welcomeScreen}`}>
    <img className="mission-route-bg" src={asset("menu/cover.png")} alt="" />
    <button className="mission-briefing-back" type="button" onClick={() => showGoals ? setShowGoals(false) : onBack()}>‹ {showGoals ? "ย้อนกลับ" : "กลับหน้าภารกิจ"}</button>
    <MissionThreeProgress active={1} />
    <main key={showGoals ? "goals" : "welcome"} className={`mission-briefing-card ${styles.welcomeCard} ${showGoals ? styles.goalsCard : ""}`}>
      {!showGoals ? <>
        <div className="mission-briefing-illustration" aria-hidden="true">
          <img className="mission-briefing-box" src={asset("menu/mission-briefing-box.png")} alt="" />
          <span className="mission-briefing-search">✏️</span>
        </div>
        <span className={styles.welcomeLabel}>ภารกิจที่ 3</span>
        <h1>นักออกแบบกล่องพัสดุ</h1>
        <p className={styles.welcomeCopy}>มาเลือกวัสดุและออกแบบกล่อง<br />ให้ของข้างในปลอดภัยกัน!</p>
        <button className={`button button-orange mission-briefing-start ${styles.welcomeStart}`} type="button" onClick={() => setShowGoals(true)}>รับภารกิจ <b aria-hidden="true"><span>›</span></b></button>
      </> : <>
        <span className={styles.welcomeLabel}>เป้าหมายของทีมเรา</span>
        <h1>กล่องของเราต้องช่วยอะไรบ้าง?</h1>
        <div className={styles.goalTiles}>{GOALS.map(([icon, label]) => <div key={label}><span aria-hidden="true">{icon}</span><b>{label}</b></div>)}</div>
        <p className={styles.firstAction}>เริ่มจากดูผลทดลองของทีม<br />แล้วค่อยเลือกวัสดุมาออกแบบกล่อง</p>
        <button className={`button button-orange mission-briefing-start ${styles.welcomeStart}`} type="button" onClick={onNext}>ไปดูผลทดลอง <b aria-hidden="true"><span>›</span></b></button>
        <p className={styles.buildLater}>ออกแบบในเกม แล้วนำไปสร้างกล่องจริงกับครู</p>
      </>}
    </main>
  </div>;
}

function MissionThreeData({ save, onNext, onBack }: { save: GameSave; onNext: () => void; onBack: () => void }) {
  const resultState = (value: string) => value === "ยังไม่มีผล" ? <span className={styles.resultEmpty}>รอผลทดลอง</span> : <span className={styles.resultValue}>{value}</span>;
  return <div className={`${styles.screen} ${styles.dataScreen}`}>
    <ScreenHeader step={2} centered title="ผลการทดลองของทีมเรา" subtitle="ดูผลจากภารกิจที่ 2 แล้วคุยกันว่า วัสดุไหนช่วยกล่องของเราได้" onBack={onBack} />
    <main className={styles.dataLayout}>
      <aside className={styles.dataGuide}>
        <div className={styles.coachHeader}>
          <div className={styles.coachAvatar}><img src={asset("menu/mission-briefing-box.png")} alt="มาสคอตกล่องนักสืบ" /></div>
          <div><span>ผู้ช่วยนักสืบ</span><b>เจ้ากล่องชวนคิด</b></div>
        </div>
        <div className={styles.coachSpeech}><b>อ่านให้ครบ 3 ช่อง</b><p>แล้วใช้ผลทดลองช่วยกันเลือกวัสดุ อย่าเพิ่งเลือกจากสีหรือความชอบนะ</p></div>
        <div className={styles.readSteps}>
          <div className={styles.readStep}><i className={styles.stepBlue}>1</i><span><b>กด</b><small>ยุบตัวน้อย เหมาะทำโครง</small></span></div>
          <div className={styles.readStep}><i className={styles.stepPurple}>2</i><span><b>ตก</b><small>เสียหายน้อย เหมาะกันกระแทก</small></span></div>
          <div className={styles.readStep}><i className={styles.stepCyan}>3</i><span><b>น้ำ</b><small>ดูดซับน้อย ช่วยกันเปียก</small></span></div>
        </div>
        <div className={styles.coachTip}><strong>ชวนคุยกับเพื่อน</strong><span>วัสดุไหนเด่นเรื่องไหนบ้าง?</span></div>
      </aside>
      <section className={styles.tableCard} aria-label="ตารางผลการทดลองจากภารกิจที่ 2">
        <div className={styles.tableTitle}>
          <div><span className={styles.boardKicker}>🔬 ผลจากห้องทดลอง</span><b>สมุดหลักฐานของทีม</b><small>ดูผล → คุยกัน → เลือกวัสดุ</small></div>
          <div className={styles.resultBadge}><b>{LAB_MATERIALS.length}</b><span>วัสดุให้เลือก</span></div>
        </div>
        <div className={styles.dataLegend} aria-label="วิธีอ่านหัวตาราง">
          <span className={styles.legendBlue}>▦ <b>กด</b><small>โครงกล่อง</small></span>
          <span className={styles.legendPurple}>🥚 <b>ตก</b><small>กันกระแทก</small></span>
          <span className={styles.legendCyan}>💧 <b>น้ำ</b><small>กันเปียก</small></span>
        </div>
        <div className={styles.tableScroll}><table><thead><tr><th>วัสดุ</th><th><span>▦</span> กด<small>ยุบตัวน้อยดีกว่า</small></th><th><span>🥚</span> ตก<small>เสียหายน้อยดีกว่า</small></th><th><span>💧</span> น้ำ<small>ซึมน้อยดีกว่า</small></th></tr></thead><tbody>{LAB_MATERIALS.map((material) => <tr key={material.id}>
          <th><img src={asset(`materials/${material.image}`)} alt="" /><span>{material.name}</span></th><td>{resultState(formatCompression(save, material.id))}</td><td>{resultState(formatImpact(save, material.id))}</td><td>{resultState(formatWater(save, material.id))}</td>
        </tr>)}</tbody></table></div>
        <div className={styles.tableCaption}><strong>💡 ภารกิจตอนนี้</strong><span>หาหลักฐานมาช่วยตอบ: วัสดุไหนเหมาะทำโครง และวัสดุไหนช่วยกันน้ำ?</span></div>
      </section>
    </main>
    <footer className={styles.footer}><div className={styles.footerInstruction}><i>2</i><span><b>คิดจากหลักฐาน</b><small>พร้อมแล้วไปเลือกวัสดุตามหน้าที่</small></span></div><button className="button button-orange" type="button" onClick={onNext}>ไปเลือกวัสดุ ›</button></footer>
  </div>;
}

function MissionThreeMaterials({ save, onPatch, onNext, onBack }: { save: GameSave; onPatch: (next: Partial<GameSave>) => void; onNext: () => void; onBack: () => void }) {
  const selections = save.mission3Selections ?? {};
  const reuse = save.mission3Reuse ?? {};
  const complete = ROLE_DEFINITIONS.every((role) => Boolean(selections[role.key]));
  const updateSelection = (key: string, value: string) => onPatch({ mission3Selections: { ...selections, [key]: value } });
  const toggleReuse = (key: string) => onPatch({ mission3Reuse: { ...reuse, [key]: !reuse[key] } });
  return <div className={`${styles.screen} ${styles.materialScreen}`}>
    <ScreenHeader step={3} title="เลือกวัสดุตามหน้าที่" subtitle="วัสดุหนึ่งชนิดอาจมีหลายหน้าที่ได้ แต่เหตุผลต้องอ้างอิงหลักฐานให้ตรงกับงาน" onBack={onBack} />
    <main className={styles.materialLayout}>
      <section className={styles.materialRoles}>
        <div className={styles.sectionTitle}><b>จับคู่หน้าที่ของกล่อง</b><small>เลือกให้ครบ {Object.values(selections).filter(Boolean).length}/{ROLE_DEFINITIONS.length} หน้าที่</small></div>
        <div className={styles.roleGrid}>{ROLE_DEFINITIONS.map((role) => {
          const selected = materialById(selections[role.key]);
          return <article key={role.key} className={`${styles.roleCard} ${styles[`role${role.color}`]}`}>
            <div className={styles.roleIcon}>{role.icon}</div><div className={styles.roleCopy}><b>{role.label}</b><span>{role.hint}</span></div>
            <select aria-label={`เลือกวัสดุสำหรับ${role.label}`} value={selections[role.key] ?? ""} onChange={(event) => updateSelection(role.key, event.target.value)}><option value="">เลือกวัสดุ…</option>{LAB_MATERIALS.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select>
            <div className={styles.roleEvidence}>{selected ? <><img src={asset(`materials/${selected.image}`)} alt="" /><span><b>{evidenceFor(save, selected.id, role.evidence)}</b><small>หลักฐานที่เกี่ยวข้องกับหน้าที่นี้</small></span></> : <span className={styles.waiting}>เลือกวัสดุเพื่อดูหลักฐาน</span>}</div>
            {selected && <label className={styles.reuseCheck}><input type="checkbox" checked={Boolean(reuse[role.key])} onChange={() => toggleReuse(role.key)} /><span>เป็นวัสดุที่ใช้แล้ว แต่ตรวจสภาพแล้วว่าเหมาะสม</span></label>}
          </article>;
        })}</div>
      </section>
      <aside className={styles.materialEvidence}>
        <div className={styles.sectionTitle}><b>แผงหลักฐาน</b><small>กดดูผลก่อนตัดสินใจ</small></div>
        <div className={styles.evidenceMiniList}>{LAB_MATERIALS.map((material) => <article key={material.id}><img src={asset(`materials/${material.image}`)} alt="" /><div><b>{material.name}</b><span>{formatCompression(save, material.id)} · {formatImpact(save, material.id)}</span><small>{formatWater(save, material.id)}</small></div></article>)}</div>
        <div className={styles.reuseTip}><b>♻️ วัสดุใช้แล้ว</b><p>ใช้ได้เมื่อสะอาด ไม่ชื้น ไม่ขึ้นรา ไม่ฉีกขาด และยังปลอดภัยต่อการตัด พับ หรือประกอบ</p></div>
      </aside>
    </main>
    <footer className={styles.footer}><span className={complete ? styles.readyText : ""}>{complete ? "✓ เลือกวัสดุครบทุกหน้าที่แล้ว" : "เลือกวัสดุให้ครบทุกหน้าที่ก่อน"}</span><button className="button button-orange" type="button" disabled={!complete} onClick={onNext}>ไปออกแบบสามมิติ ›</button></footer>
  </div>;
}

function BoxBlueprint({ save, activePart, onSelect }: { save: GameSave; activePart: string; onSelect: (key: string) => void }) {
  const selected = save.mission3Selections ?? {};
  const dimensions = save.mission3Design ?? {};
  return <div className={styles.blueprintWrap}>
    <div className={styles.blueprintTag}>แบบสามมิติของทีม <span>แตะส่วนต่าง ๆ เพื่อดูหน้าที่</span></div>
    <svg className={styles.blueprint} viewBox="0 0 560 300" role="img" aria-label="ภาพร่างสามมิติของกล่องพัสดุ">
      <defs><linearGradient id="box-front" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#b5e9e1" /><stop offset="1" stopColor="#61c5c1" /></linearGradient><linearGradient id="box-side" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#8eddd6" /><stop offset="1" stopColor="#36a8ae" /></linearGradient><linearGradient id="box-top" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#f5ffff" /><stop offset="1" stopColor="#c5eeee" /></linearGradient></defs>
      <path className={styles.shadow} d="M121 259 Q277 292 459 250 Q386 281 181 279Z" />
      <g onClick={() => onSelect("structure")} className={`${styles.svgPart} ${activePart === "structure" ? styles.svgActive : ""}`}><path fill="url(#box-front)" d="M122 127 L352 159 L352 252 L122 219Z" /><path fill="url(#box-side)" d="M352 159 L457 108 L457 203 L352 252Z" /><path fill="url(#box-top)" d="M122 127 L227 76 L457 108 L352 159Z" /><path className={styles.innerLine} d="M151 130 L351 158 L351 225 L151 197Z" /></g>
      <g onClick={() => onSelect("water")} className={`${styles.svgPart} ${activePart === "water" ? styles.svgActive : ""}`}><path className={styles.layerWater} d="M138 121 L229 80 L442 110 L351 151Z" /></g>
      <g onClick={() => onSelect("impact")} className={`${styles.svgPart} ${activePart === "impact" ? styles.svgActive : ""}`}><path className={styles.layerImpact} d="M166 157 L327 180 L327 210 L166 187Z" /></g>
      <g onClick={() => onSelect("filler")} className={`${styles.svgPart} ${activePart === "filler" ? styles.svgActive : ""}`}><path className={styles.layerFiller} d="M190 180 L226 169 L257 180 L220 192Z" /><path className={styles.layerFiller} d="M272 193 L308 182 L337 193 L300 205Z" /></g>
      <path className={styles.foldLine} d="M122 127 L352 159 M352 159 L457 108 M352 159 L352 252" />
      <g className={styles.dimension}><path d="M122 238 L352 271" /><path d="M122 238 l8 -5 M122 238 l8 6 M352 271 l-8 -6 M352 271 l-8 4" /><text x="231" y="291">ยาว {dimensions.length || "—"} ซม.</text></g>
      <g className={styles.dimension}><path d="M373 263 L478 211" /><path d="M373 263 l9 -1 M373 263 l4 -8 M478 211 l-9 1 M478 211 l-4 8" /><text x="428" y="251">กว้าง {dimensions.width || "—"} ซม.</text></g>
      <g className={styles.dimension}><path d="M101 125 L101 218" /><path d="M101 125 l-4 9 M101 125 l4 9 M101 218 l-4 -9 M101 218 l4 -9" /><text x="58" y="177" transform="rotate(-90 58 177)">สูง {dimensions.height || "—"} ซม.</text></g>
      <g onClick={() => onSelect("joints")} className={`${styles.jointMarker} ${activePart === "joints" ? styles.svgActive : ""}`}><circle cx="353" cy="159" r="9" /><circle cx="353" cy="252" r="7" /><text x="367" y="150">จุดพับ/ปิดฝากล่อง</text></g>
    </svg>
    <div className={styles.blueprintLegend}>{ROLE_DEFINITIONS.map((role) => { const material = materialById(selected[role.key]); return <button key={role.key} type="button" className={activePart === role.key ? styles.legendActive : ""} onClick={() => onSelect(role.key)}><i className={styles[`swatch${role.color}`]} /><span><b>{role.label}</b><small>{material?.name ?? "ยังไม่เลือก"}</small></span></button>; })}</div>
  </div>;
}

function MissionThreeDesign({ save, onPatch, onNext, onBack }: { save: GameSave; onPatch: (next: Partial<GameSave>) => void; onNext: () => void; onBack: () => void }) {
  const design = save.mission3Design;
  const [activePart, setActivePart] = useState("structure");
  const update = (key: keyof MissionThreeDesign, value: string) => onPatch({ mission3Design: { ...design, [key]: value } });
  const ready = [design.length, design.width, design.height, design.joints, design.steps].every((value) => value?.trim());
  const active = ROLE_DEFINITIONS.find((role) => role.key === activePart) ?? ROLE_DEFINITIONS[0];
  const activeMaterial = materialById(save.mission3Selections?.[active.key]);
  return <div className={`${styles.screen} ${styles.designScreen}`}>
    <ScreenHeader step={4} title="ออกแบบสามมิติและแผนการสร้าง" subtitle="กำหนดขนาด ระบุตำแหน่งส่วนประกอบ จุดพับ และลำดับการสร้างให้ทีมทำงานตรงกัน" onBack={onBack} />
    <main className={styles.designLayout}>
      <BoxBlueprint save={save} activePart={activePart} onSelect={setActivePart} />
      <section className={styles.designControls}>
        <div className={styles.sectionTitle}><b>รายละเอียดแบบ</b><small>ดินน้ำมันมาตรฐานประมาณ 4 × 4 × 4 ซม.</small></div>
        <div className={styles.dimensionGrid}>{(["length", "width", "height"] as const).map((key) => <label key={key}><span>{key === "length" ? "ความยาว" : key === "width" ? "ความกว้าง" : "ความสูง"} (ซม.)</span><input inputMode="decimal" min="1" max="60" type="number" value={design[key]} onChange={(event) => update(key, event.target.value)} /></label>)}</div>
        <div className={styles.inspectCard}><span className={styles.inspectIcon}>{active.icon}</span><div><b>{active.label}</b><p>ใช้ <strong>{activeMaterial?.name ?? "ยังไม่เลือกวัสดุ"}</strong> · {active.hint}</p><small>{activeMaterial ? evidenceFor(save, activeMaterial.id, active.evidence) : "กลับไปเลือกวัสดุก่อน"}</small></div></div>
        <label className={styles.textField}><span>จุดพับ จุดเชื่อมต่อ และวิธีปิดฝากล่อง</span><textarea value={design.joints} maxLength={180} onChange={(event) => update("joints", event.target.value)} placeholder="เช่น พับแถบด้านข้าง 2 ซม. ใช้เทปปิดรอยต่อ และทำฝาเสียบล็อก..." /></label>
        <label className={styles.textField}><span>ลำดับขั้นตอนการสร้างและแบ่งหน้าที่</span><textarea value={design.steps} maxLength={240} onChange={(event) => update("steps", event.target.value)} placeholder="เช่น 1 ผู้วัด 2 ผู้ทำเครื่องหมาย 3 ผู้พับ 4 ผู้ประกอบ 5 ผู้ตรวจสอบ..." /></label>
      </section>
    </main>
    <footer className={styles.footer}><span className={ready ? styles.readyText : ""}>{ready ? "✓ แบบมีขนาด จุดเชื่อมต่อ และลำดับสร้างแล้ว" : "เติมขนาด จุดเชื่อมต่อ และลำดับสร้างให้ครบ"}</span><button className="button button-orange" type="button" disabled={!ready} onClick={onNext}>บันทึกเหตุผลของทีม ›</button></footer>
  </div>;
}

function MissionThreeReason({ save, onPatch, onComplete, onBack }: { save: GameSave; onPatch: (next: Partial<GameSave>) => void; onComplete: () => void; onBack: () => void }) {
  const reason = save.mission3Reason ?? "";
  const alternative = save.mission3Alternative ?? "";
  const selections = save.mission3Selections ?? {};
  const ready = reason.trim().length >= 24 && alternative.trim().length >= 12;
  const addEvidence = (text: string) => onPatch({ mission3Reason: reason ? `${reason.trim()} ${text}` : text });
  return <div className={`${styles.screen} ${styles.reasonScreen}`}>
    <ScreenHeader step={5} title="เหตุผลของทีม" subtitle="บอกให้ชัดว่าเลือกวัสดุอะไร ทำหน้าที่ใด และผลการทดลองข้อใดสนับสนุนการตัดสินใจ" onBack={onBack} />
    <main className={styles.reasonLayout}>
      <section className={styles.reasonCard}>
        <div className={styles.sectionTitle}><b>บันทึกเสียงของทีมเป็นข้อความ</b><small>เขียนด้วยภาษาของทีมได้เลย</small></div>
        <label className={styles.reasonLabel}><span>แบบที่ทีมเลือกและหลักฐานสนับสนุน</span><textarea value={reason} maxLength={600} onChange={(event) => onPatch({ mission3Reason: event.target.value })} placeholder="ทีมของเราเลือกใช้ … สำหรับ … เพราะผลจากห้องทดลอง … แสดงว่า …" /><small className={reason.trim().length >= 24 ? styles.goodHint : ""}>{reason.trim().length}/24 ตัวอักษรขั้นต่ำ</small></label>
        <div className={styles.evidenceButtons}><b>เติมหลักฐานเร็ว ๆ</b>{LAB_MATERIALS.slice(0, 5).map((material) => <button key={material.id} type="button" onClick={() => addEvidence(`${material.name}: ${formatCompression(save, material.id)}, ${formatImpact(save, material.id)}, ${formatWater(save, material.id)}.`)}>{material.name}</button>)}</div>
        <label className={styles.reasonLabel}><span>ทางเลือกอื่นที่ทีมพิจารณาก่อนเลือกแบบนี้</span><textarea value={alternative} maxLength={360} onChange={(event) => onPatch({ mission3Alternative: event.target.value })} placeholder="แบบสำรองคือ … แต่ทีมเลือกแบบนี้ เพราะ …" /><small className={alternative.trim().length >= 12 ? styles.goodHint : ""}>{alternative.trim().length}/12 ตัวอักษรขั้นต่ำ</small></label>
      </section>
      <aside className={styles.reasonSummary}>
        <div className={styles.sectionTitle}><b>การเลือกของทีม</b><small>หน้าที่ · วัสดุ · หลักฐาน</small></div>
        {ROLE_DEFINITIONS.map((role) => { const material = materialById(selections[role.key]); return <div key={role.key} className={styles.choiceRow}><i>{role.icon}</i><span><b>{role.label}</b><small>{material?.name ?? "ยังไม่เลือก"}</small></span><em>{material ? evidenceFor(save, material.id, role.evidence) : "—"}</em></div>; })}
        <div className={styles.reasonTip}>💬 ทุกส่วนไม่จำเป็นต้องใช้วัสดุชนิดเดียวกัน ให้ดูว่า “สมบัติ” สัมพันธ์กับ “หน้าที่” อย่างไร</div>
      </aside>
    </main>
    <footer className={styles.footer}><span className={ready ? styles.readyText : ""}>{ready ? "✓ เหตุผลและทางเลือกอื่นครบแล้ว" : "เขียนเหตุผลอย่างน้อย 24 ตัวอักษร และทางเลือกอื่นอย่างน้อย 12 ตัวอักษร"}</span><button className="button button-orange" type="button" disabled={!ready} onClick={onComplete}>สรุปภารกิจ ›</button></footer>
  </div>;
}

function MissionThreeComplete({ save, onFinish }: { save: GameSave; onFinish: () => void }) {
  const selectedMaterials = useMemo(() => ROLE_DEFINITIONS.map((role) => materialById(save.mission3Selections?.[role.key])?.name).filter(Boolean), [save.mission3Selections]);
  return <div className={`${styles.screen} ${styles.completeScreen}`}>
    <div className={styles.confetti} aria-hidden="true">✦　•　★　✦　•　✧　★　•</div>
    <section className={styles.completeCard}>
      <div className={styles.completeMedal}>📦</div><span className={styles.completePill}>ภารกิจที่ 3 สำเร็จ</span><h1>ทีมพร้อมสร้างกล่องต้นแบบแล้ว!</h1><p>เลือกวัสดุตามหน้าที่ ออกแบบแบบสามมิติ และใช้หลักฐานอธิบายเหตุผลเรียบร้อย</p>
      <div className={styles.completeGrid}><article><b>วัสดุที่ทีมวางแผนใช้</b><span>{[...new Set(selectedMaterials)].join(" · ") || "บันทึกแล้ว"}</span></article><article><b>ขนาดกล่อง</b><span>{save.mission3Design.length} × {save.mission3Design.width} × {save.mission3Design.height} ซม.</span></article><article><b>ขั้นต่อไปนอก Simulation</b><span>ลงมือวัด ตัด พับ ประกอบ และติดป้ายชื่อทีม</span></article></div>
      <div className={styles.nextMission}><div>🛠️</div><span><b>เชื่อมต่อภารกิจที่ 4</b><small>นำกล่องจริงไปทดสอบแรงกด แรงกระแทก และน้ำกับครู</small></span><strong>→</strong></div>
      <button className="button button-orange" type="button" onClick={onFinish}>ไปเส้นทางภารกิจที่ 4 ›</button>
    </section>
  </div>;
}

export function MissionThreeScreen({ stage, save, onPatch, onBack, onNext, onComplete, onFinish }: MissionThreeProps) {
  if (stage === "mission3Intro") return <MissionThreeIntro onBack={onBack} onNext={() => onNext("mission3Data")} />;
  if (stage === "mission3Data") return <MissionThreeData save={save} onBack={onBack} onNext={() => onNext("mission3Materials")} />;
  if (stage === "mission3Materials") return <MissionThreeMaterials save={save} onPatch={onPatch} onBack={onBack} onNext={() => onNext("mission3Design")} />;
  if (stage === "mission3Design") return <MissionThreeDesign save={save} onPatch={onPatch} onBack={onBack} onNext={() => onNext("mission3Reason")} />;
  if (stage === "mission3Reason") return <MissionThreeReason save={save} onPatch={onPatch} onBack={onBack} onComplete={onComplete} />;
  return <MissionThreeComplete save={save} onFinish={onFinish} />;
}
