import { describe, expect, it } from "vitest";
import { formatDuration, isToday, stageProgress } from "./progress";

describe("tracking progress", () => {
  it("maps active lesson stages to monotonic progress", () => {
    const values = ["mission", "story", "inspection", "materials", "studyFocus", "exitTicket", "summary"].map((stage) => stageProgress(stage as Parameters<typeof stageProgress>[0]));
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(100);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it("formats classroom run durations", () => {
    expect(formatDuration("2026-08-25T01:00:00Z", "2026-08-25T01:42:00Z")).toBe("42 นาที");
    expect(formatDuration("2026-08-25T01:00:00Z", "2026-08-25T02:30:00Z")).toBe("1 ชม. 30 นาที");
  });

  it("includes enabled laboratory stages in teacher progress", () => {
    for (const stage of ["testHub", "compression", "impact", "absorption", "recap"] as const) {
      expect(stageProgress(stage)).toBeGreaterThan(stageProgress("exitTicket"));
      expect(stageProgress(stage)).toBeLessThan(100);
    }
  });

  it("marks the mission-one celebration as a completed mission", () => {
    expect(stageProgress("mission1Complete")).toBe(100);
  });

  it("recognizes completions from today", () => {
    expect(isToday("2026-08-25T08:00:00+07:00", new Date("2026-08-25T20:00:00+07:00"))).toBe(true);
    expect(isToday("2026-08-24T08:00:00+07:00", new Date("2026-08-25T20:00:00+07:00"))).toBe(false);
  });
});
