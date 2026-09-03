"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import styles from "./MissionOverview.module.css";

export type MissionNumber = 1 | 2;
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Mission = {
  id: 1 | 2 | 3 | 4 | 5;
  title: string;
  short: string;
  color: string;
  icon: string;
  outsideSim?: boolean;
  outsideDescription?: string;
};

const MISSIONS: Mission[] = [
  { id: 1, title: "ไขปริศนากล่องพัสดุเสียหาย", short: "สืบร่องรอยและค้นหาสาเหตุ", color: "#ff7a20", icon: "🔎" },
  { id: 2, title: "สำรวจ 3 สมบัติลับของวัสดุ", short: "ทดลองแรงกด แรงกระแทก และน้ำ", color: "#f5b900", icon: "🧪" },
  { id: 3, title: "ออกแบบและสร้างกล่องพัสดุ", short: "วางแผน เลือกวัสดุ และลงมือสร้าง", color: "#16aaa9", icon: "✏️" },
  { id: 4, title: "ทดสอบกล่อง ค้นหาจุดอ่อน และปรับปรุง", short: "ลงมือทดสอบจริง บันทึกหลักฐาน แล้วปรับปรุง", color: "#8f57db", icon: "🛠️", outsideSim: true, outsideDescription: "นำกล่องที่ทีมสร้างไปทดสอบจริงตามเงื่อนไขที่กำหนด สังเกตและบันทึกหลักฐานจากแรงกด แรงกระแทก และน้ำ แล้วใช้หลักฐานค้นหาจุดอ่อนเพื่อปรับปรุงกล่อง" },
  { id: 5, title: "พิสูจน์กล่องพัสดุรุ่นปรับปรุง", short: "ทดสอบจริงอีกครั้ง เปรียบเทียบ และสรุปผล", color: "#55a92e", icon: "🏆", outsideSim: true, outsideDescription: "นำกล่องรุ่นปรับปรุงไปทดสอบจริงอีกครั้งด้วยเงื่อนไขเดิม เปรียบเทียบหลักฐานก่อนและหลังการปรับปรุง แล้วสรุปว่ากล่องแข็งแรง ป้องกันสิ่งของ น้ำหนักเบา และประหยัดขึ้นอย่างไร" },
];

