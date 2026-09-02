import { MATERIALS, type GameSave, type Stage } from "./data";
import { STUDY_TOPICS } from "./learning-topics";

export const LAB_ROOMS_ENABLED = true;
export const LAB_STAGES = ["testHub", "compression", "impact", "absorption", "recap"] as const satisfies readonly Stage[];
export type LabRoom = "compression" | "absorption" | "impact";

// Keep the same five materials as the active material exploration lesson.
export const LAB_MATERIALS = ["corrugated_cardboard", "cardboard", "bubble_wrap", "closed_cell_pe_foam", "pe_sheet"]
  .map((id) => MATERIALS.find((material) => material.id === id)!);

export const LAB_ROOMS = [
  { ...STUDY_TOPICS[0], id: "compression", number: 1, icon: "📦", notice: "", indexKey: "compressionIndex", resultsKey: "compressionResults" },
  { ...STUDY_TOPICS[1], id: "impact", number: 2, icon: "🥚", notice: "", indexKey: "impactIndex", resultsKey: "impactResults" },
  { ...STUDY_TOPICS[2], id: "absorption", number: 3, icon: "💧", notice: "", indexKey: "absorptionIndex", resultsKey: "absorptionResults" },
] as const;

export function labRoomDetails(id: LabRoom) {
  return LAB_ROOMS.find((room) => room.id === id)!;
}

export function labResultCount(save: GameSave, room: LabRoom) {
  const definition = LAB_ROOMS.find((item) => item.id === room)!;
  return LAB_MATERIALS.filter((material) => Boolean(save[definition.resultsKey]?.[material.id])).length;
}

export function allLabsComplete(save: GameSave) {
  return LAB_ROOMS.every((room) => labResultCount(save, room.id) === LAB_MATERIALS.length);
}

export function openLabPatch(save: GameSave, room: LabRoom): Partial<GameSave> {
  const definition = LAB_ROOMS.find((item) => item.id === room)!;
  // Find the first unfinished material by ID, including saves from older material orders.
  const unfinished = LAB_MATERIALS.findIndex((material) => !save[definition.resultsKey]?.[material.id]);
  return { stage: room, [definition.indexKey]: unfinished < 0 ? 0 : unfinished };
}
