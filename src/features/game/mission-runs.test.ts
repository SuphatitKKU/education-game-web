import { describe, expect, it } from "vitest";
import { EMPTY_SAVE } from "./data";
import type { TeamOverview, TrackedRun } from "@/features/tracking/types";
import {
  blocksMissionSwitch,
  completedMissionsForTeam,
  finishMissionState,
  latestRunForTeamMission,
  nextUnlockMission,
  runMissionNumber,
  visibleCompletedMissions,
} from "./mission-runs";

function trackedRun(mission: 1 | 2 | 3, status: TrackedRun["status"] = "in_progress"): TrackedRun {
  const currentStage = mission === 1 ? "mission" : mission === 2 ? "mission2Intro" : "mission3Intro";
  return {
    id: `run-${mission}-${status}`,
    teamId: "team-1",
    status,
    currentStage,
    saveState: { ...EMPTY_SAVE, missionNumber: mission, stage: currentStage },
    revision: 1,
    startedAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    completedAt: status === "completed" ? "2026-09-16T01:00:00.000Z" : null,
  };
}

function team(runs: TrackedRun[], activeRun: TrackedRun | null): TeamOverview {
  return {
    id: "team-1",
    name: "ทีมทดสอบ",
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    members: [],
    runs,
    activeRun,
    completedRuns: runs.filter((run) => run.status === "completed"),
  };
}

describe("mission run history", () => {
  it("classifies, completes, and retrieves runs by mission", () => {
    const first = trackedRun(1);
    const second = trackedRun(2, "completed");
    const currentTeam = team([second, first], first);
    expect(runMissionNumber(second)).toBe(2);
    expect(latestRunForTeamMission(currentTeam, 2)?.id).toBe(second.id);
    expect(completedMissionsForTeam(currentTeam)).toEqual([2]);
    expect(finishMissionState(first, 1)).toMatchObject({ missionNumber: 1, mission1Completed: true, stage: "mission1Complete" });
  });

  it("keeps a just-finished local checkpoint completed while sync is pending", () => {
    const active = trackedRun(1);
    const currentTeam = team([active], active);
    expect(visibleCompletedMissions(currentTeam, { ...EMPTY_SAVE, mission1Completed: true, stage: "mission1Complete" })).toContain(1);
    expect(visibleCompletedMissions(currentTeam, { ...EMPTY_SAVE, mission1Completed: true, stage: "overview" })).toContain(1);
    expect(visibleCompletedMissions(currentTeam, { ...EMPTY_SAVE, mission1Completed: true, stage: "inspection" })).not.toContain(1);

    const second = trackedRun(2);
    const secondTeam = team([second], second);
    expect(visibleCompletedMissions(secondTeam, { ...EMPTY_SAVE, mission1Completed: true, mission2Completed: true, stage: "overview" })).toContain(2);
    expect(visibleCompletedMissions(secondTeam, { ...EMPTY_SAVE, mission1Completed: true, mission2Completed: true, stage: "comparison" })).not.toContain(2);
  });

  it("recognizes persisted completion history after the active run is cleared", () => {
    const completed = trackedRun(1, "completed");
    expect(visibleCompletedMissions(team([completed], null), EMPTY_SAVE)).toEqual([1]);
  });

  it("keeps prerequisite missions unlocked when a later mission is already active", () => {
    const third = trackedRun(3);
    expect(visibleCompletedMissions(team([third], third), { ...EMPTY_SAVE, stage: "overview" })).toEqual([1, 2]);
  });

  it("targets the first mission that is not complete for the unlock animation", () => {
    expect(nextUnlockMission([])).toBe(1);
    expect(nextUnlockMission([1])).toBe(2);
    expect(nextUnlockMission([1, 2])).toBe(3);
    expect(nextUnlockMission([1, 2, 3])).toBeNull();
  });

  it("allows a confirmed replay even when a later mission is active", () => {
    expect(blocksMissionSwitch(3, 2, true)).toBe(false);
    expect(blocksMissionSwitch(3, 2, false)).toBe(true);
  });
});
