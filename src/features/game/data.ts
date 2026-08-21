export type Stage = "menu" | "team" | "story" | "inspection" | "compression" | "recap" | "prediction" | "summary";

export type TeamMember = { name: string; avatar: string };

export type CompressionResult = {
  materialId: string;
  measurements: number[];
  residual: number;
  recovered: number;
};

export type GameSave = {
  version: 1;
  stage: Stage;
  team: TeamMember[];
  storyIndex: number;
  inspectionIndex: number;
  compressionIndex: number;
  compressionResults: Record<string, CompressionResult>;
  recapIndex: number;
  predictions: Record<string, string>;
  audio: boolean;
};

export const EMPTY_SAVE: GameSave = {
  version: 1,
  stage: "menu",
  team: [],
  storyIndex: 0,
  inspectionIndex: 0,
  compressionIndex: 0,
  compressionResults: {},
  recapIndex: 0,
  predictions: {},
  audio: true,
};

export const AVATARS = [
  "inventor_sun", "inventor_star", "inventor_green", "inventor_glasses",
  "inventor_curls", "inventor_cap", "inventor_braids",
];

export const STORY = [
  ["shot_01_sender_packs.png", "ผู้ส่งเตรียมของและเลือกกล่องสำหรับการเดินทาง"],
  ["shot_02_sender_seals.png", "กล่องถูกปิดผนึก ก่อนส่งต่อให้ไรเดอร์"],
  ["shot_03_rider_departure.png", "การเดินทางเริ่มขึ้นบนถนนที่ไม่ราบเรียบ"],
  ["shot_04_rain_damage.png", "ฝนทำให้กล่องเปียกและอ่อนตัว"],
  ["shot_05_stack_pressure.png", "กล่องใบอื่นกดทับจนผนังยุบ"],
  ["shot_06_corner_impact.png", "แรงตกกระแทกทำให้มุมกล่องบุบ"],
  ["shot_07_friction_tear.png", "การเสียดสีอาจทำให้ผิวกล่องฉีก"],
  ["shot_08_receiver_gets_box.png", "ผู้รับได้กล่องที่ผ่านเหตุการณ์หลายอย่าง"],
  ["shot_09_safe_contents.png", "กล่องที่ดีต้องช่วยปกป้องของด้านใน"],
  ["shot_10_team_mission.png", "ถึงเวลาที่ทีมของเราจะออกแบบกล่องที่แกร่งกว่าเดิม!"],
] as const;

export const DAMAGES = [
  { id: "dent", title: "จุดไหนยุบจากแรงกดทับ?", image: "damaged_box_preview_top.png", hint: "ลองดูบริเวณด้านบนของกล่อง" },
  { id: "wet", title: "จุดไหนเปียกน้ำ?", image: "damaged_box_preview_wet.png", hint: "มองหาคราบสีเข้มบริเวณผิวกล่อง" },
  { id: "torn", title: "จุดไหนฉีกขาด?", image: "damaged_box_preview_torn.png", hint: "ลองหมุนดูด้านข้างและมุมล่าง" },
  { id: "corner", title: "มุมไหนบุบจากการตกกระแทก?", image: "damaged_box_preview.png", hint: "มองหามุมที่เสียรูปไม่เท่ากับด้านอื่น" },
] as const;

export const MATERIALS = [
  { id: "corrugated_cardboard", name: "กระดาษลูกฟูก", image: "corrugated_cardboard.png", sag: [1, 2, 4], residual: 1 },
  { id: "closed_cell_pe_foam", name: "แผ่นโฟม PE", image: "closed_cell_pe_foam.png", sag: [2, 4, 7], residual: 0 },
  { id: "bubble_wrap", name: "แผ่นกันกระแทก", image: "bubble_wrap.png", sag: [3, 6, 10], residual: 1 },
  { id: "cardboard", name: "กระดาษแข็ง", image: "cardboard.png", sag: [3, 6, 9], residual: 3 },
  { id: "pe_sheet", name: "แผ่นพลาสติก PE", image: "pe_sheet.png", sag: [4, 8, 12], residual: 2 },
  { id: "kraft_paper", name: "กระดาษคราฟต์", image: "kraft_paper.png", sag: [6, 12, 18], residual: 14 },
  { id: "waxed_paper", name: "กระดาษเคลือบไข", image: "waxed_paper.png", sag: [5, 10, 16], residual: 11 },
] as const;

export const RECAP = [
  { question: "ผู้ส่งต้องการอะไรจากกล่องพัสดุ?", choices: ["ปกป้องของระหว่างทาง", "มีสีเข้มที่สุด", "มีขนาดใหญ่ที่สุด"], answer: 0 },
  { question: "เมื่อฝนตก กล่องกระดาษอาจเกิดอะไรขึ้น?", choices: ["เปียกและอ่อนตัว", "แข็งขึ้นทันที", "ลอยขึ้นฟ้า"], answer: 0 },
  { question: "เหตุใดเราจึงทดลองด้วยน้ำหนักเท่ากัน?", choices: ["เพื่อเปรียบเทียบวัสดุอย่างยุติธรรม", "เพื่อให้ขวดสวย", "เพื่อให้เกมเร็วขึ้น"], answer: 0 },
] as const;

export const BOX_PARTS = ["โครงกล่อง", "ชั้นป้องกันน้ำ", "วัสดุเติมช่องว่าง", "วัสดุกันกระแทก"] as const;
