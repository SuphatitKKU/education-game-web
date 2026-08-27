import type { Stage } from "@/features/game/data";

export const ACTIVE_STAGE_ORDER: Stage[] = [
  "mission",
  "story",
  "inspection",
  "materials",
  "studyFocus",
  "exitTicket",
  "summary",
];

export const STAGE_LABELS: Record<Stage, string> = {
  menu: "หน้าปก",
  team: "จัดทีม",
  mission: "รับภารกิจและติดตามพัสดุ",
  story: "เรียนรู้จากเรื่องราว",
  inspection: "สำรวจความเสียหาย",
  materials: "ศึกษาวัสดุ",
  studyFocus: "เลือกสิ่งที่ต้องศึกษา",
  exitTicket: "ตอบคำถามรายบุคคล",
  testHub: "ห้องทดสอบ",
  compression: "ทดสอบแรงกด",
  absorption: "ทดสอบการดูดซับน้ำ",
  elasticity: "ทดสอบความยืดหยุ่น",
  recap: "ทบทวน",
  prediction: "เลือกวัสดุ",
  summary: "สรุปภารกิจ",
};

export function stageProgress(stage: Stage): number {
  if (stage === "summary") return 100;
  const index = ACTIVE_STAGE_ORDER.indexOf(stage);
  if (index < 0) return 0;
  return Math.round((index / (ACTIVE_STAGE_ORDER.length - 1)) * 100);
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
