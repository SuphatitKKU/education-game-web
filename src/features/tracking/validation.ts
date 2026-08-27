import type { TeamMember } from "@/features/game/data";

export type TeamValidation = {
  valid: boolean;
  message: string;
};

export function validateTeamDraft(teamName: string, members: TeamMember[], requireName = true): TeamValidation {
  if (requireName && !teamName.trim()) return { valid: false, message: "กรุณาตั้งชื่อทีม" };
  if (teamName.trim().length > 60) return { valid: false, message: "ชื่อทีมต้องไม่เกิน 60 ตัวอักษร" };
  if (members.length < 6 || members.length > 7) return { valid: false, message: "ทีมต้องมีสมาชิก 6–7 คน" };
  if (members.some((member) => !member.name.trim())) return { valid: false, message: "กรอกชื่อเล่นให้ครบทุกคน" };
  if (members.some((member) => member.name.trim().length > 20)) return { valid: false, message: "ชื่อเล่นต้องไม่เกิน 20 ตัวอักษร" };
  const names = members.map((member) => member.name.trim().toLocaleLowerCase("th"));
  if (new Set(names).size !== names.length) return { valid: false, message: "ชื่อเล่นในทีมต้องไม่ซ้ำกัน" };
  if (new Set(members.map((member) => member.avatar)).size !== members.length) return { valid: false, message: "ตัวละครในทีมต้องไม่ซ้ำกัน" };
  return { valid: true, message: "ทีมพร้อมออกเดินทาง!" };
}
