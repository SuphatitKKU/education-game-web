import { describe, expect, it } from "vitest";
import { evaluateValueAnswer, readValueAnswer, writeValueAnswer } from "./exit-ticket-values";

describe("individual written reasons", () => {
  it("keeps spaces and newlines while a learner is typing, even before choosing", () => {
    for (const choice of ["", "ได้", "ไม่ได้"]) {
      const reason = " ควร ทดลองก่อน\nเพราะ ";
      expect(readValueAnswer(writeValueAnswer(choice, reason))).toEqual({ choice, reason });
    }
  });
  it("reads previously saved values", () => {
    expect(readValueAnswer("ไม่เหมาะสม\nเหตุผล: ต้องมีหลักฐาน")).toEqual({ choice: "ไม่ได้", reason: "ต้องมีหลักฐาน" });
    expect(readValueAnswer("")).toEqual({ choice: "", reason: "" });
  });
  it("marks a selected answer with a written reason as complete", () => {
    expect(evaluateValueAnswer(writeValueAnswer("ได้", "วัสดุยังมีสภาพเหมาะสม จึงช่วยลดการใช้วัสดุใหม่และลดขยะ"))).toEqual({
      choiceCorrect: true,
      identifiesSuitableCondition: true,
      identifiesWasteBenefit: true,
      complete: true,
    });
    expect(evaluateValueAnswer(writeValueAnswer("ได้", "วัสดุยังใช้ได้"))).toMatchObject({ complete: true, identifiesWasteBenefit: false });
    expect(evaluateValueAnswer(writeValueAnswer("ได้", "ช่วยลดขยะ"))).toMatchObject({ complete: true, identifiesSuitableCondition: false });
    expect(evaluateValueAnswer(writeValueAnswer("", "มีเหตุผล"))).toMatchObject({ complete: false });
    expect(evaluateValueAnswer(writeValueAnswer("ได้", "   "))).toMatchObject({ complete: false });
  });
});
