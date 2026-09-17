import { describe, expect, it } from "vitest";
import { shouldAutoResume, stageAfterChoosingTeam } from "./resume-stage";

describe("stageAfterChoosingTeam", () => {
  it.each([
    "story",
    "inspection",
    "boxMission",
    "materials",
    "studyFocus",
    "exitTicket",
    "testHub",
    "compression",
    "absorption",
    "impact",
    "notebook",
    "comparison",
    "recap",
    "mission3Data",
    "mission3Materials",
    "mission3Design",
    "mission3Reason",
  ] as const)("resumes an active run at %s without restarting it", (stage) => {
    expect(stageAfterChoosingTeam(stage, 1)).toBe(stage);
    expect(stageAfterChoosingTeam(stage, 2)).toBe(stage);
    expect(stageAfterChoosingTeam(stage, 3)).toBe(stage);
  });

  it("maps the legacy elasticity checkpoint to the current impact screen", () => {
    expect(stageAfterChoosingTeam("elasticity", 2)).toBe("impact");
  });

  it.each([
    [1, "mission"],
    [2, "mission2Review"],
    [3, "mission3Intro"],
  ] as const)("uses the selected mission %s only for a new run", (mission, expected) => {
    expect(stageAfterChoosingTeam(null, mission)).toBe(expected);
  });

  it.each([
    ["menu", 2, "mission2Review"],
    ["purpose", 2, "mission2Review"],
    ["overview", 2, "mission2Review"],
    ["team", 3, "mission3Intro"],
  ] as const)("does not resume the non-playing checkpoint %s", (stage, mission, expected) => {
    expect(stageAfterChoosingTeam(stage, mission)).toBe(expected);
  });

  it("auto-resumes a refreshed page only when it was inside an active run", () => {
    expect(shouldAutoResume({ runId: "browser-run", stage: "exitTicket" })).toBe(true);
    expect(shouldAutoResume({ runId: "browser-run", stage: "inspection" })).toBe(true);
    expect(shouldAutoResume({ runId: "browser-run", stage: "team" })).toBe(false);
    expect(shouldAutoResume({ runId: "", stage: "exitTicket" })).toBe(false);
  });
});
