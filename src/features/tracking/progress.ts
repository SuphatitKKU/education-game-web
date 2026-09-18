import type { Stage, TeamMember } from "@/features/game/data";
import { exitTicketProgress, type ExitTicketProgress } from "@/features/game/exit-ticket-progress";
import { LAB_MATERIALS, LAB_ROOMS_ENABLED, LAB_STAGES } from "@/features/game/labs";
import { STUDY_TOPICS } from "@/features/game/learning-topics";
import type { TrackedRun } from "./types";
import type { TeamOverview } from "./types";
import { missionNumberForTrackedRun } from "./run-classification";
import { missionTwoAnswerProgress } from "@/features/game/mission-runs";

export const ACTIVE_STAGE_ORDER: Stage[] = [
  "mission",
  "story",
  "inspection",
  "boxMission",
  "materials",
  "studyFocus",
  "exitTicket",
  "mission1Complete",
  "mission2Review",
  "mission2Question",
  "mission2Parts",
  "mission2Intro",
  ...(LAB_ROOMS_ENABLED ? LAB_STAGES : []),
  "comparison",
  "mission2Assessment",
  "mission2Complete",
  "mission3Review",
  "mission3Question",
  "mission3Intro",
  "mission3Data",
  "mission3Parts",
  "mission3Materials",
  "mission3Design",
  "mission3Build",
  "mission3Reason",
  "mission3Complete",
  "summary",
];

export const STAGE_LABELS: Record<Stage, string> = {
  menu: "หน้าปก",
  purpose: "คำถามใหญ่และเป้าหมาย",
  overview: "เส้นทาง 5 ภารกิจ",
  team: "จัดทีม",
  mission: "รับภารกิจและติดตามพัสดุ",
  story: "เรียนรู้จากเรื่องราว",
  inspection: "สำรวจความเสียหาย",
  boxMission: "กำหนดภารกิจของกล่อง",
  materials: "ศึกษาวัสดุ",
  studyFocus: "เลือกสิ่งที่ต้องศึกษา",
  exitTicket: "ตอบคำถามรายบุคคล",
  mission1Complete: "ทำภารกิจที่ 1 สำเร็จ",
  mission2Review: "ทบทวนหลักฐานจากภารกิจที่ 1",
  mission2Question: "คำถามสำคัญของภารกิจที่ 2",
  mission2Parts: "คาดการณ์ส่วนของกล่องจากร่องรอย",
  mission2Intro: "รับภารกิจที่ 2",
  testHub: "ห้องทดสอบ",
  compression: STUDY_TOPICS[0].title,
  absorption: STUDY_TOPICS[2].title,
  elasticity: "กิจกรรมยืดและคืนรูป (วิธีเดิม)",
  impact: STUDY_TOPICS[1].title,
  notebook: "เชื่อมโยงผลกับส่วนของกล่อง (ข้อมูลเดิม)",
  comparison: "เชื่อมโยงผลกับส่วนของกล่อง",
  recap: "ตอบคำถามร่วมกันหลังการทดลอง",
  mission2Assessment: "ตอบคำถามรายบุคคล K–P–V",
  mission2Complete: "ทำภารกิจที่ 2 สำเร็จ",
  mission3Review: "ทบทวนสิ่งที่ทำมาแล้ว",
  mission3Question: "คำถามสำคัญของภารกิจที่ 3",
  mission3Intro: "รับภารกิจที่ 3",
  mission3Data: "ผลการทดลองจากภารกิจที่ 2",
  mission3Parts: "ทบทวน 3 ส่วนของกล่อง",
  mission3Materials: "เลือกวัสดุตามหน้าที่",
  mission3Design: "จัดวางวัสดุ 3 ตำแหน่ง",
  mission3Build: "สร้างกล่องตามขั้นตอน",
  mission3Reason: "สรุปคำตอบของทีม",
  mission3Complete: "ทำภารกิจที่ 3 สำเร็จ",
  prediction: "เลือกวัสดุ",
  summary: "สรุปภารกิจ",
};

export function stageProgress(stage: Stage): number {
  if (stage === "mission1Complete" || stage === "mission2Complete" || stage === "summary") return 100;
  const index = ACTIVE_STAGE_ORDER.indexOf(stage);
  if (index < 0) return 0;
  return Math.round((index / (ACTIVE_STAGE_ORDER.length - 1)) * 100);
}

const MISSION_ONE_ORDER: Stage[] = ["mission", "story", "inspection", "boxMission", "materials", "studyFocus", "exitTicket", "mission1Complete"];
const MISSION_THREE_ORDER: Stage[] = ["mission3Review", "mission3Question", "mission3Intro", "mission3Data", "mission3Parts", "mission3Materials", "mission3Design", "mission3Build", "mission3Reason", "mission3Complete"];

