import type { GameSave, Stage } from "./data";
import { resumeLabStage } from "./impact";

type SelectableMission = 1 | 2 | 3;
const NON_PLAYING_STAGES = new Set<Stage>(["menu", "purpose", "overview", "team"]);

export function shouldAutoResume(save: Partial<Pick<GameSave, "runId" | "stage">>): boolean {
  return Boolean(save.runId && save.stage && !NON_PLAYING_STAGES.has(save.stage));
}

/**
 * An active run must always reopen at its persisted checkpoint. The selected
 * mission only decides the entry screen when the team has no active run and a
 * new run is being created.
 */
export function stageAfterChoosingTeam(
  activeRunStage: Stage | null,
  selectedMission: SelectableMission,
): Stage {
  // Menu-only checkpoints are not playable mission checkpoints. This can
  // happen when a team is chosen from the route map; resume the mission the
  // teacher selected instead of trapping the team on the route map.
  if (activeRunStage && !NON_PLAYING_STAGES.has(activeRunStage)) return resumeLabStage(activeRunStage);
  if (selectedMission === 2) return "mission2Review";
  if (selectedMission === 3) return "mission3Intro";
  return "mission";
}
