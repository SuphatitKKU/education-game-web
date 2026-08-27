export type Stage = "menu" | "team" | "mission" | "story" | "inspection" | "materials" | "studyFocus" | "exitTicket" | "testHub" | "compression" | "absorption" | "elasticity" | "recap" | "prediction" | "summary";

export type DamageCause = "แรงกด" | "แรงกระแทก" | "น้ำ";

export type TeamMember = { name: string; avatar: string; id?: string; position?: number };

export type CompressionResult = {
  materialId: string;
  measurements: number[];
  residual: number;
  recovered: number;
};

export type WaterAbsorptionResult = {
  materialId: string;
  drops: number[];
  absorbed: number;
  summary: string;
};

export type ElasticityResult = {
  materialId: string;
  stretch: number[];
  residual: number;
  recovered: number;
  summary: string;
};

export type ExitTicket = {
  k: string;
  p: string;
  v: string;
};

export const COMPRESSION_FRAME_KEYS = ["idle", "load1", "load2", "load3", "released"] as const;
export type CompressionFrameKey = (typeof COMPRESSION_FRAME_KEYS)[number];

export type MaterialDefinition = {
  id: string;
  name: string;
  image: string;
  guide: string;
  testFrames: Record<CompressionFrameKey, string>;
  sag: readonly [number, number, number];
  residual: number;
  releaseSummary: string;
  waterDrops: readonly [number, number, number];
  waterSummary: string;
  elasticityStretch: readonly [number, number, number];
  elasticityResidual: number;
  elasticitySummary: string;
  motion: {
    loadMs: number;
    releaseMs: number;
    easing: string;
    releaseEffect: "settle" | "soft" | "spring";
  };
};

export type GameSave = {
  version: 1;
  stage: Stage;
  team: TeamMember[];
  storyIndex: number;
  missionStudent: string;
  routeEvents: Record<string, boolean>;
  inspectionIndex: number;
  inspectionFindings: Record<string, DamageCause>;
  compressionIndex: number;
  absorptionIndex: number;
  elasticityIndex: number;
  compressionResults: Record<string, CompressionResult>;
  absorptionResults: Record<string, WaterAbsorptionResult>;
  elasticityResults: Record<string, ElasticityResult>;
  recapIndex: number;
  runId: string;
  studyFocus: Record<string, boolean>;
  exitTickets: Record<string, ExitTicket>;
  predictions: Record<string, string>;
  audio: boolean;
};

export const EMPTY_SAVE: GameSave = {
  version: 1,
  stage: "menu",
  team: [],
  storyIndex: 0,
  missionStudent: "",
  routeEvents: {},
  inspectionIndex: 0,
  inspectionFindings: {},
  compressionIndex: 0,
  absorptionIndex: 0,
  elasticityIndex: 0,
  compressionResults: {},
  absorptionResults: {},
  elasticityResults: {},
  recapIndex: 0,
  runId: "",
  studyFocus: {},
  exitTickets: {},
  predictions: {},
  audio: true,
};

export const AVATARS = [
  "inventor_sun", "inventor_star", "inventor_green", "inventor_glasses",
  "inventor_curls", "inventor_cap", "inventor_braids",
];

// Keep the friction/tear scene ready for later, but exclude it from the research flow for now.
const TORN_DAMAGE_STORY_ENABLED = false;
const ALL_STORY_SCENES = [
  ["shot_01_sender_packs.png", "ผู้ส่งเตรียมของและเลือกกล่องสำหรับการเดินทาง"],
  ["shot_02_sender_seals.png", "กล่องถูกปิดผนึก ก่อนส่งต่อให้ไรเดอร์"],
  ["shot_03_rider_departure.png", "การเดินทางเริ่มขึ้นบนถนนที่ไม่ราบเรียบ"],
  ["shot_04_rain_damage.png", "ฝนทำให้กล่องเปียกและอ่อนตัว"],
  ["shot_05_stack_pressure.png", "กล่องใบอื่นกดทับจนผนังยุบ"],
  ["shot_06_corner_impact.png", "แรงตกกระแทกทำให้มุมกล่องบุบ"],
  ["shot_07_friction_tear.png", "การเสียดสีอาจทำให้ผิวกล่องฉีก"],
  ["shot_08_receiver_gets_box.png", "ผู้รับได้กล่องที่ผ่านเหตุการณ์หลายอย่าง"],
  ["shot_09_cracked_cup.png", "กล่องที่ดีต้องช่วยปกป้องของด้านใน"],
  ["shot_10_team_mission.png", "ถึงเวลาที่ทีมของเราจะออกแบบกล่องที่แกร่งกว่าเดิม!"],
] as const;
export const STORY = ALL_STORY_SCENES.filter(([image]) => TORN_DAMAGE_STORY_ENABLED || image !== "shot_07_friction_tear.png");

