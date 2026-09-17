import type { AbsorptionLevel, MaterialDefinition, StripAbsorptionLevel, WaterAbsorptionResult } from "./data";

export const ABSORPTION_TRANSITION_MS = 850;
export const ABSORPTION_DURATION_MS = 30_000;
// Kept for older imports that use the short preparation/immersion transition.
export const ABSORPTION_STEP_MS = ABSORPTION_TRANSITION_MS;
export type AbsorptionPhase = "idle" | "prepare" | "immersing" | "holding" | "done";

export const ABSORPTION_CONDITIONS = {
  specimenWidthCm: 2,
  specimenLengthCm: 10,
  dyedWater: true,
  immersionDepthCm: 1,
  contactTimeSec: 30,
  simultaneous: true,
} as const;

const LEVEL_LABELS: Record<AbsorptionLevel, string> = {
  none: "ไม่ดูดซับน้ำ",
  low: "ดูดซับน้อย",
  medium: "ดูดซับปานกลาง",
  high: "ดูดซับมาก",
};

/** Legacy conversion for checkpoints made with the old weighing activity. */
export function absorptionLevel(absorbed: number): AbsorptionLevel {
  if (absorbed <= 0) return "none";
  if (absorbed <= 1) return "low";
  if (absorbed <= 5) return "medium";
  return "high";
}

export function stripAbsorptionLevel(riseCm: number): StripAbsorptionLevel {
  if (riseCm <= 0.1) return "none";
  if (riseCm <= 3) return "low";
  return "high";
}

export function absorptionLevelLabel(result?: WaterAbsorptionResult) {
  if (!result) return "ยังไม่บันทึก";
  const level = result.modelLevel ?? (result.method === "colored-water-strip-v1"
    ? stripAbsorptionLevel(result.riseCm ?? 0)
    : absorptionLevel(result.absorbed ?? 0));
  return LEVEL_LABELS[level];
}

export function observationLabel(level?: AbsorptionLevel) {
  return level ? LEVEL_LABELS[level] : "ยังไม่บันทึก";
}

export function recordAbsorption(material: MaterialDefinition, observation?: AbsorptionLevel): WaterAbsorptionResult {
  return {
    materialId: material.id,
    // Keep riseCm as the visible model evidence; absorbed mirrors it for old summaries.
    riseCm: material.waterRiseCm,
    absorbed: material.waterRiseCm,
    summary: material.waterSummary,
    observation,
    modelLevel: material.waterLevel,
    method: "colored-water-strip-v1",
    conditions: ABSORPTION_CONDITIONS,
  };
}

export function absorptionStep(phase: AbsorptionPhase) {
  if (phase === "idle" || phase === "prepare") return 1;
  if (phase === "immersing") return 2;
  if (phase === "holding") return 3;
  return 4;
}

export function absorptionPhaseDuration(phase: AbsorptionPhase) {
  return phase === "holding" ? ABSORPTION_DURATION_MS : ABSORPTION_TRANSITION_MS;
}

export function absorptionProgress(elapsedMs: number) {
  return Math.min(1, Math.max(0, elapsedMs / ABSORPTION_DURATION_MS));
}
