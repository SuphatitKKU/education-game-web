import { describe, expect, it } from "vitest";
import type { ExitTicket } from "./data";
import { exitTicketProgress, isStructuredExitTicketComplete } from "./exit-ticket-progress";

const completeTicket: ExitTicket = {
  k: [
    "1. กล่องยุบ → ความต้านทานแรงกดทับ",
    "2. ของเสียหาย → ความสามารถในการลดความเสียหายจากแรงกระแทก",
    "3. กล่องเปียก → การดูดซับน้ำของวัสดุ",
  ].join("\n"),
  p: ["1. รอยยุบ → แรงกด", "2. รอยบุบ → แรงกระแทก", "3. รอยเปียก → น้ำ"].join("\n"),
  v: "ได้\nเหตุผล: วัสดุยังแข็งแรงจึงใช้ต่อได้และช่วยลดขยะ",
};

describe("individual Exit Ticket progress", () => {
  it("counts only learners who have completed all three questions", () => {
    const members = [
      { id: "one", name: "หนึ่ง", avatar: "inventor_sun", position: 0 },
      { id: "two", name: "สอง", avatar: "inventor_moon", position: 1 },
    ];
    expect(isStructuredExitTicketComplete(completeTicket)).toBe(true);
    expect(exitTicketProgress(members, { "member-one": completeTicket })).toEqual({
      completed: 1,
      total: 2,
      percent: 50,
      complete: false,
    });
  });

  it("keeps legacy student-position keys readable", () => {
    const members = [{ name: "คนเดิม", avatar: "inventor_sun", position: 4 }];
    expect(exitTicketProgress(members, { "student-4": completeTicket })).toMatchObject({
      completed: 1,
      total: 1,
      percent: 100,
      complete: true,
    });
  });
});
