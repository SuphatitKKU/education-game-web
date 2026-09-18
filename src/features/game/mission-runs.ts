import type { GameSave, Stage } from "./data";
import type { TeamOverview, TrackedRun } from "@/features/tracking/types";
import { missionNumberForTrackedRun } from "@/features/tracking/run-classification";
import { exitTicketProgress, type ExitTicketProgress } from "./exit-ticket-progress";
import { exitTicketKey } from "./team-attendance";

export type MissionNumber = 1 | 2 | 3;

/** A confirmed replay may open an earlier mission; ordinary navigation may not. */
export function blocksMissionSwitch(activeMission: MissionNumber, selectedMission: MissionNumber, isReplaying: boolean) {
  return !isReplaying && selectedMission < activeMission;
}

export const COMPLETED_RUN_STAGES = new Set<Stage>([
  "mission1Complete",
  "mission2Complete",
  "mission3Complete",
  "summary",
]);

export function runMissionNumber(run: TrackedRun): MissionNumber {
  const mission = missionNumberForTrackedRun(run);
  return mission === 2 || mission === 3 ? mission : 1;
}

export function finishMissionState(run: TrackedRun, mission: MissionNumber): GameSave {
  if (mission === 1) return { ...run.saveState, missionNumber: 1, mission1Completed: true, stage: "mission1Complete" };
  if (mission === 2) return { ...run.saveState, missionNumber: 2, mission1Completed: true, mission2Completed: true, stage: "mission2Complete" };
  return { ...run.saveState, missionNumber: 3, mission1Completed: true, mission2Completed: true, mission3Completed: true, stage: "mission3Complete" };
}

export function latestRunForTeamMission(team: TeamOverview, mission: MissionNumber): TrackedRun | null {
  return team.runs.find((run) => runMissionNumber(run) === mission) ?? null;
}

const hasMissionTwoEvidence = (run: TrackedRun) =>
  Object.keys(run.saveState.compressionResults ?? {}).length > 0
  || Object.keys(run.saveState.impactResults ?? {}).length > 0
  || Object.keys(run.saveState.absorptionResults ?? {}).length > 0;

/**
 * Use the newest Mission 2 attempt that actually contains recorded evidence.
 * Empty replay attempts must not hide the group's latest saved experiment.
 */
export function missionTwoEvidenceForTeam(team: TeamOverview): Pick<GameSave, "compressionResults" | "impactResults" | "absorptionResults"> {
  const missionTwoRuns = team.runs
    .filter((run) => runMissionNumber(run) === 2)
    .sort((left, right) => {
      const attemptDifference = (right.attemptNumber ?? 0) - (left.attemptNumber ?? 0);
      return attemptDifference || new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime();
    });
  const source = missionTwoRuns.find(hasMissionTwoEvidence) ?? missionTwoRuns[0];
  return {
    compressionResults: source?.saveState.compressionResults ?? {},
    impactResults: source?.saveState.impactResults ?? {},
    absorptionResults: source?.saveState.absorptionResults ?? {},
  };
}

export function completedMissionsForTeam(team: TeamOverview): MissionNumber[] {
  return ([1, 2, 3] as MissionNumber[]).filter((mission) => team.completedRuns.some((run) => runMissionNumber(run) === mission));
}

/** Summarize the saved individual K-P-V answers for Mission 1. */
export function missionOneAnswerProgress(run: TrackedRun) {
  return exitTicketProgress(run.saveState.team ?? [], run.saveState.exitTickets ?? {});
}

/** Count Mission 2 answers that were completed and explicitly saved. */
export function missionTwoAnswerProgress(run: TrackedRun, requiredMembers?: TeamOverview["members"]): ExitTicketProgress {
  const recordedRoster = run.saveState.attendance?.members ?? [];
  const members = requiredMembers?.length
    ? requiredMembers
    : recordedRoster.length
      ? recordedRoster
      : run.saveState.team ?? [];
  const tickets = run.saveState.mission2Assessments ?? {};
  const confirmed = run.saveState.mission2AssessmentConfirmed ?? {};
  const completed = members.filter((member, index) => {
    const stableKey = exitTicketKey(member, index);
    const legacyKey = `student-${member.position ?? index}`;
    const ticket = tickets[stableKey] ?? tickets[legacyKey] ?? tickets[member.name];
    const wasConfirmed = confirmed[stableKey] ?? confirmed[legacyKey] ?? confirmed[member.name];
    return Boolean(wasConfirmed && ticket?.k && ticket?.p && ticket?.v);
  }).length;
  const total = members.length;
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
    complete: total > 0 && completed === total,
  };
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
  // An active later mission proves that its prerequisites were already
  // reached, even when an older imported run was not marked completed.
  if (activeMission && activeMission >= 2) completed.add(1);
  if (activeMission === 3) completed.add(2);
  const activeMissionCompletedOnMap = save.stage === "overview"
    && (activeMission === 1 ? save.mission1Completed
      : activeMission === 2 ? save.mission2Completed
        : activeMission === 3 ? save.mission3Completed
          : false);
  if (activeMission && !COMPLETED_RUN_STAGES.has(save.stage) && !activeMissionCompletedOnMap) completed.delete(activeMission);
  return [...completed];
}