export const DAMAGE_CAUSES: readonly DamageCause[] = ["แรงกด", "แรงกระแทก", "น้ำ"];

// Keep the tear hotspot data ready for later, but exclude it from the research flow for now.
const TORN_DAMAGE_INSPECTION_ENABLED = false;
const ALL_DAMAGES = [
  { id: "dent", title: "รอยยุบอยู่จุดไหน?", hint: "ลองดูแอ่งยุบลึกบนฝากล่องด้านหน้า", evidence: "รอยยุบด้านบน", position: "0.28m -0.10m 1.91m", normal: "0 0.96 0.28" },
  { id: "wet", title: "รอยเปียกอยู่จุดไหน?", hint: "มองหาคราบสีน้ำตาลเข้มเป็นด่างบนผิวกล่อง", evidence: "คราบเปียกน้ำ", position: "-1.05m -0.18m 1.35m", normal: "0 0 1" },
  { id: "torn", title: "รอยฉีกขาดอยู่จุดไหน?", hint: "ลองหมุนดูรูโหว่ขอบรุ่ยที่ด้านข้าง", evidence: "รอยฉีกขาดเป็นรูโหว่", position: "-1.84m -0.32m -0.02m", normal: "-1 0 0" },
  { id: "corner", title: "รอยบุบอยู่มุมไหน?", hint: "มองหามุมที่ย่นและเสียรูป", evidence: "มุมกล่องบุบ", position: "1.43m -0.82m 1.05m", normal: "0.22 -0.64 0.74" },
  { id: "cup", title: "สิ่งของด้านในเสียหายตรงไหน?", hint: "มองหาแก้วที่มีรอยร้าวและขอบบิ่นอยู่กลางกล่อง", evidence: "แก้วด้านในแตกร้าวและขอบบิ่น", position: "0.10m 0.16m 0.52m", normal: "0 0 1" },
] as const;
export const DAMAGES = ALL_DAMAGES.filter((damage) => TORN_DAMAGE_INSPECTION_ENABLED || damage.id !== "torn");

export const ROUTE_EVENTS = [
  {
    id: "rain",
    title: "ฝนตกกลางทาง",
    short: "พัสดุถูกฝน",
    image: "shot_04_rain_damage.png",
    note: "กล่องอาจเปียกน้ำและอ่อนตัว",
    evidence: "คราบเปียก",
  },
  {
    id: "stack",
    title: "กล่องถูกวางซ้อน",
    short: "แรงกดทับ",
    image: "shot_05_stack_pressure.png",
    note: "น้ำหนักจากกล่องอื่นอาจทำให้ด้านบนยุบ",
    evidence: "รอยยุบ",
  },
  {
    id: "impact",
    title: "ตกกระแทกตอนขนย้าย",
    short: "แรงกระแทก",
    image: "shot_06_corner_impact.png",
    note: "มุมกล่องอาจบุบหรือฉีกจากการกระแทก",
    evidence: "มุมบุบ",
  },
] as const;

const testFrames = (id: string): Record<CompressionFrameKey, string> => ({
  idle: `${id}-idle.webp`,
  load1: `${id}-load1.webp`,
  load2: `${id}-load2.webp`,
  load3: `${id}-load3.webp`,
  released: `${id}-released.webp`,
});

