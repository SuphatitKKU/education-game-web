import type { CompressionResult, MaterialDefinition } from "./data";

export const PRESS_DURATION_MS = 3000;
export const APPROACH_DURATION_MS = 700;
export const LIFT_DURATION_MS = 650;
export type CompressionPhase = "idle" | "lifting" | "approach" | "pressing" | "done";
export type CompressionObservation = "none" | "slight" | "much";

export const COMPRESSION_CONDITIONS = {
  specimenWidthCm: 10,
  specimenLengthCm: 10,
  initialThicknessMm: 5,
  forceN: 200,
  pressureKPa: 20,
  durationMs: PRESS_DURATION_MS,
} as const;

export type CompressionMaterialResult = {
  deformationMm: number;
  loadedThicknessMm: number;
  modelObservation: CompressionObservation;
};

/** Fixed reference values supplied for the classroom compression simulation. */
export const COMPRESSION_MATERIAL_RESULTS: Readonly<Record<string, CompressionMaterialResult>> = {
  bubble_wrap: { deformationMm: 3.992, loadedThicknessMm: 1.008, modelObservation: "much" },
  closed_cell_pe_foam: { deformationMm: .540, loadedThicknessMm: 4.460, modelObservation: "slight" },
  corrugated_cardboard: { deformationMm: .067, loadedThicknessMm: 4.933, modelObservation: "slight" },
  cardboard: { deformationMm: .018, loadedThicknessMm: 4.982, modelObservation: "none" },
  pe_sheet: { deformationMm: .00027, loadedThicknessMm: 4.99973, modelObservation: "none" },
};

export function compressionMaterialResult(material: MaterialDefinition): CompressionMaterialResult {
  const result = COMPRESSION_MATERIAL_RESULTS[material.id];
  if (result) return result;
  const deformationMm = Math.max(0, Math.min(COMPRESSION_CONDITIONS.initialThicknessMm, material.sag[2] / 4));
  return {
    deformationMm,
    loadedThicknessMm: COMPRESSION_CONDITIONS.initialThicknessMm - deformationMm,
    modelObservation: deformationMm >= 2.5 ? "much" : deformationMm >= .05 ? "slight" : "none",
  };
}

export function formatCompressionMm(value: number) {
  return value < .001 ? value.toFixed(5) : value.toFixed(3);
}

// Scene units are illustrative, not measured material dimensions or a physics solver.
export const PRESS_GEOMETRY = { bedHeight: .43, specimenHeight: .26, clearance: 1.1, noDeformationGap: .028, platenThickness: .22 } as const;

export function compressionPose(material: MaterialDefinition, phase: CompressionPhase, progress = 1) {
  const t = Math.max(0, Math.min(1, progress));
  const eased = t * t * (3 - 2 * t);
  const result = compressionMaterialResult(material);
  const target = compressionVisualScale(material);
  const contactGap = result.modelObservation === "none" ? PRESS_GEOMETRY.noDeformationGap : 0;
  const scale = phase === "done"
    ? target
    : phase === "pressing"
      ? 1 + (target - 1) * eased
      : phase === "lifting"
        ? target + (1 - target) * eased
        : 1;
  const specimenTop = PRESS_GEOMETRY.bedHeight + PRESS_GEOMETRY.specimenHeight * scale;
  const gap = phase === "idle"
    ? PRESS_GEOMETRY.clearance
    : phase === "lifting"
      ? contactGap + (PRESS_GEOMETRY.clearance - contactGap) * eased
      : phase === "approach"
        ? contactGap + (PRESS_GEOMETRY.clearance - contactGap) * (1 - eased)
        : contactGap;
  return { scale, specimenTop, platenBottom: specimenTop + gap };
}

export const COMPRESSION_OBSERVATIONS = [
  { id: "none", label: "ไม่เห็นการยุบ", scale: 1 },
  { id: "slight", label: "ยุบเล็กน้อย", scale: .65 },
  { id: "much", label: "ยุบมาก", scale: .22 },
] as const;

/** Pedagogical display scale; exact millimetre values remain in the recorded data. */
export function compressionVisualScale(material: MaterialDefinition) {
  const observation = compressionMaterialResult(material).modelObservation;
  return COMPRESSION_OBSERVATIONS.find((item) => item.id === observation)?.scale ?? 1;
}

// Keep the supplied reference result separate from the child's observation;
// recording an observation must not silently grade or replace the child's choice.
export function recordCompression(material: MaterialDefinition, observation: CompressionObservation): CompressionResult {
  const result = compressionMaterialResult(material);
  return {
    materialId: material.id,
    measurements: [result.deformationMm],
    deformationMm: result.deformationMm,
    loadedThicknessMm: result.loadedThicknessMm,
    observation,
    modelObservation: result.modelObservation,
    method: "fixed-pressure-compression-v2",
    conditions: COMPRESSION_CONDITIONS,
  };
}

export function compressionObservationLabel(result?: CompressionResult) {
  if (!result) return "ยังไม่บันทึก";
  return COMPRESSION_OBSERVATIONS.find((item) => item.id === result.observation)?.label ?? "ผลเดิม (ยังไม่มีคำตอบสังเกต)";
}

export function compressionModelObservationLabel(material: MaterialDefinition) {
  const observation = compressionMaterialResult(material).modelObservation;
  return COMPRESSION_OBSERVATIONS.find((item) => item.id === observation)!.label;
}
