import { describe, expect, it, vi } from "vitest";
import { EMPTY_SAVE } from "@/features/game/data";
import { markLegacyImported, markSupabaseCacheBound, parseLegacyBundle, readLegacyBundle, wasLegacyImported } from "./legacy";

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

  it("keeps booting when Safari exposes storage but blocks access", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceededError"); },
    });
    try {
      expect(readLegacyBundle()).toEqual({ save: null, statistics: [] });
      expect(wasLegacyImported()).toBe(false);
      expect(() => markLegacyImported()).not.toThrow();
      expect(() => markSupabaseCacheBound()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
