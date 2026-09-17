import type { GameSave, Stage } from "./data";
import type { TeamOverview, TrackedRun } from "@/features/tracking/types";
import { exitTicketProgress } from "./exit-ticket-progress";

export type MissionNumber = 1 | 2 | 3;

export const COMPLETED_RUN_STAGES = new Set<Stage>([
  "mission1Complete",
  "mission2Complete",
  "mission3Complete",
  "summary",
]);

export function runMissionNumber(run: TrackedRun): MissionNumber {
  if (run.saveState.missionNumber === 2 || run.saveState.missionNumber === 3) return run.saveState.missionNumber;
  if (["mission2Review", "mission2Question", "mission2Parts", "mission2Intro", "testHub", "compression", "absorption", "elasticity", "impact", "notebook", "comparison", "recap", "mission2Assessment", "mission2Complete"].includes(run.currentStage)) return 2;
  if (["mission3Intro", "mission3Data", "mission3Materials", "mission3Design", "mission3Reason", "mission3Complete"].includes(run.currentStage)) return 3;
  return 1;
}

export function finishMissionState(run: TrackedRun, mission: MissionNumber): GameSave {
  if (mission === 1) return { ...run.saveState, missionNumber: 1, mission1Completed: true, stage: "mission1Complete" };
  if (mission === 2) return { ...run.saveState, missionNumber: 2, mission1Completed: true, mission2Completed: true, stage: "mission2Complete" };
  return { ...run.saveState, missionNumber: 3, mission1Completed: true, mission2Completed: true, mission3Completed: true, stage: "mission3Complete" };
}

export function latestRunForTeamMission(team: TeamOverview, mission: MissionNumber): TrackedRun | null {
  return team.runs.find((run) => runMissionNumber(run) === mission) ?? null;
}

export function completedMissionsForTeam(team: TeamOverview): MissionNumber[] {
  return ([1, 2, 3] as MissionNumber[]).filter((mission) => team.completedRuns.some((run) => runMissionNumber(run) === mission));
}

/** Summarize the saved individual K-P-V answers for Mission 1. */
export function missionOneAnswerProgress(run: TrackedRun) {
  return exitTicketProgress(run.saveState.team ?? [], run.saveState.exitTickets ?? {});
}

/** Return the next mission whose unlock celebration should be shown. */
export function nextUnlockMission(completed: Iterable<MissionNumber>): MissionNumber | null {
  const done = new Set(completed);
  if (!done.has(1)) return 1;
  if (!done.has(2)) return 2;
  if (!done.has(3)) return 3;
  return null;
}

/**
 * Treat a locally completed checkpoint as complete while its final network
 * write is in flight. This prevents a quick return to the map from bypassing
 * the replay confirmation and starting a new run accidentally.
 */
export function visibleCompletedMissions(team: TeamOverview | null, save: GameSave): MissionNumber[] {
  const completed = new Set<MissionNumber>(team ? completedMissionsForTeam(team) : []);
  if (save.mission1Completed) completed.add(1);
  if (save.mission2Completed) completed.add(2);
  if (save.mission3Completed) completed.add(3);

  const activeMission = team?.activeRun ? runMissionNumber(team.activeRun) : null;
  if (activeMission && !COMPLETED_RUN_STAGES.has(save.stage)) completed.delete(activeMission);
  return [...completed];
}
