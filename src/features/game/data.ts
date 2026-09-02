export type Stage = "menu" | "overview" | "team" | "mission" | "story" | "inspection" | "materials" | "studyFocus" | "exitTicket" | "mission1Complete" | "testHub" | "compression" | "absorption" | "elasticity" | "impact" | "recap" | "prediction" | "summary";

export type DamageCause = "แรงกด" | "แรงกระแทก" | "น้ำ";

export type TeamMember = { name: string; avatar: string; id?: string; position?: number; present?: boolean };

export type CompressionResult = {
  materialId: string;
  measurements: number[];
  // Legacy release fields remain optional so older checkpoints stay readable.
  residual?: number;
  recovered?: number;
  // Optional so checkpoints from the previous bottle activity remain readable.
  observation?: "none" | "slight" | "much";
  modelObservation?: "none" | "slight" | "much";
  deformationMm?: number;
  loadedThicknessMm?: number;
  method?: "equal-load-press-v1" | "fixed-pressure-compression-v2";
  conditions?:
    | { load: "standard"; durationMs: number; specimen: "equal-size" }
    | { forceN: 200; pressureKPa: 20; durationMs: number; specimenWidthCm: 10; specimenLengthCm: 10; initialThicknessMm: 5 };
};

export type WaterAbsorptionResult = {
  materialId: string;
  drops: number[];
  absorbed: number;
  summary: string;
  method?: "one-side-water-contact-v1";
  conditions?: { water: "equal"; contactArea: "equal"; contactTime: "equal"; specimen: "equal-size" };
};

export type ElasticityResult = {
  materialId: string;
  stretch: number[];
  residual: number;
  recovered: number;
  summary: string;
};

export type ImpactDamage = "none" | "slight" | "much";
export type ImpactResult = {
  materialId: string;
  observation: ImpactDamage;
  simulatedDamage: ImpactDamage;
  method: "egg-drop-v1";
  modelVersion: "illustrative-v1";
  conditions: { object: "same-model-egg"; height: "fixed"; specimen: "equal-size" };
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
  checkpointId?: string;
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
  impactIndex: number;
  compressionResults: Record<string, CompressionResult>;
  absorptionResults: Record<string, WaterAbsorptionResult>;
  elasticityResults: Record<string, ElasticityResult>;
  impactResults: Record<string, ImpactResult>;
  recapIndex: number;
  recapAnswers: Record<string, number[]>;
  runId: string;
  studyFocus: Record<string, boolean>;
  bigQuestionProgress: Record<string, string>;
  exitTickets: Record<string, ExitTicket>;
  exitTicketConfirmations: Record<string, ExitTicket>;
  labAnswerDrafts: Record<string, Record<string, string>>;
  mission1Completed: boolean;
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
  impactIndex: 0,
  compressionResults: {},
  absorptionResults: {},
  elasticityResults: {},
  impactResults: {},
  recapIndex: 0,
  recapAnswers: {},
  runId: "",
  studyFocus: {},
  bigQuestionProgress: {},
  exitTickets: {},
  exitTicketConfirmations: {},
  labAnswerDrafts: {},
  mission1Completed: false,
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
  ["shot_01_sender_packs.png", "พี่เมย์ค่อย ๆ ห่อแก้วอย่างเบามือ แล้ววางลงในกล่องให้เรียบร้อย", "จุดเริ่มต้นของความปลอดภัย คือการเลือกกล่องและวัสดุป้องกันที่เหมาะสม", "attentive", "0% 0%"],
  ["shot_02_sender_seals.png", "พี่เมย์ปิดฝากล่องให้แน่น แล้วติดเทปรอบกล่องก่อนส่งให้พี่ต้น", "การปิดผนึกช่วยให้กล่องคงรูป และลดโอกาสที่สิ่งของจะหลุดออกมา", "focused", "50% 0%"],
  ["shot_03_rider_departure.png", "พี่ต้นรับกล่องแล้วออกเดินทาง ถนนขรุขระทำให้กล่องสั่นไปมา", "การสั่นสะเทือนสะสมอาจทำให้สิ่งของภายในเคลื่อนที่หรือชนกับผนังกล่อง", "excited", "100% 0%"],
  ["shot_04_rain_damage.png", "โอ๊ะ! ฝนตกใส่กล่อง น้ำซึมเข้าไปจนกระดาษเปียกและนิ่มลง", "เหตุการณ์นี้เกี่ยวข้องกับสมบัติการดูดซึมน้ำของวัสดุ", "worried", "0% 50%"],
  ["shot_05_stack_pressure.png", "กล่องหลายใบวางซ้อนกัน กล่องของเราจึงถูกน้ำหนักด้านบนกดจนยุบ", "เหตุการณ์นี้เกี่ยวข้องกับความสามารถในการรับแรงกดของวัสดุ", "strained", "50% 50%"],
  ["shot_06_corner_impact.png", "ระหว่างขนย้าย กล่องเผลอตกลงพื้น ตุ้บ! มุมกล่องจึงบุบลง", "เหตุการณ์นี้เกี่ยวข้องกับความสามารถในการดูดซับแรงกระแทก", "shocked", "100% 50%"],
  ["shot_07_friction_tear.png", "กล่องเสียดสีกับพื้นผิวระหว่างการขนย้าย จนผิวกระดาษเริ่มฉีกขาด", "การเสียดสีซ้ำ ๆ อาจทำให้วัสดุสูญเสียความแข็งแรง", "shocked", "100% 50%"],
  ["shot_08_receiver_gets_box.png", "พี่ฟ้าได้รับกล่องแล้ว ลองช่วยกันดูสิว่ากล่องเสียหายตรงไหนบ้าง", "ถึงภายนอกดูเสียหายไม่มาก เราต้องตรวจหลักฐานทุกจุด", "relieved", "0% 100%"],
  ["shot_09_cracked_cup.png", "พี่ฟ้าเปิดกล่องแล้วพบว่าแก้วแตกร้าว น่าเสียดายจัง กล่องอาจกันแรงกระแทกได้ไม่พอ", "นี่คือผลลัพธ์จากเหตุการณ์หลายอย่างรวมกันตลอดเส้นทาง", "sad", "50% 100%"],
  ["shot_10_team_mission.png", "ถึงตาของพวกเราแล้ว! มาช่วยกันสืบร่องรอยและหาวัสดุที่ปกป้องแก้วได้ดีกว่าเดิมกันเถอะ", "ต่อไปเราจะสำรวจความเสียหาย สำรวจวัสดุ และค้นหาว่าควรศึกษาสมบัติใดบ้าง", "encouraging", "100% 100%"],
] as const;
export const STORY = ALL_STORY_SCENES.filter(([image]) => TORN_DAMAGE_STORY_ENABLED || image !== "shot_07_friction_tear.png");

