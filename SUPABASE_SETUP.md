# ตั้งค่า Supabase สำหรับเกมกล่องแกร่ง

## 1. เชื่อม Development project

เชื่อม Supabase plugin/MCP กับ project สำหรับพัฒนาโดยจำกัดขอบเขตไว้ที่ `project_ref` ของ project นี้ จากนั้นใช้ migration ใน `supabase/migrations` กับ project ดังกล่าว

Migration จะสร้างตาราง, indexes, RLS, RPC และเปิด Realtime ให้ `game_runs` กับ `learning_events` โดยอัตโนมัติ

## 2. สร้างบัญชีครู

สร้างผู้ใช้แบบ Email/Password ใน Supabase Auth ก่อน ปิดการสมัครสมาชิกสาธารณะใน Auth Providers แล้วเพิ่มสิทธิ์ Dashboard ด้วย SQLนี้ โดยเปลี่ยนอีเมลให้ตรงกับบัญชีครู

```sql
insert into public.teacher_profiles (user_id, display_name)
select id, 'ครูประจำชั้น'
from auth.users
where email = 'teacher@example.com'
on conflict (user_id) do update
set display_name = excluded.display_name;
```

หน้า `/teacher/` ไม่มีปุ่มสมัครสมาชิก ผู้ใช้ Auth ที่ไม่อยู่ใน `teacher_profiles` จะเข้าดู Dashboard ไม่ได้

## 3. ตั้งค่าตัวแปรของเว็บ

คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ Project URL และ publishable key เท่านั้น ห้ามนำ secret key หรือ service-role keyมาใส่ในตัวแปร `NEXT_PUBLIC_*`

สำหรับ GitHub Pages ให้เพิ่ม Actions secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## 4. ตรวจสอบก่อนใช้งานจริง

1. ใช้บัญชีครูเข้าสู่ `/teacher/`
2. สร้างทีมทดสอบด้วยชื่อเล่น 6 คน
3. เริ่มภารกิจ เปลี่ยนขั้น แล้ว refresh หน้าเพื่อยืนยันว่า Resume ได้
4. เปิด Dashboard และยืนยันว่าทีม ความก้าวหน้า timeline และคำตอบปรากฏ
5. รัน Security/Performance Advisors หลังลง migration

ข้อมูลทีมและประวัติถูกตั้งใจให้เปิดอ่านจากหน้าเกมโดยไม่ใช้ PIN ตามข้อกำหนด จึงต้องใช้ชื่อเล่นเท่านั้น
