import { describe, expect, it } from "vitest";
import type { WaterAbsorptionResult } from "./data";
import { LAB_MATERIALS } from "./labs";
import { absorptionLevel, absorptionLevelLabel, absorptionStep, recordAbsorption } from "./absorption";

describe("equal-condition water absorption activity", () => {
  it("uses the same one-sided contact conditions for all five materials", () => {
    for (const material of LAB_MATERIALS) {
      const result = recordAbsorption(material);
      expect(result.materialId).toBe(material.id);
      expect(result.drops).toEqual(material.waterDrops);
      expect(result.drops).not.toBe(material.waterDrops);
      expect(result.absorbed).toBe(material.waterDrops[2]);
      expect(result.method).toBe("one-side-water-contact-v1");
      expect(result.conditions).toEqual({ water: "equal", contactArea: "equal", contactTime: "equal", specimen: "equal-size" });
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
  });

  it("maps simulated amounts to the three visible levels", () => {
    expect(absorptionLevel(0)).toBe("low");
    expect(absorptionLevel(1)).toBe("low");
    expect(absorptionLevel(4)).toBe("medium");
    expect(absorptionLevel(5)).toBe("medium");
    expect(absorptionLevel(8)).toBe("high");
  });

  it("keeps legacy results readable", () => {
    const legacy: WaterAbsorptionResult = { materialId: "cardboard", drops: [2, 5, 8], absorbed: 8, summary: "เดิม" };
    expect(absorptionLevelLabel(legacy)).toBe("มาก");
    expect(absorptionLevelLabel()).toBe("ยังไม่บันทึก");
  });

  it("presents the four experimental stages in order", () => {
    expect(absorptionStep("idle")).toBe(1);
    expect(absorptionStep("weighBefore")).toBe(1);
    expect(absorptionStep("wetting")).toBe(2);
    expect(absorptionStep("wiping")).toBe(3);
    expect(absorptionStep("weighAfter")).toBe(4);
    expect(absorptionStep("done")).toBe(4);
  });
});
