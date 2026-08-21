import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const prompt = localFont({
  src: [
    { path: "../../public/assets/fonts/Prompt-SemiBold.ttf", weight: "600" },
    { path: "../../public/assets/fonts/Prompt-Bold.ttf", weight: "700" },
  ],
  display: "swap",
  fallback: ["sans-serif"],
});

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
      <body className={prompt.className}>{children}</body>
    </html>
  );
}
