import type { ImpactDamage, ImpactResult, Stage } from "./data";

export const IMPACT_DROP_MS = 900;
export const IMPACT_SETTLE_MS = 600;
/** Time reserved for the visible squeeze-then-release gripper sequence. */
export const IMPACT_GRIPPER_MS = 1300;
export const IMPACT_CONDITIONS = {
  eggMassG: 60,
  eggHeightCm: 5.7,
  dropHeightCm: 50,
  specimenWidthCm: 10,
  specimenLengthCm: 10,
  initialThicknessMm: 5,
  dropsPerTrial: 1,
} as const;
export type ImpactPhase = "idle" | "preparing" | "dropping" | "settling" | "done";
export const IMPACT_OBSERVATIONS = [
  { id: "none", label: "ไม่พบความเสียหาย" },
  { id: "slight", label: "เสียหายเล็กน้อย" },
  { id: "much", label: "เสียหายมาก" },
] as const;

// Authored teaching scenarios, NOT empirical data or a ranking of real materials.
// Deliberately independent of the old stretching and compression measurements.
const ILLUSTRATIVE_DAMAGE: Readonly<Record<string, ImpactDamage>> = {
  corrugated_cardboard: "slight",
  cardboard: "much",
  bubble_wrap: "none",
  closed_cell_pe_foam: "none",
  pe_sheet: "much",
};

export function impactDamageFor(materialId: string): ImpactDamage {
  const damage = ILLUSTRATIVE_DAMAGE[materialId];
  if (!damage) throw new Error(`Unsupported impact material: ${materialId}`);
  return damage;
}

export function recordImpact(materialId: string, observation: ImpactDamage): ImpactResult {
  return {
    materialId, observation, simulatedDamage: impactDamageFor(materialId),
    method: "egg-drop-v1", modelVersion: "illustrative-v1",
    conditions: IMPACT_CONDITIONS,
  };
}

export function impactObservationLabel(result?: ImpactResult) {
  return IMPACT_OBSERVATIONS.find((item) => item.id === result?.observation)?.label ?? "ยังไม่บันทึก";
}

// Only the active route changes; historical elasticity data is never re-labelled.
export function resumeLabStage(stage: Stage): Stage {
  return stage === "elasticity" ? "impact" : stage;
}
