import { describe, expect, it } from "vitest";
import { DAMAGE_CAUSES, DAMAGES, EMPTY_SAVE, MATERIALS, STORY } from "./data";

describe("active lesson-plan content", () => {
  it("starts new saves without prefilled inspection evidence", () => {
    expect(EMPTY_SAVE.inspectionFindings).toEqual({});
  });

  it("offers neutral evidence prompts and includes the damaged cup", () => {
    expect(DAMAGES.map((damage) => damage.id)).toContain("cup");
    expect(DAMAGES.every((damage) => !damage.title.includes("แรงกด") && !damage.title.includes("แรงกระแทก") && !damage.title.includes("น้ำ"))).toBe(true);
    expect(DAMAGE_CAUSES).toEqual(["แรงกด", "แรงกระแทก", "น้ำ"]);
  });

  it("keeps the friction and tear scene out of the active research story", () => {
    expect(STORY).toHaveLength(9);
    expect(STORY.some(([image]) => image === "shot_07_friction_tear.png")).toBe(false);
  });

  it("uses the five formal material names from lesson plan 1", () => {
    const activeIds = ["corrugated_cardboard", "cardboard", "bubble_wrap", "closed_cell_pe_foam", "pe_sheet"];
    const names = activeIds.map((id) => MATERIALS.find((material) => material.id === id)?.name);
    expect(names).toEqual([
      "กระดาษลูกฟูก",
      "กระดาษหน้าขาวหลังเทา 400 แกรม",
      "แผ่นพลาสติกกันกระแทกชนิดฟองอากาศ",
      "แผ่นโฟม EPE",
      "แผ่นพลาสติก PE",
    ]);
  });
});
