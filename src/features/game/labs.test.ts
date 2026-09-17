import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_SAVE, type GameSave } from "./data";
import { allLabQuestionsPassed, allLabsComplete, canContinueAfterLabs, LAB_MATERIALS, LAB_ROOMS, LAB_ROOMS_ENABLED, labQuestionPassed, labRecapRequired, labResultCount, labRoomUnlocked, openLabPatch, restartMissionTwoLabsPatch } from "./labs";
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
    expect(canContinueAfterLabs(save)).toBe(true);
    expect(openLabPatch(save, "compression")).toEqual({ stage: "compression", compressionIndex: 0 });
    const missing = { ...save, absorptionResults: {} };
    expect(allLabsComplete(missing)).toBe(false);
    expect(canContinueAfterLabs(missing)).toBe(false);
  });

  it("permits continuing after all three rooms without recap answers", () => {
    const save: GameSave = { ...EMPTY_SAVE,
      compressionResults: Object.fromEntries(LAB_MATERIALS.map(({ id }) => [id, { materialId: id, measurements: [1, 2, 3], residual: 1, recovered: 2 }])),
      impactResults: Object.fromEntries(LAB_MATERIALS.map(({ id }) => [id, recordImpact(id, "slight")])),
      absorptionResults: Object.fromEntries(LAB_MATERIALS.map(({ id }) => [id, { materialId: id, drops: [1, 2, 3], absorbed: 3, summary: "test" }])),
      recapAnswers: {},
    };
    expect(allLabQuestionsPassed(save)).toBe(false);
    expect(canContinueAfterLabs(save)).toBe(true);
  });

  it("opens the recap question after a room is completed", () => {
    const completedCompression: GameSave = { ...EMPTY_SAVE,
      compressionResults: Object.fromEntries(LAB_MATERIALS.map(({ id }) => [id, { materialId: id, measurements: [1, 2, 3], residual: 1, recovered: 2 }])),
    };
    expect(labRecapRequired(completedCompression, "compression")).toBe(true);
    expect(labRecapRequired({ ...completedCompression, recapAnswers: { "0": [0] } }, "compression")).toBe(false);
    expect(labRecapRequired(EMPTY_SAVE, "compression")).toBe(false);
  });

  it("keeps all three rooms unlocked regardless of question progress", () => {
    expect(labRoomUnlocked(EMPTY_SAVE, "compression")).toBe(true);
    expect(labRoomUnlocked(EMPTY_SAVE, "impact")).toBe(true);
    expect(labRoomUnlocked(EMPTY_SAVE, "absorption")).toBe(true);
    expect(labQuestionPassed(EMPTY_SAVE, "compression")).toBe(false);

    const afterCompression = { ...EMPTY_SAVE, recapAnswers: { "0": [2, 0] } };
    expect(labQuestionPassed(afterCompression, "compression")).toBe(true);
    expect(labRoomUnlocked(afterCompression, "impact")).toBe(true);
    expect(labRoomUnlocked(afterCompression, "absorption")).toBe(true);

    const allAnswered = { ...EMPTY_SAVE, recapAnswers: { "0": [0], "1": [1], "2": [1] } };
    expect(allLabQuestionsPassed(allAnswered)).toBe(true);
  });

  it("restarts all three rooms while preserving team and Mission 1 evidence", () => {
    const patch = restartMissionTwoLabsPatch();
    expect(patch).toMatchObject({
      stage: "testHub",
      compressionIndex: 0,
      impactIndex: 0,
      absorptionIndex: 0,
      compressionResults: {},
      impactResults: {},
      absorptionResults: {},
      recapAnswers: {},
      labAnswerDrafts: {},
      mission2Connections: {},
      mission2Assessments: {},
      mission2AssessmentConfirmed: {},
      mission2Completed: false,
    });
    expect(patch).not.toHaveProperty("team");
    expect(patch).not.toHaveProperty("inspectionFindings");
    expect(patch).not.toHaveProperty("studyFocus");
  });
});
