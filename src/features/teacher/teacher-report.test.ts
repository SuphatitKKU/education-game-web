import { describe, expect, it } from "vitest";
import { EMPTY_SAVE, type TeamMember } from "@/features/game/data";
import type { TeamOverview, TrackedRun } from "@/features/tracking/types";
import { attendanceForRun, buildTeacherCsv, missionNumberForRun } from "./teacher-report";

const members: TeamMember[] = [
  { id: "m1", name: "มะลิ", avatar: "student-1", position: 0 },
  { id: "m2", name: "ปัน,ปัน", avatar: "student-2", position: 1 },
];

function run(overrides: Partial<TrackedRun> = {}): TrackedRun {
  return {
    id: "run-1",
    teamId: "team-1",
    status: "in_progress",
    currentStage: "mission",
    saveState: { ...EMPTY_SAVE, team: members },
    revision: 1,
    startedAt: "2026-09-15T01:00:00.000Z",
    updatedAt: "2026-09-15T02:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

function team(testRun: TrackedRun): TeamOverview {
  return {
    id: "team-1",
    name: "ทีมทดลอง",
    createdAt: testRun.startedAt,
    updatedAt: testRun.updatedAt,
    members,
    runs: [testRun],
    activeRun: testRun,
    completedRuns: [],
  };
}

describe("teacher report", () => {
  it("reads explicit mission numbers and infers old mission-two checkpoints", () => {
    expect(missionNumberForRun(run({ saveState: { ...EMPTY_SAVE, missionNumber: 3 } }))).toBe(3);
    expect(missionNumberForRun(run({ currentStage: "compression" }))).toBe(2);
    expect(missionNumberForRun(run({ currentStage: "materials", saveState: { ...EMPTY_SAVE, mission3Completed: true } }))).toBe(1);
    expect(missionNumberForRun(run())).toBe(1);
  });

  it("keeps attendance snapshots and supports historical runs", () => {
    const recorded = run({
      saveState: {
        ...EMPTY_SAVE,
        attendance: { missionNumber: 1, recordedAt: "2026-09-15T01:00:00.000Z", members: [{ ...members[0], present: false }] },
      },
    });
    expect(attendanceForRun(team(recorded), recorded)).toEqual([{ ...members[0], present: false }]);

    const historical = run({ saveState: { ...EMPTY_SAVE, team: [members[0]] } });
    expect(attendanceForRun(team(historical), historical).map((item) => item.present)).toEqual([true, false]);
  });

  it("creates an Excel-friendly UTF-8 CSV with attendance and answers", () => {
    const testRun = run({
      saveState: {
        ...EMPTY_SAVE,
        team: [members[0]],
        missionNumber: 1,
        exitTickets: { "member-m1": { k: "รู้แล้ว", p: "ลอง,สังเกต", v: "ช่วยกัน" } },
      },
    });
    const csv = buildTeacherCsv([team(testRun)], 1);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"มะลิ","มาเรียน","รู้แล้ว","ลอง,สังเกต"');
    expect(csv).toContain('"ปัน,ปัน","ไม่มาเรียน"');
  });
});
