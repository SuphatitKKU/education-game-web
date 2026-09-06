import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("revised lesson-plan language", () => {
  it("removes the superseded weight and economy wording from every Simulation screen", () => {
    const screenSources = [
      readFileSync("src/features/game/GameApp.tsx", "utf8"),
      readFileSync("src/features/game/MissionOverview.tsx", "utf8"),
      readFileSync("src/features/game/data.ts", "utf8"),
    ].join("\n");
    for (const phrase of ["น้ำหนักเบา", "น้ำหนักไม่มาก", "ประหยัด", "สิ้นเปลือง"]) {
      expect(screenSources).not.toContain(phrase);
    }
  });
});
