import { describe, expect, it } from "vitest";
import type { WaterAbsorptionResult } from "./data";
import { LAB_MATERIALS } from "./labs";
import { absorptionLevel, absorptionLevelLabel, absorptionStep, recordAbsorption, stripAbsorptionLevel } from "./absorption";

describe("equal-condition water absorption activity", () => {
  it("uses the same colored-water strip conditions for all five materials", () => {
    for (const material of LAB_MATERIALS) {
      const result = recordAbsorption(material);
      expect(result.materialId).toBe(material.id);
      expect(result.riseCm).toBe(material.waterRiseCm);
      expect(result.absorbed).toBe(material.waterRiseCm);
      expect(result.modelLevel).toBe(material.waterLevel);
      expect(result.method).toBe("colored-water-strip-v1");
      expect(result.conditions).toEqual({ specimenWidthCm: 2, specimenLengthCm: 10, dyedWater: true, immersionDepthCm: 1, contactTimeSec: 30, simultaneous: true });
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
  });

  it("maps visible strip rise to the three experimental groups", () => {
    expect(stripAbsorptionLevel(0)).toBe("none");
    expect(stripAbsorptionLevel(0.1)).toBe("none");
    expect(stripAbsorptionLevel(2.1)).toBe("low");
    expect(stripAbsorptionLevel(6.8)).toBe("high");
    expect(absorptionLevel(0)).toBe("none");
    expect(absorptionLevel(1)).toBe("low");
    expect(absorptionLevel(4)).toBe("medium");
    expect(absorptionLevel(5)).toBe("medium");
    expect(absorptionLevel(8)).toBe("high");
  });

  it("keeps legacy results readable", () => {
    const legacy: WaterAbsorptionResult = { materialId: "cardboard", drops: [2, 5, 8], absorbed: 8, summary: "เดิม" };
    expect(absorptionLevelLabel(legacy)).toBe("ดูดซับมาก");
    expect(absorptionLevelLabel()).toBe("ยังไม่บันทึก");
  });

  it("presents the four experimental stages in order", () => {
    expect(absorptionStep("idle")).toBe(1);
    expect(absorptionStep("prepare")).toBe(1);
    expect(absorptionStep("immersing")).toBe(2);
    expect(absorptionStep("holding")).toBe(3);
    expect(absorptionStep("done")).toBe(4);
  });
});
