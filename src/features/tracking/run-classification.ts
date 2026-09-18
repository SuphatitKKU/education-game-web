import type { TeamOverview, TrackedRun } from "./types";

export type StoredMissionNumber = 1 | 2 | 3 | 4 | 5;

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

function isStoredMissionNumber(value: unknown): value is StoredMissionNumber {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5;
}

/** Read the durable mission identity first and infer it only for legacy rows. */
export function missionNumberForTrackedRun(run: TrackedRun): StoredMissionNumber {
  if (isStoredMissionNumber(run.missionNumber)) return run.missionNumber;
  if (isStoredMissionNumber(run.saveState.missionNumber)) return run.saveState.missionNumber;
  if (run.currentStage.startsWith("mission3")) return 3;
  if (MISSION_TWO_STAGES.has(run.currentStage)) return 2;
  return 1;
}

/** Number legacy runs inside their own mission instead of across all missions. */
export function attemptNumberForTrackedRun(run: TrackedRun, runs: TrackedRun[]): number {
  if (Number.isInteger(run.attemptNumber) && Number(run.attemptNumber) > 0) return Number(run.attemptNumber);
  const missionNumber = missionNumberForTrackedRun(run);
  const sameMissionOldestFirst = runs
    .filter((candidate) => missionNumberForTrackedRun(candidate) === missionNumber)
    .sort((left, right) => {
      const timeDifference = new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime();
      return timeDifference || left.id.localeCompare(right.id);
    });
  const index = sameMissionOldestFirst.findIndex((candidate) => candidate.id === run.id);
  return index >= 0 ? index + 1 : 1;
}

export function runsGroupedByMission(team: TeamOverview): Array<{ missionNumber: StoredMissionNumber; runs: TrackedRun[] }> {
  const grouped = new Map<StoredMissionNumber, TrackedRun[]>();
  team.runs.forEach((run) => {
    const missionNumber = missionNumberForTrackedRun(run);
    grouped.set(missionNumber, [...(grouped.get(missionNumber) ?? []), run]);
  });
  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([missionNumber, runs]) => ({ missionNumber, runs }));
}
