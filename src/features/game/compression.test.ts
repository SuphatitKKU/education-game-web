import { describe, expect, it } from "vitest";
import { EMPTY_SAVE, type CompressionResult } from "./data";
import {
  COMPRESSION_CONDITIONS,
  COMPRESSION_MATERIAL_RESULTS,
  COMPRESSION_OBSERVATIONS,
  PRESS_GEOMETRY,
  compressionMaterialResult,
  compressionModelObservationLabel,
  compressionObservationLabel,
  compressionPose,
  compressionVisualScale,
  formatCompressionMm,
  recordCompression,
} from "./compression";
import { LAB_MATERIALS, labResultCount, openLabPatch } from "./labs";

describe("equal-load compression activity", () => {
  it("approaches the specimen without compressing it, then keeps the platen in contact", () => {
    for (const material of LAB_MATERIALS) {
      const idle = compressionPose(material, "idle");
      expect(compressionPose(material, "approach", 0)).toEqual(idle);
      expect(idle.platenBottom - idle.specimenTop).toBeCloseTo(PRESS_GEOMETRY.clearance);
      let previousBottom = idle.platenBottom;
      for (const progress of [0, .25, .5, .75, 1]) {
        const approaching = compressionPose(material, "approach", progress);
        expect(approaching.scale).toBe(1);
        expect(approaching.platenBottom).toBeGreaterThanOrEqual(approaching.specimenTop);
        expect(approaching.platenBottom).toBeLessThanOrEqual(previousBottom);
        previousBottom = approaching.platenBottom;
      }
      expect(compressionPose(material, "approach", 1)).toEqual(compressionPose(material, "pressing", 0));
      let previousScale = 1;
      for (const progress of [0, .25, .5, .75, 1]) {
        const pressing = compressionPose(material, "pressing", progress);
        expect(pressing.platenBottom - pressing.specimenTop).toBeCloseTo(
          compressionMaterialResult(material).modelObservation === "none" ? PRESS_GEOMETRY.noDeformationGap : 0,
        );
        expect(pressing.scale).toBeLessThanOrEqual(previousScale);
        expect(pressing.specimenTop).toBeGreaterThan(PRESS_GEOMETRY.bedHeight);
        previousScale = pressing.scale;
      }
      const pressed = compressionPose(material, "pressing", 1);
      const done = compressionPose(material, "done");
      expect(pressed.scale).toBeCloseTo(done.scale);
      expect(pressed.specimenTop).toBeCloseTo(done.specimenTop);
      expect(pressed.platenBottom).toBeCloseTo(done.platenBottom);
      expect(compressionPose(material, "done").scale).toBeCloseTo(compressionVisualScale(material));
      expect(compressionPose(material, "idle")).toEqual(idle);
    }
  });
  it("clamps elapsed progress so delayed frames cannot overshoot the press", () => {
    const material = LAB_MATERIALS[0];
    expect(compressionPose(material, "pressing", -1)).toEqual(compressionPose(material, "pressing", 0));
    expect(compressionPose(material, "pressing", 2)).toEqual(compressionPose(material, "done"));
  });
  it("lifts from the completed pose back to the ready pose before another press", () => {
    for (const material of LAB_MATERIALS) {
      expect(compressionPose(material, "lifting", 0)).toEqual(compressionPose(material, "done"));
      expect(compressionPose(material, "lifting", 1)).toEqual(compressionPose(material, "idle"));
      let previousBottom = compressionPose(material, "done").platenBottom;
      let previousScale = compressionPose(material, "done").scale;
      for (const progress of [.25, .5, .75, 1]) {
        const lifting = compressionPose(material, "lifting", progress);
        expect(lifting.platenBottom).toBeGreaterThanOrEqual(previousBottom);
        expect(lifting.scale).toBeGreaterThanOrEqual(previousScale);
        previousBottom = lifting.platenBottom;
        previousScale = lifting.scale;
      }
    }
  });
  it("uses the same press conditions for all five active materials", () => {
    for (const material of LAB_MATERIALS) {
      const reference = compressionMaterialResult(material);
      const result = recordCompression(material, "slight");
      expect(result.method).toBe("fixed-pressure-compression-v2");
      expect(result.conditions).toEqual(COMPRESSION_CONDITIONS);
      expect(result.measurements).toEqual([reference.deformationMm]);
      expect(result.deformationMm).toBe(reference.deformationMm);
      expect(result.loadedThicknessMm).toBe(reference.loadedThicknessMm);
      expect(result.modelObservation).toBe(reference.modelObservation);
      expect(result.residual).toBeUndefined();
      expect(result.recovered).toBeUndefined();
    }
  });
  it("uses the supplied deformation and loaded-thickness reference data", () => {
    expect(COMPRESSION_MATERIAL_RESULTS).toEqual({
      bubble_wrap: { deformationMm: 3.992, loadedThicknessMm: 1.008, modelObservation: "much" },
      closed_cell_pe_foam: { deformationMm: .540, loadedThicknessMm: 4.460, modelObservation: "slight" },
      corrugated_cardboard: { deformationMm: .067, loadedThicknessMm: 4.933, modelObservation: "slight" },
      cardboard: { deformationMm: .018, loadedThicknessMm: 4.982, modelObservation: "none" },
      pe_sheet: { deformationMm: .00027, loadedThicknessMm: 4.99973, modelObservation: "none" },
    });
    for (const material of LAB_MATERIALS) {
      const result = compressionMaterialResult(material);
      expect(result.deformationMm + result.loadedThicknessMm).toBeCloseTo(COMPRESSION_CONDITIONS.initialThicknessMm, 5);
      expect(compressionModelObservationLabel(material)).toBe(
        COMPRESSION_OBSERVATIONS.find((item) => item.id === result.modelObservation)?.label,
      );
    }
    expect(formatCompressionMm(.540)).toBe("0.540");
    expect(formatCompressionMm(.00027)).toBe("0.00027");
  });
  it("uses clear categorical deformation in the scene and keeps no-deformation materials separated from the platen", () => {
    for (const material of LAB_MATERIALS) {
      const reference = compressionMaterialResult(material);
      const done = compressionPose(material, "done");
      const expectedScale = COMPRESSION_OBSERVATIONS.find((item) => item.id === reference.modelObservation)!.scale;
      expect(done.scale).toBe(expectedScale);
      expect(done.platenBottom - done.specimenTop).toBeCloseTo(
        reference.modelObservation === "none" ? PRESS_GEOMETRY.noDeformationGap : 0,
      );
    }
  });
  it("records the child's chosen observation without grading or replacing it", () => {
    for (const item of COMPRESSION_OBSERVATIONS) {
      const result = recordCompression(LAB_MATERIALS[0], item.id);
      expect(result.observation).toBe(item.id);
      expect(compressionObservationLabel(result)).toBe(item.label);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
  });
  it("keeps legacy results readable without inventing a past observation", () => {
    const legacy: CompressionResult = { materialId: "cardboard", measurements: [3, 6, 9], residual: 3, recovered: 6 };
    expect(compressionObservationLabel(legacy)).toBe("ผลเดิม (ยังไม่มีคำตอบสังเกต)");
    expect(compressionObservationLabel()).toBe("ยังไม่บันทึก");
  });
  it("preserves earlier records when saving in a freely chosen material order", () => {
    const results = {
      [LAB_MATERIALS[4].id]: recordCompression(LAB_MATERIALS[4], "much"),
      [LAB_MATERIALS[0].id]: recordCompression(LAB_MATERIALS[0], "slight"),
    };
    const save = { ...EMPTY_SAVE, compressionResults: results };
    expect(labResultCount(save, "compression")).toBe(2);
    expect(openLabPatch(save, "compression")).toEqual({ stage: "compression", compressionIndex: 1 });
    const updated = { ...results, [LAB_MATERIALS[0].id]: recordCompression(LAB_MATERIALS[0], "none") };
    expect(updated[LAB_MATERIALS[4].id]).toEqual(results[LAB_MATERIALS[4].id]);
    expect(updated[LAB_MATERIALS[0].id].observation).toBe("none");
  });
});
