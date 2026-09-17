import type { TeamMember } from "@/features/game/data";
import type { TeamOverview, TrackedRun } from "@/features/tracking/types";

export type DashboardMissionFilter = "all" | 1 | 2 | 3 | 4 | 5;

export const MISSION_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "วิเคราะห์ปัญหา",
  2: "สำรวจสมบัติวัสดุ",
  3: "ออกแบบกล่อง",
  4: "ทดสอบและปรับปรุง",
  5: "พิสูจน์ผลงาน",
};

const MISSION_TWO_STAGES = new Set([
  "mission2Review",
  "mission2Question",
  "mission2Parts",
  "mission2Intro",
  "testHub",
  "compression",
  "absorption",
  "elasticity",
  "impact",
  "notebook",
  "comparison",
  "recap",
  "mission2Assessment",
  "mission2Complete",
  "prediction",
  "summary",
]);

export function missionNumberForRun(run: TrackedRun): 1 | 2 | 3 | 4 | 5 {
  const savedMission = run.saveState.missionNumber;
  if (savedMission && savedMission >= 1 && savedMission <= 5) return savedMission;
  // The stage is authoritative for old checkpoints. Completion flags may be
  // carried into a later mission and therefore cannot classify a run safely.
  if (run.currentStage.startsWith("mission3")) return 3;
  if (MISSION_TWO_STAGES.has(run.currentStage)) return 2;
  return 1;
}

export function runsForMission(team: TeamOverview, mission: DashboardMissionFilter): TrackedRun[] {
  if (mission === "all") return team.runs;
  return team.runs.filter((run) => missionNumberForRun(run) === mission);
}

export function latestRunForMission(team: TeamOverview, mission: DashboardMissionFilter): TrackedRun | null {
  return runsForMission(team, mission)[0] ?? null;
}

export type AttendanceRecord = Pick<TeamMember, "id" | "name" | "avatar" | "position"> & { present: boolean };

function sameMember(left: Pick<TeamMember, "id" | "name" | "avatar">, right: Pick<TeamMember, "id" | "name" | "avatar">): boolean {
  if (left.id && right.id) return left.id === right.id;
  return left.name === right.name && left.avatar === right.avatar;
}

export function attendanceForRun(team: TeamOverview, run: TrackedRun): AttendanceRecord[] {
  const recorded = run.saveState.attendance?.members;
  if (recorded?.length) return recorded.map((member) => ({ ...member, present: member.present !== false }));

  // Historical runs did not store an attendance snapshot. In those records,
  // saveState.team contains the children who took part in the run.
  const attending = run.saveState.team ?? [];
  return team.members.map((member) => ({
    id: member.id,
    name: member.name,
    avatar: member.avatar,
    position: member.position,
    present: attending.some((candidate) => sameMember(member, candidate)),
  }));
}

function ticketForMember(run: TrackedRun, member: AttendanceRecord, index: number) {
  const tickets = missionNumberForRun(run) === 2
    ? run.saveState.mission2Assessments ?? {}
    : run.saveState.exitTickets ?? {};
  if (member.id && tickets[`member-${member.id}`]) return tickets[`member-${member.id}`];
  const position = member.position ?? index;
  if (tickets[`student-${position}`]) return tickets[`student-${position}`];
  return tickets[member.name];
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildTeacherCsv(teams: TeamOverview[], mission: DashboardMissionFilter): string {
  const rows: unknown[][] = [[
    "ภารกิจ",
    "ชื่อภารกิจ",
    "ทีม",
    "รหัสรอบ",
    "วันที่เริ่ม",
    "อัปเดตล่าสุด",
    "สถานะ",
    "ขั้นล่าสุด",
    "เลขที่",
    "ชื่อเล่น",
    "การมาเรียน",
    "K สิ่งที่รู้",
    "P กระบวนการคิด",
    "V คุณค่าหรือสิ่งที่ได้เรียนรู้",
  ]];

  teams.forEach((team) => {
    runsForMission(team, mission).forEach((run) => {
      const missionNumber = missionNumberForRun(run);
      const attendance = attendanceForRun(team, run);
      attendance.forEach((member, index) => {
        const ticket = ticketForMember(run, member, index);
        rows.push([
          missionNumber,
          MISSION_LABELS[missionNumber],
          team.name,
          run.id,
          new Date(run.startedAt).toLocaleString("th-TH"),
          new Date(run.updatedAt).toLocaleString("th-TH"),
          run.status === "completed" ? "ทำเสร็จแล้ว" : "กำลังทำ",
          run.currentStage,
          (member.position ?? index) + 1,
          member.name,
          member.present ? "มาเรียน" : "ไม่มาเรียน",
          ticket?.k ?? "",
          ticket?.p ?? "",
          ticket?.v ?? "",
        ]);
      });
    });
  });

  // The BOM keeps Thai text readable when the CSV is opened directly in Excel.
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function missionFilterLabel(mission: DashboardMissionFilter): string {
  return mission === "all" ? "ทุกภารกิจ" : `ภารกิจที่ ${mission} ${MISSION_LABELS[mission]}`;
}