export function MissionOverview({ mission2Unlocked, mission1Answer, animateMission2Unlock, onUnlockAnimationDone, onBack, onSelect }: {
  mission2Unlocked: boolean;
  mission1Answer?: string;
  animateMission2Unlock: boolean;
  onUnlockAnimationDone: () => void;
  onBack: () => void;
  onSelect: (mission: MissionNumber) => void;
}) {
  const [lockedMission, setLockedMission] = useState<Mission | null>(null);

  useEffect(() => {
    if (!animateMission2Unlock) return;
    const timer = window.setTimeout(onUnlockAnimationDone, 3200);
    return () => window.clearTimeout(timer);
  }, [animateMission2Unlock, onUnlockAnimationDone]);

  return (
    <div className={`screen ${styles.screen}`}>
      <div className={styles.clouds} aria-hidden="true"><i /><i /><i /></div>
      <button className={styles.back} type="button" onClick={onBack}>‹ กลับหน้าปก</button>

      <header className={styles.header}>
        <span>ภารกิจออกแบบกล่องแกร่ง</span>
        <h1>เส้นทาง 5 ภารกิจ</h1>
        <p><b>คำถามใหญ่ของเรา</b> เราจะเลือกและใช้วัสดุอย่างไร เพื่อสร้างกล่องพัสดุที่แข็งแรง ป้องกันสิ่งของ น้ำหนักเบา และประหยัด โดยมีหลักฐานสนับสนุน?</p>
      </header>

      {mission1Answer && <aside className={styles.progressAnswer} aria-label="คำตอบสะสมจากภารกิจที่ 1">
        <b>คำตอบที่สะสมได้จากภารกิจที่ 1</b>
        <span>{mission1Answer}</span>
      </aside>}

      <main className={styles.journey} aria-label="เส้นทางกิจกรรมสร้างกล่องแกร่ง 5 ภารกิจ">
        <svg className={styles.road} viewBox="0 0 1200 330" preserveAspectRatio="none" aria-hidden="true">
          <path className={styles.roadEdge} d="M-40 200 C100 320 180 72 320 190 S515 315 625 165 S820 45 930 178 S1090 310 1240 135" />
          <path className={styles.roadCenter} d="M-40 200 C100 320 180 72 320 190 S515 315 625 165 S820 45 930 178 S1090 310 1240 135" />
        </svg>

        <div className={styles.missions}>
          {MISSIONS.map((mission) => {
            const unlocked = mission.id === 1 || (mission.id === 2 && mission2Unlocked);
            const isUnlocking = mission.id === 2 && animateMission2Unlock;
            return <article
              key={mission.id}
              className={`${styles.mission} ${styles[`mission${mission.id}`]} ${unlocked ? styles.unlocked : styles.locked} ${isUnlocking ? styles.unlocking : ""}`}
              style={{ "--mission-color": mission.color } as CSSProperties}
            >
              <button
                type="button"
                aria-label={`${unlocked ? "เข้าสู่" : mission.outsideSim ? "ดูคำแนะนำกิจกรรมนอก Simulation" : "ภารกิจถูกล็อก"} ภารกิจที่ ${mission.id} ${mission.title}`}
                onClick={() => unlocked ? onSelect(mission.id as MissionNumber) : setLockedMission(mission)}
              >
                <span className={styles.number}>{mission.id}</span>
                <span className={styles.picture} aria-hidden="true">
                  {mission.id === 1 && <img src={`${BASE_PATH}/assets/inspection/damaged_box_preview.png`} alt="" />}
                  {mission.id === 2 && <img className={styles.testIcon} src={`${BASE_PATH}/assets/menu/mission-2-material-tests.png`} alt="" />}
                  {mission.id >= 3 && <em>{mission.icon}</em>}
                </span>
                {!unlocked && <span className={`${styles.lockIcon} ${mission.outsideSim ? styles.outsideIcon : ""}`} aria-hidden="true">{mission.outsideSim ? "!" : "🔒"}</span>}
                {isUnlocking && <span className={styles.openLock} aria-hidden="true">🔓</span>}
              </button>
              <div className={styles.label}>
                <b>ภารกิจที่ {mission.id}</b>
                <strong>{mission.title}</strong>
                <small>{mission.short}</small>
                <span>{isUnlocking ? "ปลดล็อกแล้ว!" : unlocked ? "กดเพื่อเริ่มภารกิจ ›" : mission.outsideSim ? "กิจกรรมนอก Simulation · กดดูรายละเอียด" : "ยังไม่ปลดล็อก"}</span>
              </div>
            </article>;
          })}
        </div>
      </main>

      <footer className={styles.footer}>
        <span><b>{mission2Unlocked ? 2 : 1}</b> ภารกิจพร้อมเล่น</span>
        <p>ทำภารกิจตามลำดับ เมื่อผ่านแล้วด่านถัดไปจะปลดล็อก!</p>
      </footer>

      {animateMission2Unlock && (
        <div className={styles.unlockCelebration} role="status" aria-live="assertive">
          <span aria-hidden="true">🔓</span>
          <div><b>ปลดล็อกแล้ว!</b><small>ภารกิจที่ 2 พร้อมเล่น</small></div>
        </div>
      )}

      {lockedMission && (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setLockedMission(null)}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="locked-title" onClick={(event) => event.stopPropagation()}>
            <div className={lockedMission.outsideSim ? styles.outsideModalIcon : ""} aria-hidden="true">{lockedMission.outsideSim ? "!" : "🔒"}</div>
            <h2 id="locked-title">{lockedMission.outsideSim ? "ภารกิจนี้ลงมือทำนอก Simulation" : "ภารกิจนี้ยังล็อกอยู่นะ"}</h2>
            {lockedMission.outsideSim
              ? <p><b>ภารกิจที่ {lockedMission.id} เป็นการทดสอบกล่องจริงร่วมกับครูและทีม</b><br />{lockedMission.outsideDescription}<br /><small>ทำภารกิจที่ 1–3 ให้เสร็จเพื่อเตรียมความรู้ แบบกล่อง และแผนการทดสอบให้พร้อม</small></p>
              : <p>ต้องผ่าน <b>ภารกิจที่ {lockedMission.id - 1}</b> ก่อน<br />แล้วภารกิจที่ {lockedMission.id} จะปลดล็อกทันที!</p>}
            <button className="button button-orange" type="button" onClick={() => setLockedMission(null)}>เข้าใจแล้ว</button>
          </section>
        </div>
      )}
    </div>
  );
}
