import { describe, expect, it } from "vitest";
import { EMPTY_SAVE } from "@/features/game/data";
import type { TeamOverview, TrackedRun } from "./types";
import { ACTIVE_STAGE_ORDER, formatDuration, isToday, missionProgressForTeam, runProgress, stageProgress } from "./progress";

function run(overrides: Partial<TrackedRun> = {}): TrackedRun {
  return {
    id: "run-1",
    teamId: "team-1",
    status: "in_progress",
    currentStage: "mission",
    saveState: { ...EMPTY_SAVE, missionNumber: 1 },
    revision: 0,
    startedAt: "2026-09-16T01:00:00.000Z",
    updatedAt: "2026-09-16T01:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

describe("tracking progress", () => {
  it("maps active lesson stages to monotonic progress", () => {
    const values = ["mission", "story", "inspection", "materials", "studyFocus", "exitTicket", "summary"].map((stage) => stageProgress(stage as Parameters<typeof stageProgress>[0]));
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(100);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it("places the box-mission discussion after inspection and before material exploration", () => {
    expect(ACTIVE_STAGE_ORDER.indexOf("inspection")).toBeLessThan(ACTIVE_STAGE_ORDER.indexOf("boxMission"));
    expect(ACTIVE_STAGE_ORDER.indexOf("boxMission")).toBeLessThan(ACTIVE_STAGE_ORDER.indexOf("materials"));
  });

  it("formats classroom run durations", () => {
    expect(formatDuration("2026-08-25T01:00:00Z", "2026-08-25T01:42:00Z")).toBe("42 นาที");
    expect(formatDuration("2026-08-25T01:00:00Z", "2026-08-25T02:30:00Z")).toBe("1 ชม. 30 นาที");
  });

  it("includes enabled laboratory stages in teacher progress", () => {
    for (const stage of ["testHub", "compression", "impact", "absorption", "recap"] as const) {
      expect(stageProgress(stage)).toBeGreaterThan(stageProgress("exitTicket"));
      expect(stageProgress(stage)).toBeLessThan(100);
    }
  });

  it("marks the mission-one celebration as a completed mission", () => {
    expect(stageProgress("mission1Complete")).toBe(100);
  });

  it("tracks progress independently for each mission run", () => {
    expect(runProgress(run())).toBe(0);
    expect(runProgress(run({ currentStage: "exitTicket", saveState: { ...EMPTY_SAVE, missionNumber: 1 } }))).toBeGreaterThan(80);
    expect(runProgress(run({ currentStage: "mission2Review", saveState: { ...EMPTY_SAVE, missionNumber: 2 } }))).toBe(0);
    expect(runProgress(run({ currentStage: "mission2Question", saveState: { ...EMPTY_SAVE, missionNumber: 2 } }))).toBe(3);
    expect(runProgress(run({ currentStage: "mission2Parts", saveState: { ...EMPTY_SAVE, missionNumber: 2 } }))).toBe(5);
    expect(runProgress(run({ currentStage: "mission2Intro", saveState: { ...EMPTY_SAVE, missionNumber: 2 } }))).toBe(7);
    expect(runProgress(run({ status: "completed", currentStage: "mission2Complete", completedAt: "2026-09-16T02:00:00.000Z", saveState: { ...EMPTY_SAVE, missionNumber: 2 } }))).toBe(95);
  });

  it("keeps the completed Mission 1 journey visible while individual answers fill the final segment", () => {
    const ticket = {
      k: "ความต้านทานแรงกดทับ\nความสามารถในการลดความเสียหายจากแรงกระแทก\nการดูดซับน้ำของวัสดุ",
      p: "แรงกด\nแรงกระแทก\nน้ำ",
      v: "ได้\nเหตุผล: วัสดุยังแข็งแรงและช่วยลดขยะ",
    };
    const save = {
      ...EMPTY_SAVE,
      missionNumber: 1 as const,
      team: [
        { id: "one", name: "หนึ่ง", avatar: "inventor_sun", position: 0 },
        { id: "two", name: "สอง", avatar: "inventor_moon", position: 1 },
      ],
      exitTickets: { "member-one": ticket },
    };
    expect(runProgress(run({ currentStage: "exitTicket", saveState: { ...save, exitTickets: {} } }))).toBe(86);
    expect(runProgress(run({ currentStage: "exitTicket", saveState: save }))).toBe(93);
    expect(runProgress(run({ currentStage: "mission1Complete", saveState: save }))).toBe(93);
    expect(runProgress(run({ status: "completed", currentStage: "mission1Complete", saveState: save }))).toBe(93);
    expect(runProgress(run({ currentStage: "mission1Complete", saveState: { ...save, exitTickets: { "member-one": ticket, "member-two": ticket } } }))).toBe(100);
    expect(runProgress(run({ currentStage: "overview", saveState: { ...save, exitTickets: {}, mission1Completed: true } }))).toBe(0);
  });

  it("counts only attending students in the Mission 2 individual checkpoint", () => {
    const save = {
      ...EMPTY_SAVE,
      missionNumber: 2 as const,
      team: [
        { id: "one", name: "หนึ่ง", avatar: "inventor_sun", position: 0, present: true },
        { id: "two", name: "สอง", avatar: "inventor_moon", position: 1, present: false },
      ],
      mission2AssessmentConfirmed: { "member-one": true },
    };
    expect(runProgress(run({ currentStage: "testHub", saveState: save }))).toBe(17);
  });

  it("fills Mission 2 when any attempt has every individual answer saved", () => {
    const completeSave = {
      ...EMPTY_SAVE,
      missionNumber: 2 as const,
      team: [{ id: "one", name: "หนึ่ง", avatar: "inventor_sun", position: 0 }],
      mission2Assessments: { "member-one": { k: "K", p: "P", v: "V" } },
      mission2AssessmentConfirmed: { "member-one": true },
    };
    const completedAttempt = run({ id: "mission-2-round-1", currentStage: "mission2Complete", saveState: completeSave });
    const replay = run({ id: "mission-2-round-2", currentStage: "mission2Assessment", saveState: { ...EMPTY_SAVE, missionNumber: 2 } });
    const team = {
      id: "team-1",
      name: "ทีมทดสอบ",
      createdAt: completedAttempt.startedAt,
      updatedAt: replay.updatedAt,
      members: completeSave.team,
      runs: [replay, completedAttempt],
      activeRun: replay,
      completedRuns: [],
    } satisfies TeamOverview;

    expect(runProgress(completedAttempt)).toBe(100);
    expect(runProgress(replay)).toBe(88);
    expect(missionProgressForTeam(team, 2)).toBe(100);
  });

  it("does not fill Mission 2 when a round covers only part of the current group", () => {
    const partialSave = {
      ...EMPTY_SAVE,
      missionNumber: 2 as const,
      team: [{ id: "one", name: "หนึ่ง", avatar: "inventor_sun", position: 0 }],
      mission2Assessments: { "member-one": { k: "K", p: "P", v: "V" } },
      mission2AssessmentConfirmed: { "member-one": true },
    };
    const partialAttempt = run({ id: "mission-2-partial", currentStage: "mission2Complete", saveState: partialSave });
    const fullGroup = [
      ...partialSave.team,
      { id: "two", name: "สอง", avatar: "inventor_moon", position: 1 },
    ];
    const team = {
      id: "team-1",
      name: "ทีมทดสอบ",
      createdAt: partialAttempt.startedAt,
      updatedAt: partialAttempt.updatedAt,
      members: fullGroup,
      runs: [partialAttempt],
      activeRun: null,
      completedRuns: [partialAttempt],
    } satisfies TeamOverview;

    expect(runProgress(partialAttempt)).toBe(100);
    expect(missionProgressForTeam(team, 2)).toBe(95);
  });

  it("recognizes completions from today", () => {
    expect(isToday("2026-08-25T08:00:00+07:00", new Date("2026-08-25T20:00:00+07:00"))).toBe(true);
    expect(isToday("2026-08-24T08:00:00+07:00", new Date("2026-08-25T20:00:00+07:00"))).toBe(false);
  });
});
