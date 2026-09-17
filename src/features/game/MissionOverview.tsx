"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import styles from "./MissionOverview.module.css";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import type { MissionNumber } from "./mission-runs";

export type { MissionNumber } from "./mission-runs";

type Mission = {
  id: 1 | 2 | 3 | 4 | 5;
  title: string;
  short: string;
  color: string;
  icon: AppIconName;
  outsideSim?: boolean;
  outsideDescription?: string;
};

const MISSIONS: Mission[] = [
  { id: 1, title: "ไขปริศนากล่องพัสดุเสียหาย", short: "สืบร่องรอยและค้นหาสาเหตุ", color: "#ff7a20", icon: "search" },
  { id: 2, title: "สำรวจ 3 สมบัติลับของวัสดุ", short: "ทดลองแรงกด แรงกระแทก และน้ำ", color: "#f5b900", icon: "flask" },
  { id: 3, title: "ออกแบบและสร้างกล่องพัสดุ", short: "วางแผน เลือกวัสดุ และลงมือสร้าง", color: "#16aaa9", icon: "pencil" },
  { id: 4, title: "ทดสอบกล่อง ค้นหาจุดอ่อน และปรับปรุง", short: "ลงมือทดสอบจริง บันทึกหลักฐาน แล้วปรับปรุง", color: "#8f57db", icon: "hammer", outsideSim: true, outsideDescription: "นำกล่องที่ทีมสร้างไปทดสอบจริงตามเงื่อนไขที่กำหนด สังเกตและบันทึกหลักฐานจากแรงกด แรงกระแทก และน้ำ แล้วใช้หลักฐานค้นหาจุดอ่อนเพื่อปรับปรุงกล่อง" },
  { id: 5, title: "พิสูจน์กล่องพัสดุรุ่นปรับปรุง", short: "ทดสอบจริงอีกครั้ง เปรียบเทียบ และสรุปผล", color: "#55a92e", icon: "trophy", outsideSim: true, outsideDescription: "นำกล่องรุ่นปรับปรุงไปทดสอบจริงอีกครั้งด้วยเงื่อนไขเดิม เปรียบเทียบหลักฐานก่อนและหลังการปรับปรุง แล้วสรุปว่ากล่องแข็งแรง ป้องกันสิ่งของ และนำวัสดุที่ใช้แล้วกลับมาใช้ใหม่ได้อย่างเหมาะสมขึ้นอย่างไร" },
];

