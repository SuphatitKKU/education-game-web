import type { GameSave } from "./data";
import { COMPRESSION_OBSERVATIONS } from "./compression";
import { IMPACT_OBSERVATIONS } from "./impact";
import { observationLabel } from "./absorption";

export type ExperimentKind = "compression" | "impact" | "water";

/** Show only the observation saved by this team in Mission 2, never model data. */
export function recordedExperimentResult(save: GameSave, materialId: string, kind: ExperimentKind): string {
  if (kind === "compression") {
    const answer = save.compressionResults?.[materialId]?.observation;
    return COMPRESSION_OBSERVATIONS.find((item) => item.id === answer)?.label ?? "ยังไม่บันทึก";
  }
  if (kind === "impact") {
    const answer = save.impactResults?.[materialId]?.observation;
    return IMPACT_OBSERVATIONS.find((item) => item.id === answer)?.label ?? "ยังไม่บันทึก";
  }
  return observationLabel(save.absorptionResults?.[materialId]?.observation);
}
