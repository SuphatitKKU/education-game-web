export function readValueAnswer(value: string) {
  const choice = value.startsWith("ไม่ได้") || value.startsWith("ไม่เหมาะสม")
    ? "ไม่ได้"
    : value.startsWith("ได้") || value.startsWith("เหมาะสม")
      ? "ได้"
      : "";
  const marker = "เหตุผล:";
  const raw = value.includes(marker) ? value.slice(value.indexOf(marker) + marker.length) : "";
  // Remove only the separator inserted by writeValueAnswer, not the learner's spaces.
  return { choice, reason: raw.startsWith(" ") ? raw.slice(1) : raw };
}

function normalized(value: string) {
  return value.toLocaleLowerCase("th").replace(/\s+/g, "");
}

export function evaluateValueAnswer(value: string) {
  const { choice, reason } = readValueAnswer(value);
  const compact = normalized(reason);
  const identifiesSuitableCondition = [
    "สภาพเหมาะสม", "ยังเหมาะสม", "ยังใช้ได้", "ไม่ชำรุด", "ไม่เสียหาย", "ยังแข็งแรง",
  ].some((phrase) => compact.includes(normalized(phrase)));
  const identifiesWasteBenefit = [
    "ลดการใช้วัสดุใหม่", "ใช้วัสดุใหม่น้อย", "ลดวัสดุใหม่", "ลดปริมาณขยะ", "ลดขยะ", "ขยะน้อย",
  ].some((phrase) => compact.includes(normalized(phrase)));
  return {
    choiceCorrect: choice === "ได้",
    identifiesSuitableCondition,
    identifiesWasteBenefit,
    // Students may express a sound reason in words different from the suggested phrases.
    // Require an answer and a written explanation, while keeping the phrase checks as feedback only.
    complete: Boolean(choice && reason.trim()),
  };
}

export function writeValueAnswer(choice: string, reason: string) {
  return `${choice}\nเหตุผล: ${reason}`;
}
