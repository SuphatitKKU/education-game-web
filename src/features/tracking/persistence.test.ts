import { describe, expect, it } from "vitest";
import { EMPTY_SAVE } from "@/features/game/data";
import { compactOutbox, RevisionConflictError, withLegacyExitTicketKeys, type OutboxItem } from "./persistence";

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

  it("never silently drops unanswered/offline runs when more than 20 teams play", () => {
    const items = Array.from({ length: 22 }, (_, index) => queued(`run-${index}`, 1));
    const result = compactOutbox(items, queued("run-latest", 1));
    expect(result).toHaveLength(23);
    expect(result.at(-1)?.run.id).toBe("run-latest");
  });

  it("coalesces snapshots without losing answer history", () => {
    const first = { ...queued("run-1", 1), events: [{ id: "e1", eventType: "answer", stage: "inspection" as const }] };
    const newest = { ...queued("run-1", 1), events: [{ id: "e2", eventType: "answer", stage: "inspection" as const }] };
    expect(compactOutbox([first], newest)[0].events.map((event) => event.id)).toEqual(["e1", "e2"]);
  });

  it("does not replace a queued completion with later navigation", () => {
    const completed = { ...queued("run-1", 1), complete: true, save: { ...EMPTY_SAVE, stage: "mission1Complete" as const } };
    expect(compactOutbox([completed], queued("run-1", 1))[0].save.stage).toBe("mission1Complete");
  });

  it("carries the server run on a revision conflict", () => {
    const serverRun = {
      id: "run-1", teamId: "team-1", status: "in_progress" as const, currentStage: "inspection" as const,
      saveState: { ...EMPTY_SAVE, stage: "inspection" as const }, revision: 4,
      startedAt: "2026-08-25T01:00:00Z", updatedAt: "2026-08-25T01:10:00Z", completedAt: null,
    };
    expect(new RevisionConflictError(serverRun).serverRun.revision).toBe(4);
  });

  it("sends individual answers with stable and legacy keys for incomplete attendance", () => {
    const answer = { k: "ความรู้", p: "กระบวนการ", v: "คุณค่า" };
    const save = withLegacyExitTicketKeys({
      ...EMPTY_SAVE,
      team: [{ id: "member-present", name: "มาเรียน", avatar: "inventor_sun", position: 3 }],
      exitTickets: { "member-member-present": answer },
    });
    expect(save.exitTickets["member-member-present"]).toEqual(answer);
    expect(save.exitTickets["student-3"]).toEqual(answer);
    expect(save.team).toHaveLength(1);
  });
});