export const MATERIALS = [
  {
    id: "corrugated_cardboard", name: "กระดาษลูกฟูก", image: "corrugated_cardboard.png", guide: "มีแผ่นผิวเรียบประกบลอนกระดาษอยู่ตรงกลาง",
    testFrames: testFrames("corrugated_cardboard"), sag: [1, 2, 4], residual: 1,
    releaseSummary: "คืนเกือบหมด · ลอนยังบุบเล็กน้อย",
    waterDrops: [1, 2, 4], waterSummary: "ซึมตามผิวกระดาษและร่องลอนเล็กน้อย",
    elasticityStretch: [1, 2, 3], elasticityResidual: 1, elasticitySummary: "งอได้บ้าง แต่คืนตัวไม่เหมือนยาง",
    motion: { loadMs: 220, releaseMs: 320, easing: "cubic-bezier(.2,.8,.2,1)", releaseEffect: "settle" },
  },
  {
    id: "closed_cell_pe_foam", name: "แผ่นโฟม EPE", image: "closed_cell_pe_foam.png", guide: "แผ่นสีขาว เนื้อนุ่ม มีผิวเซลล์ละเอียด",
    testFrames: testFrames("closed_cell_pe_foam"), sag: [2, 4, 7], residual: 0,
    releaseSummary: "เด้งกลับเต็มที่",
    waterDrops: [0, 0, 1], waterSummary: "ผิวกันน้ำได้ดี น้ำแทบไม่ซึมเข้าเซลล์ปิด",
    elasticityStretch: [4, 8, 12], elasticityResidual: 1, elasticitySummary: "ยืดและคืนตัวนุ่ม เหลือรอยน้อยมาก",
    motion: { loadMs: 300, releaseMs: 650, easing: "cubic-bezier(.22,.8,.3,1)", releaseEffect: "soft" },
  },
  {
    id: "bubble_wrap", name: "แผ่นพลาสติกกันกระแทกชนิดฟองอากาศ", image: "bubble_wrap.png", guide: "แผ่นพลาสติกใส มีฟองอากาศเรียงต่อกัน",
    testFrames: testFrames("bubble_wrap"), sag: [3, 6, 10], residual: 1,
    releaseSummary: "ฟองอากาศเด้งกลับเกือบหมด",
    waterDrops: [0, 0, 0], waterSummary: "น้ำไม่ซึมผ่านฟิล์มพลาสติก แต่ไหลไปตามช่องว่างได้",
    elasticityStretch: [5, 10, 16], elasticityResidual: 2, elasticitySummary: "ฟิล์มยืดได้และเด้งกลับเร็ว",
    motion: { loadMs: 180, releaseMs: 420, easing: "cubic-bezier(.2,.9,.25,1)", releaseEffect: "spring" },
  },
  {
    id: "cardboard", name: "กระดาษหน้าขาวหลังเทา 400 แกรม", image: "cardboard.png", guide: "แผ่นกระดาษเนื้อแน่น ด้านหน้าสีขาวและด้านหลังสีเทา",
    testFrames: testFrames("cardboard"), sag: [3, 6, 9], residual: 3,
    releaseSummary: "คืนบางส่วน · มีรอยพับ",
    waterDrops: [2, 5, 8], waterSummary: "ดูดน้ำมากกว่าลูกฟูก ผิวเริ่มอ่อนตัวเมื่อเปียก",
    elasticityStretch: [1, 2, 4], elasticityResidual: 2, elasticitySummary: "แข็งและโก่ง ก่อนเหลือรอยพับ",
    motion: { loadMs: 240, releaseMs: 320, easing: "cubic-bezier(.25,.7,.25,1)", releaseEffect: "settle" },
  },
  {
    id: "pe_sheet", name: "แผ่นพลาสติก PE", image: "pe_sheet.png", guide: "เป็นแผ่นฟิล์มบาง ผิวเรียบ ลื่น และโค้งงอได้",
    testFrames: testFrames("pe_sheet"), sag: [4, 8, 12], residual: 2,
    releaseSummary: "เด้งกลับมาก · เหลือรอยพับเล็กน้อย",
    waterDrops: [0, 0, 0], waterSummary: "น้ำเกาะบนผิวและไหลออก ไม่ซึมเข้าแผ่น",
    elasticityStretch: [7, 14, 22], elasticityResidual: 3, elasticitySummary: "ยืดได้มากและคืนตัวเร็ว แต่ถ้าดึงแรงจะเหลือรูปยืด",
    motion: { loadMs: 220, releaseMs: 380, easing: "cubic-bezier(.15,.9,.2,1)", releaseEffect: "spring" },
  },
  {
    id: "kraft_paper", name: "กระดาษคราฟต์", image: "kraft_paper_flat.png", guide: "ขยำเพื่อเติมช่องว่าง ลดการขยับของสิ่งของ",
    testFrames: testFrames("kraft_paper"), sag: [6, 12, 18], residual: 14,
    releaseSummary: "คืนเล็กน้อย · รอยยับคงอยู่",
    waterDrops: [3, 7, 12], waterSummary: "เส้นใยกระดาษดูดน้ำเร็วและเสียรูปง่าย",
    elasticityStretch: [2, 5, 8], elasticityResidual: 5, elasticitySummary: "ยืดจากรอยยับได้บ้าง แต่คืนตัวน้อย",
    motion: { loadMs: 160, releaseMs: 240, easing: "cubic-bezier(.3,.6,.4,1)", releaseEffect: "settle" },
  },
  {
    id: "waxed_paper", name: "กระดาษเคลือบไข", image: "waxed_paper_clean.png", guide: "ผิวเคลือบช่วยกันละอองน้ำและความชื้น",
    testFrames: testFrames("waxed_paper"), sag: [5, 10, 16], residual: 11,
    releaseSummary: "คืนเล็กน้อย · รอยพับคมคงอยู่",
    waterDrops: [0, 1, 2], waterSummary: "ไขช่วยชะลอน้ำ แต่รอยพับอาจเป็นทางให้น้ำซึม",
    elasticityStretch: [2, 4, 7], elasticityResidual: 4, elasticitySummary: "ค่อนข้างแข็ง เกิดรอยพับคมและคืนตัวน้อย",
    motion: { loadMs: 200, releaseMs: 280, easing: "cubic-bezier(.3,.65,.35,1)", releaseEffect: "settle" },
  },
] satisfies readonly MaterialDefinition[];

