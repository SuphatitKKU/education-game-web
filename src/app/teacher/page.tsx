import type { Metadata } from "next";
import { TeacherDashboard } from "@/features/teacher/TeacherDashboard";
import "./teacher.css";

export const metadata: Metadata = {
  title: "Dashboard ครู | ภารกิจกล่องแกร่ง",
  description: "ติดตามความก้าวหน้า กิจกรรม และคำตอบของนักเรียน",
};

export default function TeacherPage() {
  return <TeacherDashboard />;
}
