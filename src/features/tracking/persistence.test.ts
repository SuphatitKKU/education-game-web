import { describe, expect, it } from "vitest";
import { EMPTY_SAVE } from "@/features/game/data";
import { compactOutbox, RevisionConflictError, type OutboxItem } from "./persistence";

function queued(runId: string, revision: number): OutboxItem {
  return {
    id: `${runId}-${revision}`,
    run: { id: runId, teamId: "team-1", revision },
    save: { ...EMPTY_SAVE, stage: "story" },
    events: [],
    complete: false,
    createdAt: new Date(2026, 7, 25, 10, revision).toISOString(),
  };
}

describe("offline checkpoint queue", () => {
  it("keeps only the newest checkpoint for each active run", () => {
    const first = queued("run-1", 1);
    const newest = queued("run-1", 2);
    const another = queued("run-2", 1);
    expect(compactOutbox([first, another], newest)).toEqual([another, newest]);
  });

  it("caps queued runs so browser storage cannot grow without bounds", () => {
    const items = Array.from({ length: 22 }, (_, index) => queued(`run-${index}`, 1));
    const result = compactOutbox(items, queued("run-latest", 1));
    expect(result).toHaveLength(20);
    expect(result.at(-1)?.run.id).toBe("run-latest");
  });

  it("carries the server run on a revision conflict", () => {
    const serverRun = {
      id: "run-1", teamId: "team-1", status: "in_progress" as const, currentStage: "inspection" as const,
      saveState: { ...EMPTY_SAVE, stage: "inspection" as const }, revision: 4,
      startedAt: "2026-08-25T01:00:00Z", updatedAt: "2026-08-25T01:10:00Z", completedAt: null,
    };
    expect(new RevisionConflictError(serverRun).serverRun.revision).toBe(4);
  });
});