export function MissionOverview({ mission2Unlocked, mission3Unlocked, completedMissions, mission1Answer, startError, unlockingMission, onUnlockAnimationDone, onBack, onSelect, onReplay }: {
  mission2Unlocked: boolean;
  mission3Unlocked: boolean;
  completedMissions: MissionNumber[];
  mission1Answer?: string;
  startError?: string;
  unlockingMission: MissionNumber | null;
  onUnlockAnimationDone: () => void;
  onBack: () => void;
  onSelect: (mission: MissionNumber) => void;
  onReplay: (mission: MissionNumber) => void;
}) {
  const [lockedMission, setLockedMission] = useState<Mission | null>(null);
  const [completedMission, setCompletedMission] = useState<Mission | null>(null);

  useEffect(() => {
    if (!unlockingMission) return;
    const timer = window.setTimeout(onUnlockAnimationDone, 3200);
    return () => window.clearTimeout(timer);
  }, [unlockingMission, onUnlockAnimationDone]);

  return (
    <div className={`screen ${styles.screen}`}>
      <div className={styles.clouds} aria-hidden="true"><i /><i /><i /></div>
      <button className={styles.back} type="button" onClick={onBack}>‹ กลับไปเลือกทีม</button>

      <header className={styles.header}>
        <AppIcon className={styles.headerSparkles} name="sparkles" />
        <AppIcon className={styles.headerPackage} name="package" />
        <span>ภารกิจออกแบบกล่องแกร่ง</span>
        <h1>เส้นทาง 5 ภารกิจ</h1>
      </header>

      {mission1Answer && <aside className={styles.progressAnswer} aria-label="คำตอบสะสมจากภารกิจที่ 1">
        <b>คำตอบที่สะสมได้จากภารกิจที่ 1</b>
        <span>{mission1Answer}</span>
      </aside>}

      {startError && <div className={styles.startError} role="alert">{startError}</div>}

      <main className={styles.journey} aria-label="เส้นทางกิจกรรมสร้างกล่องแกร่ง 5 ภารกิจ">
        <svg className={styles.road} viewBox="0 0 1200 330" preserveAspectRatio="none" aria-hidden="true">
          <path className={styles.roadEdge} d="M-40 200 C100 320 180 72 320 190 S515 315 625 165 S820 45 930 178 S1090 310 1240 135" />
          <path className={styles.roadCenter} d="M-40 200 C100 320 180 72 320 190 S515 315 625 165 S820 45 930 178 S1090 310 1240 135" />
        </svg>

        <div className={styles.missions}>
          {MISSIONS.map((mission) => {
            const unlocked = mission.outsideSim || mission.id === 1 || (mission.id === 2 && mission2Unlocked) || (mission.id === 3 && mission3Unlocked);
            const simulationUnlocked = mission.id <= 3 && unlocked;
            const completed = mission.id <= 3 && completedMissions.includes(mission.id as MissionNumber);
            const isUnlocking = mission.id === unlockingMission;
            return <article
              key={mission.id}
              className={`${styles.mission} ${styles[`mission${mission.id}`]} ${unlocked ? styles.unlocked : styles.locked} ${isUnlocking ? styles.unlocking : ""}`}
              style={{ "--mission-color": mission.color } as CSSProperties}
            >
              <button
                type="button"
                aria-label={`${simulationUnlocked ? "เข้าสู่" : mission.outsideSim ? (unlocked ? "ดูรายละเอียดภารกิจนอก Simulation" : "ดูคำแนะนำกิจกรรมนอก Simulation") : "ภารกิจถูกล็อก"} ภารกิจที่ ${mission.id} ${mission.title}`}
                onClick={() => simulationUnlocked ? (completed ? setCompletedMission(mission) : onSelect(mission.id as MissionNumber)) : setLockedMission(mission)}
              >
                <span className={styles.number}>{mission.id}</span>
                <span className={styles.picture} aria-hidden="true">
                  <AppIcon name={mission.icon} strokeWidth={2.2} />
                </span>
                {!unlocked && <span className={`${styles.lockIcon} ${mission.outsideSim ? styles.outsideIcon : ""}`} aria-hidden="true">{mission.outsideSim ? "!" : <AppIcon name="lock" />}</span>}
                {isUnlocking && <span className={styles.openLock} aria-hidden="true"><AppIcon name="unlock" /></span>}
              </button>
              <div className={styles.label}>
                <b>ภารกิจที่ {mission.id}</b>
                <strong>{mission.title}</strong>
                <small>{mission.short}</small>
                <span>{isUnlocking ? "ปลดล็อกแล้ว!" : completed ? "ทำสำเร็จแล้ว · กดดู ›" : simulationUnlocked ? "กดเพื่อเริ่มภารกิจ ›" : mission.outsideSim ? "กิจกรรมนอก Simulation · กดดูรายละเอียด" : "ยังไม่ปลดล็อก"}</span>
              </div>
            </article>;
          })}
        </div>
      </main>

      <footer className={styles.footer}>
        <span><b>{mission3Unlocked ? 3 : mission2Unlocked ? 2 : 1}</b> ภารกิจพร้อมเล่น</span>
        <p>ทำภารกิจตามลำดับ เมื่อผ่านแล้วด่านถัดไปจะปลดล็อก!</p>
      </footer>

      {unlockingMission && (
        <div className={styles.unlockCelebration} role="status" aria-live="assertive">
          <AppIcon name="unlock" />
          <div><b>ปลดล็อกแล้ว!</b><small>ภารกิจที่ {unlockingMission} พร้อมเล่น</small></div>
        </div>
      )}

      {lockedMission && (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setLockedMission(null)}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="locked-title" onClick={(event) => event.stopPropagation()}>
            <div className={lockedMission.outsideSim ? styles.outsideModalIcon : ""} aria-hidden="true">{lockedMission.outsideSim ? "!" : <AppIcon name="lock" />}</div>
            <h2 id="locked-title">{lockedMission.outsideSim ? "ภารกิจนี้ลงมือทำนอก Simulation" : "ภารกิจนี้ยังล็อกอยู่นะ"}</h2>
            {lockedMission.outsideSim
              ? <p><b>ภารกิจที่ {lockedMission.id} เป็นการทดสอบกล่องจริงร่วมกับครูและทีม</b><br />{lockedMission.outsideDescription}<br /><small>ทำภารกิจที่ 1–3 ให้เสร็จเพื่อเตรียมความรู้ แบบกล่อง และแผนการทดสอบให้พร้อม</small></p>
              : <p>ต้องผ่าน <b>ภารกิจที่ {lockedMission.id - 1}</b> ก่อน<br />แล้วภารกิจที่ {lockedMission.id} จะปลดล็อกทันที!</p>}
            <button className="button button-orange" type="button" onClick={() => setLockedMission(null)}>เข้าใจแล้ว</button>
          </section>
        </div>
      )}

      {completedMission && (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setCompletedMission(null)}>
          <section className={`${styles.modal} ${styles.completedModal}`} role="dialog" aria-modal="true" aria-labelledby="completed-title" onClick={(event) => event.stopPropagation()}>
            <div className={styles.completedModalIcon} aria-hidden="true"><AppIcon name="trophy" /></div>
            <h2 id="completed-title">เก่งมาก! ทีมทำภารกิจที่ {completedMission.id} เสร็จแล้ว</h2>
            <p>ผลงานและคำตอบรอบเดิมถูกบันทึกไว้เรียบร้อย<br /><b>ต้องการเริ่มภารกิจนี้อีกครั้งหรือไม่?</b><br /><small>หากยืนยัน ระบบจะสร้างรอบใหม่พร้อมวันที่ใหม่ และไม่ลบข้อมูลเดิม</small></p>
            <div className={styles.modalActions}>
              <button className="button button-white" type="button" onClick={() => setCompletedMission(null)}>ย้อนกลับ</button>
              <button className="button button-orange" type="button" onClick={() => { const mission = completedMission.id as MissionNumber; setCompletedMission(null); onReplay(mission); }}>ยืนยัน เริ่มรอบใหม่</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
