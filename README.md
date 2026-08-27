# เกมภารกิจกล่องแกร่ง — Web Edition

เว็บเกมฉบับสมบูรณ์สำหรับแท็บเล็ตแนวนอน ประกอบด้วยหน้าปก จัดทีม 6–7 คน หนังสือการ์ตูนภาพ ตรวจกล่อง 3 มิติ ห้องทดลองแรงกด 7 วัสดุ คำถามทบทวน การคาดเดาวัสดุ และหน้าสรุป

เล่นออนไลน์: <https://suphatitkku.github.io/education-game-web/>

## เปิดเล่น

ดับเบิลคลิก `START_GAME.cmd` แล้วเว็บจะเปิดที่ `http://localhost:4173`

ข้อมูลทีมและความคืบหน้าจะถูกเก็บใน Supabase และมีสำเนาชั่วคราวในเบราว์เซอร์สำหรับกรณีอินเทอร์เน็ตหลุด

Dashboard สำหรับครูอยู่ที่ `/teacher/` ครูเข้าสู่ระบบด้วยบัญชี Supabase Auth ที่มีข้อมูลในตาราง `teacher_profiles`

## พัฒนาต่อ

```powershell
pnpm install
pnpm dev
```

คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ Project URL และ publishable key ของ Supabase ก่อนทดสอบการบันทึกข้อมูล จากนั้นใช้ migration ใน `supabase/migrations` เพื่อตั้งฐานข้อมูล และเพิ่ม GitHub Actions secrets ชื่อเดียวกันก่อน deploy

สร้างไฟล์เว็บพร้อมใช้งานด้วย `pnpm build` ผลลัพธ์จะอยู่ในโฟลเดอร์ `out`
