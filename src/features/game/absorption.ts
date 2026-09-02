import type { MaterialDefinition, WaterAbsorptionResult } from "./data";

export const ABSORPTION_STEP_MS = 850;
export type AbsorptionPhase = "idle" | "weighBefore" | "wetting" | "wiping" | "weighAfter" | "done";
export type AbsorptionLevel = "low" | "medium" | "high";

export function absorptionLevel(absorbed: number): AbsorptionLevel {
  if (absorbed <= 1) return "low";
  if (absorbed <= 5) return "medium";
  return "high";
}

export function absorptionLevelLabel(result?: WaterAbsorptionResult) {
  if (!result) return "ยังไม่บันทึก";
  const labels: Record<AbsorptionLevel, string> = { low: "น้อย", medium: "ปานกลาง", high: "มาก" };
  return labels[absorptionLevel(result.absorbed)];
}

export function recordAbsorption(material: MaterialDefinition): WaterAbsorptionResult {
  return {
    materialId: material.id,
    drops: [...material.waterDrops],
    absorbed: material.waterDrops[2],
    summary: material.waterSummary,
    method: "one-side-water-contact-v1",
    conditions: { water: "equal", contactArea: "equal", contactTime: "equal", specimen: "equal-size" },
  };
}

export function absorptionStep(phase: AbsorptionPhase) {
  if (phase === "idle" || phase === "weighBefore") return 1;
  if (phase === "wetting") return 2;
  if (phase === "wiping") return 3;
  return 4;
}