export const DAMAGE_CAUSES: readonly DamageCause[] = ["แรงกด", "แรงกระแทก", "น้ำ"];

// Keep the tear hotspot data ready for later, but exclude it from the research flow for now.
const TORN_DAMAGE_INSPECTION_ENABLED = false;
const ALL_DAMAGES = [
  { id: "dent", label: "รอยยุบ", title: "รอยยุบอยู่จุดไหน?", hint: "ลองดูแอ่งยุบลึกบนฝากล่องด้านหน้า", evidence: "รอยยุบด้านบน", position: "0.28m -0.10m 1.91m", normal: "0 0.96 0.28" },
  { id: "wet", label: "รอยเปียก", title: "รอยเปียกอยู่จุดไหน?", hint: "มองหาคราบสีน้ำตาลเข้มเป็นด่างบนผิวกล่อง", evidence: "คราบเปียกน้ำ", position: "-1.05m -0.18m 1.35m", normal: "0 0 1" },
  { id: "torn", label: "รอยฉีกขาด", title: "รอยฉีกขาดอยู่จุดไหน?", hint: "ลองหมุนดูรูโหว่ขอบรุ่ยที่ด้านข้าง", evidence: "รอยฉีกขาดเป็นรูโหว่", position: "-1.84m -0.32m -0.02m", normal: "-1 0 0" },
  { id: "corner", label: "รอยบุบ", title: "รอยบุบอยู่มุมไหน?", hint: "มองหามุมที่ย่นและเสียรูป", evidence: "มุมกล่องบุบ", position: "1.43m -0.82m 1.05m", normal: "0.22 -0.64 0.74" },
  { id: "cup", label: "สิ่งของเสียหาย", title: "สิ่งของด้านในเสียหายตรงไหน?", hint: "มองหาแก้วที่มีรอยร้าวและขอบบิ่นอยู่กลางกล่อง", evidence: "แก้วด้านในแตกร้าวและขอบบิ่น", position: "0.10m 0.16m 0.52m", normal: "0 0 1" },
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
    waterDrops: [1, 2, 4], waterSummary: "ในแบบจำลอง น้ำซึมเข้าเนื้อกระดาษและเห็นรอยเปียก",
    elasticityStretch: [1, 2, 3], elasticityResidual: 1, elasticitySummary: "งอได้บ้าง แต่คืนตัวไม่เหมือนยาง",
    motion: { loadMs: 220, releaseMs: 320, easing: "cubic-bezier(.2,.8,.2,1)", releaseEffect: "settle" },
  },
  {
    id: "closed_cell_pe_foam", name: "แผ่นโฟม EPE", image: "closed_cell_pe_foam.png", guide: "แผ่นสีขาว เนื้อนุ่ม มีผิวเซลล์ละเอียด",
    testFrames: testFrames("closed_cell_pe_foam"), sag: [2, 4, 7], residual: 0,
    releaseSummary: "เด้งกลับเต็มที่",
    waterDrops: [0, 0, 1], waterSummary: "ในแบบจำลอง วัสดุดูดซับน้ำเล็กน้อย น้ำส่วนใหญ่อยู่บนผิว",
    elasticityStretch: [4, 8, 12], elasticityResidual: 1, elasticitySummary: "ยืดและคืนตัวนุ่ม เหลือรอยน้อยมาก",
    motion: { loadMs: 300, releaseMs: 650, easing: "cubic-bezier(.22,.8,.3,1)", releaseEffect: "soft" },
  },
  {
    id: "bubble_wrap", name: "แผ่นพลาสติกกันกระแทกชนิดฟองอากาศ", image: "bubble_wrap.png", guide: "แผ่นพลาสติกใส มีฟองอากาศเรียงต่อกัน",
    testFrames: testFrames("bubble_wrap"), sag: [3, 6, 10], residual: 1,
    releaseSummary: "ฟองอากาศเด้งกลับเกือบหมด",
    waterDrops: [0, 0, 0], waterSummary: "ในแบบจำลอง น้ำอยู่บนผิว ไม่แสดงการดูดซับเข้าเนื้อวัสดุ",
    elasticityStretch: [5, 10, 16], elasticityResidual: 2, elasticitySummary: "ฟิล์มยืดได้และเด้งกลับเร็ว",
    motion: { loadMs: 180, releaseMs: 420, easing: "cubic-bezier(.2,.9,.25,1)", releaseEffect: "spring" },
  },
  {
    id: "cardboard", name: "กระดาษหน้าขาวหลังเทา 400 แกรม", image: "cardboard.png", guide: "แผ่นกระดาษเนื้อแน่น ด้านหน้าสีขาวและด้านหลังสีเทา",
    testFrames: testFrames("cardboard"), sag: [3, 6, 9], residual: 3,
    releaseSummary: "คืนบางส่วน · มีรอยพับ",
    waterDrops: [2, 5, 8], waterSummary: "ในแบบจำลอง น้ำซึมเข้าเนื้อกระดาษและรอยเปียกขยายขึ้น",
    elasticityStretch: [1, 2, 4], elasticityResidual: 2, elasticitySummary: "แข็งและโก่ง ก่อนเหลือรอยพับ",
    motion: { loadMs: 240, releaseMs: 320, easing: "cubic-bezier(.25,.7,.25,1)", releaseEffect: "settle" },
  },
  {
    id: "pe_sheet", name: "แผ่นพลาสติก PE", image: "pe_sheet.png", guide: "เป็นแผ่นฟิล์มบาง ผิวเรียบ ลื่น และโค้งงอได้",
    testFrames: testFrames("pe_sheet"), sag: [4, 8, 12], residual: 2,
    releaseSummary: "เด้งกลับมาก · เหลือรอยพับเล็กน้อย",
    waterDrops: [0, 0, 0], waterSummary: "ในแบบจำลอง น้ำเกาะบนผิว ไม่แสดงการดูดซับเข้าเนื้อวัสดุ",
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
  { question: "เมื่อรับแรงกดเท่ากัน เราควรเปรียบเทียบอะไร?", choices: ["การยุบหรือบุบของวัสดุ", "สีของขวดน้ำ", "ชื่อของทีม"], answer: 0 },
  { question: "ถ้าจะทดสอบการลดความเสียหายจากแรงกระแทก ควรดูอะไร?", choices: ["ดูว่าวัสดุยืดได้ยาวที่สุดหรือไม่", "ดูความเสียหายของสิ่งของเมื่อรับแรงกระแทกเท่ากัน", "ดูว่าวัสดุสีสวยหรือไม่"], answer: 1 },
  { question: "เมื่อได้รับน้ำเท่ากัน เราศึกษาการดูดซับน้ำจากอะไร?", choices: ["ความยาวของวัสดุ", "สีของโต๊ะ", "ปริมาณน้ำที่ซึมเข้าเนื้อวัสดุ"], answer: 2 },
] as const;

export const BOX_PARTS = ["โครงกล่อง", "ชั้นป้องกันน้ำ", "วัสดุเติมช่องว่าง", "วัสดุกันกระแทก"] as const;
