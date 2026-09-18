import type { GameSave, Stage } from "@/features/game/data";
import type { LearningEventInput } from "./types";

// Record learner choices (including revisions), not animation or navigation clicks.
export function answerEvents(current: GameSave, next: Partial<GameSave>): LearningEventInput[] {
  const events: LearningEventInput[] = [];
  const maps = [
    ["inspectionFindings", "damage_finding_saved", "inspection"],
    ["boxMissionGoals", "box_mission_goal_changed", "boxMission"],
    ["studyFocus", "study_focus_changed", "studyFocus"],
    ["exitTickets", "exit_ticket_answer_changed", "exitTicket"],
    ["exitTicketConfirmations", "exit_ticket_saved", "exitTicket"],
    ["labAnswerDrafts", "lab_answer_changed", current.stage],
    ["compressionResults", "compression_result_saved", "compression"],
    ["impactResults", "impact_result_saved", "impact"],
    ["absorptionResults", "absorption_result_saved", "absorption"],
    ["elasticityResults", "elasticity_result_saved", "elasticity"],
    ["recapAnswers", "recap_answer_saved", "recap"],
    ["mission2PartPredictions", "mission2_part_prediction_changed", "mission2Parts"],
    ["mission2Connections", "mission2_connection_changed", "comparison"],
    ["mission2Assessments", "mission2_individual_answer_changed", "mission2Assessment"],
    ["mission2AssessmentConfirmed", "mission2_individual_answer_saved", "mission2Assessment"],
    ["predictions", "material_prediction_changed", "prediction"],
    ["bigQuestionProgress", "big_question_progress_saved", "studyFocus"],
    ["mission3Selections", "mission3_material_selected", "mission3Materials"],
    ["mission3Reuse", "mission3_reuse_material_changed", "mission3Materials"],
    ["mission3Placements", "mission3_placement_changed", "mission3Design"],
    ["mission3Reasons", "mission3_group_reason_changed", "mission3Reason"],
    ["mission3BuildSteps", "mission3_build_step_changed", "mission3Build"],
  ] as const;
  for (const [field, eventType, stage] of maps) {
    if (!next[field]) continue;
    const before = (current[field] ?? {}) as Record<string, unknown>;
    const after = next[field] as Record<string, unknown>;
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
      events.push({ eventType, stage: stage as Stage,
        memberId: (field.startsWith("exitTicket") || field.startsWith("mission2Assessment")) && key.startsWith("member-") ? key.slice(7) : null,
        payload: { field, key, previous: before[key] ?? null, answer: after[key] ?? null },
      });
    }
  }
  if (next.mission3Extra !== undefined && current.mission3Extra !== next.mission3Extra) {
    events.push({
      eventType: "mission3_extra_layer_changed",
      stage: "mission3Design",
      payload: { field: "mission3Extra", previous: current.mission3Extra || null, answer: next.mission3Extra || null },
    });
  }
  if (next.mission3ReuseMaterial !== undefined && current.mission3ReuseMaterial !== next.mission3ReuseMaterial) {
    events.push({
      eventType: "mission3_reuse_material_changed",
      stage: "mission3Materials",
      payload: { field: "mission3ReuseMaterial", previous: current.mission3ReuseMaterial || null, answer: next.mission3ReuseMaterial || null },
    });
  }
  if (next.stage && current.stage !== next.stage) events.push({ eventType: "stage_changed", stage: next.stage, payload: { from: current.stage, to: next.stage } });
  return events;
}
