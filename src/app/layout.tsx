import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ภารกิจกล่องแกร่ง",
  description: "เกมเรียนรู้การออกแบบกล่องพัสดุสำหรับเด็ก",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: `(function(){window.setTimeout(function(){var loading=document.querySelector("main.loading-screen");if(!loading){return;}loading.setAttribute("role","alert");loading.innerHTML="<div class='legacy-boot-error'><b>เปิดห้องทดลองไม่สำเร็จ</b><span>Safari รุ่นนี้เก่าเกินไป กรุณาอัปเดต iPad เป็น iOS 12.5 ขึ้นไป หรือเปิดด้วยอุปกรณ์ที่ใหม่กว่า</span></div>";},12000);}());` }} />
      </body>
    </html>
  );
}
