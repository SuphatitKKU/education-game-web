import { describe, expect, it } from "vitest";
import { EMPTY_SAVE } from "./data";
import { LAB_MATERIALS, labResultCount, openLabPatch } from "./labs";
import { IMPACT_OBSERVATIONS, impactDamageFor, impactObservationLabel, recordImpact, resumeLabStage } from "./impact";

describe("impact lab: authored egg-drop scenarios", () => {
  it("supports exactly the five active materials with deterministic illustrative outcomes", () => {
    for (const { id } of LAB_MATERIALS) {
      expect(IMPACT_OBSERVATIONS.map((item) => item.id)).toContain(impactDamageFor(id));
      expect(impactDamageFor(id)).toBe(impactDamageFor(id));
    }
    expect(() => impactDamageFor("unknown")).toThrow();
    expect(() => impactDamageFor("kraft_paper")).toThrow();
  });
  it("keeps the same height, object and specimen conditions for every material", () => {
    const expected = { object: "same-model-egg", height: "fixed", specimen: "equal-size" };
    for (const { id } of LAB_MATERIALS) {
      const result = recordImpact(id, "none");
      expect(result.conditions).toEqual(expected);
      expect(result.method).toBe("egg-drop-v1");
      expect(result.modelVersion).toBe("illustrative-v1");
    }
  });
  it("retains the student's answer separately from the displayed model outcome", () => {
    for (const item of IMPACT_OBSERVATIONS) {
      const result = recordImpact("cardboard", item.id);
      expect(result.observation).toBe(item.id);
      expect(result.simulatedDamage).toBe("much");
      expect(impactObservationLabel(result)).toBe(item.label);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
    expect(impactObservationLabel()).toBe("ยังไม่บันทึก");
  });
  it("resumes missing materials by ID without counting or changing legacy stretch results", () => {
    const save = { ...EMPTY_SAVE, impactIndex: 99,
      impactResults: { corrugated_cardboard: recordImpact("corrugated_cardboard", "slight"), pe_sheet: recordImpact("pe_sheet", "much") },
      elasticityResults: { cardboard: { materialId: "cardboard", stretch: [1, 2, 3], residual: 1, recovered: 2, summary: "legacy" } },
    };
    expect(labResultCount(save, "impact")).toBe(2);
    expect(openLabPatch(save, "impact")).toEqual({ stage: "impact", impactIndex: 1 });
    expect(save.elasticityResults.cardboard.summary).toBe("legacy");
    expect(resumeLabStage("elasticity")).toBe("impact");
    expect(resumeLabStage("summary")).toBe("summary");
  });
  it("handles pre-impact checkpoints with no impact field", () => {
    const legacy = { ...EMPTY_SAVE };
    Reflect.deleteProperty(legacy, "impactResults");
    expect(labResultCount(legacy, "impact")).toBe(0);
    expect(openLabPatch(legacy, "impact")).toEqual({ stage: "impact", impactIndex: 0 });
  });
});