export const DESIGN_QUESTIONS = [
  { id: "pressure", damage: "กล่องยุบจากแรงกด", prompt: "ทีมจะเลือกวัสดุใดทำโครงกล่องให้รับแรงกดดีขึ้น?", choices: ["corrugated_cardboard", "cardboard", "kraft_paper"] },
  { id: "water", damage: "กล่องเปียกน้ำ", prompt: "ทีมจะเลือกวัสดุใดเพิ่มเป็นชั้นช่วยกันเปียก?", choices: ["pe_sheet", "waxed_paper", "cardboard"] },
  { id: "impact", damage: "มุมกล่องบุบจากการกระแทก", prompt: "ทีมจะเลือกวัสดุใดห่อของด้านในเพื่อลดแรงกระแทก?", choices: ["bubble_wrap", "closed_cell_pe_foam", "kraft_paper"] },
  { id: "movement", damage: "ของขยับจนเสียดสี", prompt: "ทีมจะเลือกวัสดุใดเติมช่องว่างไม่ให้ของขยับ?", choices: ["kraft_paper", "closed_cell_pe_foam", "pe_sheet"] },
] as const;

export const RECAP = [
  { question: "ผู้ส่งต้องการอะไรจากกล่องพัสดุ?", choices: ["ปกป้องของระหว่างทาง", "มีสีเข้มที่สุด", "มีขนาดใหญ่ที่สุด"], answer: 0 },
  { question: "เมื่อฝนตก กล่องกระดาษอาจเกิดอะไรขึ้น?", choices: ["เปียกและอ่อนตัว", "แข็งขึ้นทันที", "ลอยขึ้นฟ้า"], answer: 0 },
  { question: "เหตุใดเราจึงทดลองด้วยน้ำหนักเท่ากัน?", choices: ["เพื่อเปรียบเทียบวัสดุอย่างยุติธรรม", "เพื่อให้ขวดสวย", "เพื่อให้เกมเร็วขึ้น"], answer: 0 },
] as const;

export const BOX_PARTS = ["โครงกล่อง", "ชั้นป้องกันน้ำ", "วัสดุเติมช่องว่าง", "วัสดุกันกระแทก"] as const;