function orderedProgress(order: Stage[], stage: Stage): number {
  const index = order.indexOf(stage);
  if (index < 0) return 0;
  return Math.round((index / Math.max(1, order.length - 1)) * 100);
}

/**
 * Mission 1 finishes only when every attending learner has completed the
 * individual K-P-V ticket. A stale completed status must never fill the bar.
 */
export function missionOneAnswerProgress(run: TrackedRun): ExitTicketProgress {
  return exitTicketProgress(run.saveState.team ?? [], run.saveState.exitTickets ?? {});
}

/** Progress for one mission run. A new run naturally starts again at 0%. */
export function runProgress(run: TrackedRun, requiredMissionTwoMembers?: TeamMember[]): number {
  const mission = run.saveState.missionNumber
    ?? (run.currentStage.startsWith("mission3") ? 3
      : ["mission2Review", "mission2Question", "mission2Parts", "mission2Intro", "testHub", "compression", "impact", "absorption", "elasticity", "recap", "notebook", "comparison", "mission2Assessment", "mission2Complete", "prediction", "summary"].includes(run.currentStage) ? 2 : 1);

  if (mission === 1) {
    const answerProgress = missionOneAnswerProgress(run);
    // Older runs without a roster still show their journey through Mission 1,
    // but never receive a full bar without complete individual answers.
    if (!answerProgress.total) return Math.min(99, orderedProgress(MISSION_ONE_ORDER, run.currentStage));

    const exitTicketIndex = MISSION_ONE_ORDER.indexOf("exitTicket");
    const currentIndex = MISSION_ONE_ORDER.indexOf(run.currentStage);
    if (currentIndex < exitTicketIndex) return orderedProgress(MISSION_ONE_ORDER, run.currentStage);
    if (answerProgress.complete) return 100;

    // Reaching the individual questions means the shared Mission 1 journey is
    // already complete. Keep that progress visible, then let saved individual
    // answers fill only the final portion of the bar.
    const questionStageProgress = orderedProgress(MISSION_ONE_ORDER, "exitTicket");
    const answerShare = answerProgress.percent / 100;
    return Math.min(99, Math.round(questionStageProgress + ((100 - questionStageProgress) * answerShare)));
  }
  if (mission === 3) return run.status === "completed" ? 100 : orderedProgress(MISSION_THREE_ORDER, run.currentStage);
  const missionTwoAnswers = missionTwoAnswerProgress(run, requiredMissionTwoMembers);
  if (missionTwoAnswers.complete) return 100;
  if (run.currentStage === "mission2Review") return 0;
  if (run.currentStage === "mission2Question") return 3;
  if (run.currentStage === "mission2Parts") return 5;
  if (run.currentStage === "mission2Intro") return 7;

  const resultTotal = Object.keys(run.saveState.compressionResults ?? {}).length
    + Object.keys(run.saveState.impactResults ?? {}).length
    + Object.keys(run.saveState.absorptionResults ?? {}).length;
  const resultTarget = LAB_MATERIALS.length * 3;
  const recapDone = Object.values(run.saveState.recapAnswers ?? {}).filter((choices) => choices.length > 0).length;
  const connectionsDone = ["compression", "impact", "water"].filter((key) => Boolean(run.saveState.mission2Connections?.[key])).length;
  const individualDone = Object.values(run.saveState.mission2AssessmentConfirmed ?? {}).filter(Boolean).length;
  const individualTarget = Math.max(1, run.saveState.team?.filter((member) => member.present !== false).length ?? 0);
  const evidenceProgress = 10
    + (Math.min(resultTotal, resultTarget) / resultTarget) * 55
    + (Math.min(recapDone, 3) / 3) * 15
    + (Math.min(connectionsDone, 3) / 3) * 8
    + (Math.min(individualDone, individualTarget) / individualTarget) * 7;
  const stageFloor = run.currentStage === "mission2Complete" || run.currentStage === "summary" ? 95
    : run.currentStage === "mission2Assessment" ? 88
    : run.currentStage === "comparison" || run.currentStage === "notebook" ? 80
      : 10;
  return Math.min(95, Math.round(Math.max(stageFloor, evidenceProgress)));
}

/** Keep a completed attempt visible even when a newer replay is unfinished. */
export function missionProgressForTeam(team: TeamOverview, mission: 1 | 2 | 3): number {
  return Math.max(0, ...team.runs
    .filter((run) => missionNumberForTrackedRun(run) === mission)
    .map((run) => runProgress(run, mission === 2 ? team.members : undefined)));
}

export function formatDuration(startedAt: string, endedAt?: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "-";
  const minutes = Math.max(1, Math.round((end - start) / 60_000));
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ชม. ${rest} นาที` : `${hours} ชม.`;
}

export function isToday(value: string, now = new Date()): boolean {
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}
