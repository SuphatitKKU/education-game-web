import { describe, expect, it } from "vitest";
import { attendingMembers, exitTicketKey, reconcileExitTickets } from "./team-attendance";

describe("team attendance", () => {
  it("keeps only students marked present for the current session", () => {
    const members = [
      { name: "เอ", avatar: "a", present: true },
      { name: "บี", avatar: "b", present: false },
      { name: "ซี", avatar: "c" },
    ];
    expect(attendingMembers(members).map((member) => member.name)).toEqual(["เอ", "ซี"]);
  });

  it("uses a stable member id and falls back to the database position", () => {
    expect(exitTicketKey({ id: "member-c", name: "ซี", avatar: "c", position: 4 }, 1)).toBe("member-member-c");
    expect(exitTicketKey({ name: "ใหม่", avatar: "d" }, 2)).toBe("student-2");
  });

  it("moves a legacy answer to the same student without giving it to a replacement", () => {
    const answer = { k: "รู้แล้ว", p: "อยากรู้", v: "ได้เรียนรู้" };
    const previous = [
      { id: "old", name: "เอ", avatar: "a", position: 0 },
      { id: "same", name: "บี", avatar: "b", position: 1 },
    ];
    const next = [
      { id: "new", name: "คนใหม่", avatar: "c", position: 0 },
      { id: "same", name: "บี", avatar: "b", position: 1 },
    ];
    const result = reconcileExitTickets(previous, next, { "student-0": answer, "student-1": answer });
    expect(result["member-new"]).toBeUndefined();
    expect(result["member-same"]).toEqual(answer);
  });
});
