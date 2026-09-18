import { describe, expect, it } from "vitest";
import { EMPTY_SAVE, type GameSave } from "./data";
import { LAB_MATERIALS } from "./labs";
import { recordCompression } from "./compression";
import { recordImpact } from "./impact";
import { recordAbsorption } from "./absorption";
import { recordedExperimentResult } from "./mission-three-evidence";

const material = LAB_MATERIALS[0];

function teamAnswers(compression: "none" | "slight" | "much", impact: "none" | "slight" | "much", water: "none" | "low" | "high"): GameSave {
  return {
    ...EMPTY_SAVE,
    compressionResults: { [material.id]: recordCompression(material, compression) },
    impactResults: { [material.id]: recordImpact(material.id, impact) },
    absorptionResults: { [material.id]: recordAbsorption(material, water) },
  };
}

describe("Mission 3 experiment evidence", () => {
  it("uses each team's saved observations for all three experiments", () => {
    const firstTeam = teamAnswers("much", "none", "high");
    const secondTeam = teamAnswers("none", "much", "low");

    expect([
      recordedExperimentResult(firstTeam, material.id, "compression"),
      recordedExperimentResult(firstTeam, material.id, "impact"),
      recordedExperimentResult(firstTeam, material.id, "water"),
    ]).toEqual(["ยุบมาก", "ไม่พบความเสียหาย", "ดูดซับมาก"]);
    expect([
      recordedExperimentResult(secondTeam, material.id, "compression"),
      recordedExperimentResult(secondTeam, material.id, "impact"),
      recordedExperimentResult(secondTeam, material.id, "water"),
    ]).toEqual(["ไม่เห็นการยุบ", "เสียหายมาก", "ดูดซับน้อย"]);
  });

  it("supports every answer children can select", () => {
    expect(recordedExperimentResult(teamAnswers("slight", "slight", "none"), material.id, "compression")).toBe("ยุบเล็กน้อย");
    expect(recordedExperimentResult(teamAnswers("slight", "slight", "none"), material.id, "impact")).toBe("เสียหายเล็กน้อย");
    expect(recordedExperimentResult(teamAnswers("slight", "slight", "none"), material.id, "water")).toBe("ไม่ดูดซับน้ำ");
  });

  it("does not turn model measurements or outcomes into a child's missing answer", () => {
    const save = teamAnswers("slight", "slight", "low");
    delete save.compressionResults[material.id].observation;
    delete save.absorptionResults[material.id].observation;
    expect(recordedExperimentResult(save, material.id, "compression")).toBe("ยังไม่บันทึก");
    expect(recordedExperimentResult(save, material.id, "water")).toBe("ยังไม่บันทึก");
    expect(recordedExperimentResult(save, "another-material", "impact")).toBe("ยังไม่บันทึก");
  });
});
