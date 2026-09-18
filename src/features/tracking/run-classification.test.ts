import { describe, expect, it } from "vitest";
import { EMPTY_SAVE } from "@/features/game/data";
import type { TeamOverview, TrackedRun } from "./types";
import { attemptNumberForTrackedRun, missionNumberForTrackedRun, runsGroupedByMission } from "./run-classification";

function run(id: string, mission: 1 | 2 | 3, startedAt: string, attemptNumber?: number): TrackedRun {
  return {
    id,
    teamId: "team-1",
    missionNumber: mission,
    attemptNumber,
    status: "completed",
    currentStage: mission === 1 ? "mission1Complete" : mission === 2 ? "mission2Complete" : "mission3Complete",
    saveState: { ...EMPTY_SAVE, missionNumber: mission },
    revision: 1,
    startedAt,
    updatedAt: startedAt,
    completedAt: startedAt,
  };
}

describe("run classification", () => {
  it("numbers repeated attempts within each mission, not across all runs", () => {
    const missionOne = run("m1-a1", 1, "2026-09-17T01:00:00.000Z");
    const missionTwoFirst = run("m2-a1", 2, "2026-09-17T02:00:00.000Z");
    const missionTwoSecond = run("m2-a2", 2, "2026-09-17T03:00:00.000Z");
    const runs = [missionTwoSecond, missionTwoFirst, missionOne];

    expect(attemptNumberForTrackedRun(missionOne, runs)).toBe(1);
    expect(attemptNumberForTrackedRun(missionTwoFirst, runs)).toBe(1);
    expect(attemptNumberForTrackedRun(missionTwoSecond, runs)).toBe(2);
  });

  it("prefers durable identity and groups attempts beneath the same mission", () => {
    const stored = run("stored", 2, "2026-09-17T03:00:00.000Z", 7);
    stored.saveState.missionNumber = 3;
    const legacy = run("legacy", 2, "2026-09-17T02:00:00.000Z");
    delete legacy.missionNumber;
    const team = { id: "team-1", name: "ทีม", createdAt: legacy.startedAt, updatedAt: stored.updatedAt, members: [], runs: [stored, legacy], activeRun: null, completedRuns: [stored, legacy] } satisfies TeamOverview;

    expect(missionNumberForTrackedRun(stored)).toBe(2);
    expect(attemptNumberForTrackedRun(stored, team.runs)).toBe(7);
    expect(runsGroupedByMission(team)).toEqual([{ missionNumber: 2, runs: [stored, legacy] }]);
  });
});
