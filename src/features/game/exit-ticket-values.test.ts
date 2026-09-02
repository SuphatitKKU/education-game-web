import { describe, expect, it } from "vitest";
import { readValueAnswer, writeValueAnswer } from "./exit-ticket-values";

describe("individual written reasons", () => {
  it("keeps spaces and newlines while a learner is typing, even before choosing", () => {
    for (const choice of ["", "เหมาะสม", "ไม่เหมาะสม"]) {
      const reason = " ควร ทดลองก่อน\nเพราะ ";
      expect(readValueAnswer(writeValueAnswer(choice, reason))).toEqual({ choice, reason });
    }
  });
  it("reads previously saved values", () => {
    expect(readValueAnswer("ไม่เหมาะสม\nเหตุผล: ต้องมีหลักฐาน")).toEqual({ choice: "ไม่เหมาะสม", reason: "ต้องมีหลักฐาน" });
    expect(readValueAnswer("")).toEqual({ choice: "", reason: "" });
  });
});
