import type { TeamMember } from "@/features/game/data";

export const MIN_TEAM_MEMBERS = 4;
export const MAX_TEAM_MEMBERS = 7;

export type TeamValidation = {
  valid: boolean;
  message: string;
};

export function validateTeamDraft(teamName: string, members: TeamMember[], requireName = true): TeamValidation {
  if (requireName && !teamName.trim()) return { valid: false, message: "กรุณาตั้งชื่อทีม" };
  if (teamName.trim().length > 60) return { valid: false, message: "ชื่อทีมต้องไม่เกิน 60 ตัวอักษร" };
  if (members.length < MIN_TEAM_MEMBERS || members.length > MAX_TEAM_MEMBERS) return { valid: false, message: `ทีมต้องมีสมาชิก ${MIN_TEAM_MEMBERS}–${MAX_TEAM_MEMBERS} คน` };
  if (members.some((member) => !member.name.trim())) return { valid: false, message: "กรอกชื่อเล่นให้ครบทุกคน" };
  if (members.some((member) => member.name.trim().length > 20)) return { valid: false, message: "ชื่อเล่นต้องไม่เกิน 20 ตัวอักษร" };
  const names = members.map((member) => member.name.trim().toLocaleLowerCase("th"));
  if (new Set(names).size !== names.length) return { valid: false, message: "ชื่อเล่นในทีมต้องไม่ซ้ำกัน" };
  if (new Set(members.map((member) => member.avatar)).size !== members.length) return { valid: false, message: "ตัวละครในทีมต้องไม่ซ้ำกัน" };
  return { valid: true, message: "ทีมพร้อมออกเดินทาง!" };
}
