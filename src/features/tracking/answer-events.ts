import type { GameSave, Stage } from "@/features/game/data";
import type { LearningEventInput } from "./types";

// Record learner choices (including revisions), not animation or navigation clicks.
export function answerEvents(current: GameSave, next: Partial<GameSave>): LearningEventInput[] {
  const events: LearningEventInput[] = [];
  const maps = [
    ["inspectionFindings", "damage_finding_saved", "inspection"],
    ["studyFocus", "study_focus_changed", "studyFocus"],
    ["exitTickets", "exit_ticket_answer_changed", "exitTicket"],
    ["exitTicketConfirmations", "exit_ticket_saved", "exitTicket"],
    ["labAnswerDrafts", "lab_answer_changed", current.stage],
    ["compressionResults", "compression_result_saved", "compression"],
    ["impactResults", "impact_result_saved", "impact"],
    ["absorptionResults", "absorption_result_saved", "absorption"],
    ["elasticityResults", "elasticity_result_saved", "elasticity"],
    ["recapAnswers", "recap_answer_saved", "recap"],
    ["predictions", "material_prediction_changed", "prediction"],
    ["bigQuestionProgress", "big_question_progress_saved", "studyFocus"],
  ] as const;
  for (const [field, eventType, stage] of maps) {
    if (!next[field]) continue;
    const before = (current[field] ?? {}) as Record<string, unknown>;
    const after = next[field] as Record<string, unknown>;
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
      events.push({ eventType, stage: stage as Stage,
        memberId: field.startsWith("exitTicket") && key.startsWith("member-") ? key.slice(7) : null,
        payload: { field, key, previous: before[key] ?? null, answer: after[key] ?? null },
      });
    }
  }
  if (next.stage && current.stage !== next.stage) events.push({ eventType: "stage_changed", stage: next.stage, payload: { from: current.stage, to: next.stage } });
  return events;
}
