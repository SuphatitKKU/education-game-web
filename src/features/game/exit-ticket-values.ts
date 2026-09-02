export function readValueAnswer(value: string) {
  const choice = value.startsWith("ไม่เหมาะสม") ? "ไม่เหมาะสม" : value.startsWith("เหมาะสม") ? "เหมาะสม" : "";
  const marker = "เหตุผล:";
  const raw = value.includes(marker) ? value.slice(value.indexOf(marker) + marker.length) : "";
  // Remove only the separator inserted by writeValueAnswer, not the learner's spaces.
  return { choice, reason: raw.startsWith(" ") ? raw.slice(1) : raw };
}

export function writeValueAnswer(choice: string, reason: string) {
  return `${choice}\nเหตุผล: ${reason}`;
}
