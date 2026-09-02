import { describe, expect, it } from "vitest";
import { EMPTY_SAVE } from "@/features/game/data";
import { answerEvents } from "./answer-events";

describe("answer audit", () => {
  it("records incorrect choices, changes and clearing an inspection", () => {
    const current = { ...EMPTY_SAVE, inspectionFindings: { dent: "น้ำ" as const, cup: "แรงกด" as const } };
    const changed = answerEvents(current, { inspectionFindings: { dent: "แรงกด" } });
    expect(changed.map((event) => event.payload)).toEqual([
      { field: "inspectionFindings", key: "dent", previous: "น้ำ", answer: "แรงกด" },
      { field: "inspectionFindings", key: "cup", previous: "แรงกด", answer: null },
    ]);
  });
  it("associates a partial answer with its stable student id", () => {
    const events = answerEvents(EMPTY_SAVE, { exitTickets: { "member-abc": { k: "one match", p: "", v: "" } } });
    expect(events[0]).toMatchObject({ memberId: "abc", eventType: "exit_ticket_answer_changed", payload: { answer: { k: "one match", p: "", v: "" } } });
  });
  it("tracks lab drafts and recap attempts but ignores unchanged snapshots", () => {
    expect(answerEvents(EMPTY_SAVE, { labAnswerDrafts: { impact: { cardboard: "much" } }, recapAnswers: { "0": [1, 0] } })).toHaveLength(2);
    expect(answerEvents(EMPTY_SAVE, { inspectionFindings: {}, exitTickets: {} })).toEqual([]);
  });
});
