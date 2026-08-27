import { describe, expect, it } from "vitest";
import { validateTeamDraft } from "./validation";

const members = Array.from({ length: 6 }, (_, index) => ({ name: `เด็ก ${index + 1}`, avatar: `avatar-${index + 1}` }));

describe("team validation", () => {
  it("accepts a named team with six unique members", () => {
    expect(validateTeamDraft("ทีมสายฟ้า", members)).toEqual({ valid: true, message: "ทีมพร้อมออกเดินทาง!" });
  });

  it("rejects duplicate nicknames regardless of case", () => {
    const duplicate = members.map((member) => ({ ...member }));
    duplicate[1].name = "เด็ก 1";
    expect(validateTeamDraft("ทีมสายฟ้า", duplicate).valid).toBe(false);
  });

  it("rejects duplicate avatars and invalid team sizes", () => {
    const duplicateAvatar = members.map((member) => ({ ...member }));
    duplicateAvatar[1].avatar = duplicateAvatar[0].avatar;
    expect(validateTeamDraft("ทีมสายฟ้า", duplicateAvatar).valid).toBe(false);
    expect(validateTeamDraft("ทีมสายฟ้า", members.slice(0, 5)).valid).toBe(false);
  });
});
