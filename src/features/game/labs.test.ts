import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_SAVE, type GameSave } from "./data";
import { allLabsComplete, LAB_MATERIALS, LAB_ROOMS, LAB_ROOMS_ENABLED, labResultCount, openLabPatch } from "./labs";
import { STUDY_TOPICS, studyTopicLabel } from "./learning-topics";
import { recordImpact } from "./impact";

describe("enabled laboratory flow", () => {
  it("opens all three rooms but keeps the extra two materials hidden", () => {
    expect(LAB_ROOMS_ENABLED).toBe(true);
    expect(LAB_ROOMS.map((room) => room.id)).toEqual(["compression", "impact", "absorption"]);
    expect(LAB_MATERIALS.map((material) => material.id)).toEqual(["corrugated_cardboard", "cardboard", "bubble_wrap", "closed_cell_pe_foam", "pe_sheet"]);
  });

  it("uses the current study properties and descriptions in the same order", () => {
    expect(LAB_ROOMS.map((room) => room.title)).toEqual(STUDY_TOPICS.map((topic) => topic.title));
    expect(LAB_ROOMS.map((room) => room.observation)).toEqual(STUDY_TOPICS.map((topic) => topic.observation));
    expect(LAB_ROOMS.map((room) => room.purpose)).toEqual(STUDY_TOPICS.map((topic) => topic.purpose));
    expect(LAB_ROOMS.map((room) => room.number)).toEqual([1, 2, 3]);
  });

  it("keeps historical stretching results distinct from impact evidence", () => {
    expect(LAB_ROOMS[1].resultsKey).toBe("impactResults");
    const legacySave = { ...EMPTY_SAVE, elasticityResults: Object.fromEntries(LAB_MATERIALS.map(({ id }) => [id, { materialId: id, stretch: [1, 2, 3], residual: 1, recovered: 2, summary: "old" }])) };
    expect(labResultCount(legacySave, "impact")).toBe(0);
    expect(openLabPatch(legacySave, "impact")).toEqual({ stage: "impact", impactIndex: 0 });
    expect(studyTopicLabel("elasticity")).toBe("ความสามารถในการลดความเสียหายจากแรงกระแทก");
    expect(studyTopicLabel("unknown")).toBe("unknown");
  });

  it("has every required material and compression image on disk", () => {
    for (const material of LAB_MATERIALS) {
      expect(existsSync(`public/assets/materials/${material.image}`)).toBe(true);
      for (const frame of Object.values(material.testFrames)) {
        expect(existsSync(`public/assets/compression/materials/${frame}`)).toBe(true);
      }
    }
  });

  it("allows direct entry into every room without changing mission data", () => {
    for (const room of LAB_ROOMS) {
      expect(openLabPatch(EMPTY_SAVE, room.id)).toEqual({ stage: room.id, [room.indexKey]: 0 });
    }
    expect(EMPTY_SAVE.stage).toBe("menu");
    expect(EMPTY_SAVE.team).toEqual([]);
  });

  it("resumes using recorded material IDs and ignores a stale index", () => {
    const save: GameSave = { ...EMPTY_SAVE, compressionIndex: 99, compressionResults: {
      corrugated_cardboard: { materialId: "corrugated_cardboard", measurements: [1, 2, 3], residual: 1, recovered: 2 },
    }};
    expect(openLabPatch(save, "compression")).toEqual({ stage: "compression", compressionIndex: 1 });
    expect(labResultCount(save, "compression")).toBe(1);
    expect(allLabsComplete(save)).toBe(false);
  });

  it("requires every active material in every room, then permits replay from the first material", () => {
    const save: GameSave = { ...EMPTY_SAVE,
      compressionResults: Object.fromEntries(LAB_MATERIALS.map(({ id }) => [id, { materialId: id, measurements: [1, 2, 3], residual: 1, recovered: 2 }])),
      absorptionResults: Object.fromEntries(LAB_MATERIALS.map(({ id }) => [id, { materialId: id, drops: [1, 2, 3], absorbed: 3, summary: "test" }])),
      elasticityResults: Object.fromEntries(LAB_MATERIALS.map(({ id }) => [id, { materialId: id, stretch: [1, 2, 3], residual: 1, recovered: 2, summary: "test" }])),
      impactResults: Object.fromEntries(LAB_MATERIALS.map(({ id }) => [id, recordImpact(id, "slight")])),
    };
    expect(allLabsComplete(save)).toBe(true);
    expect(openLabPatch(save, "compression")).toEqual({ stage: "compression", compressionIndex: 0 });
    const missing = { ...save, absorptionResults: {} };
    expect(allLabsComplete(missing)).toBe(false);
  });
});
