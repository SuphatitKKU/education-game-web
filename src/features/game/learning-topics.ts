// The same labels are used in topic selection, individual questions and the labs.
// Keep the historical IDs so saved answers and team history remain readable.
export const STUDY_TOPICS = [
  {
    id: "compression",
    title: "ความต้านทานแรงกดทับ",
    observation: "ดูการยุบหรือบุบเมื่อรับแรงกดเท่ากัน",
    purpose: "เปรียบเทียบว่าวัสดุใดยุบตัวน้อยกว่า",
  },
  {
    id: "elasticity",
    title: "ความสามารถในการลดความเสียหายจากแรงกระแทก",
    observation: "ดูความเสียหายของสิ่งของเมื่อรับแรงกระแทกเท่ากัน",
    purpose: "เปรียบเทียบระดับความเสียหายของสิ่งของ",
  },
  {
    id: "water",
    title: "การดูดซับน้ำของวัสดุ",
    observation: "ดูปริมาณน้ำที่ซึมเข้าเนื้อวัสดุ เมื่อได้รับน้ำเท่ากัน",
    purpose: "เปรียบเทียบว่าวัสดุใดมีน้ำซึมน้อยกว่า",
  },
] as const;

export const LEGACY_ELASTICITY_NOTICE = "กิจกรรมนี้ยังเป็นการดึงและคืนรูป ไม่ใช่การทดสอบแรงกระแทกโดยตรง";

export function studyTopicLabel(id: string) {
  return STUDY_TOPICS.find((topic) => topic.id === id)?.title ?? id;
}
