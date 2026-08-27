import { describe, expect, it } from "vitest";
import { EMPTY_SAVE } from "@/features/game/data";
import { parseLegacyBundle } from "./legacy";

const team = Array.from({ length: 6 }, (_, index) => ({ name: `เด็ก ${index + 1}`, avatar: `inventor-${index}` }));

describe("legacy import parsing", () => {
  it("normalizes an active v1 save and keeps completed statistics", () => {
    const bundle = parseLegacyBundle(
      JSON.stringify({ ...EMPTY_SAVE, team, stage: "inspection", inspectionIndex: 2 }),
      JSON.stringify([{ runId: "legacy-1", submittedAt: "2026-08-25T01:00:00Z", members: team.map((member) => member.name) }]),
    );
    expect(bundle.save?.stage).toBe("inspection");
    expect(bundle.save?.inspectionIndex).toBe(2);
    expect(bundle.statistics).toHaveLength(1);
  });

  it("ignores malformed or incomplete legacy data without deleting it", () => {
    expect(parseLegacyBundle("not-json", "also-not-json")).toEqual({ save: null, statistics: [] });
    expect(parseLegacyBundle(JSON.stringify({ team: team.slice(0, 5) }), null).save).toBeNull();
  });
});
