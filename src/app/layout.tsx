import type { Metadata, Viewport } from "next";
import { Itim, Kodchasan } from "next/font/google";
import "./globals.css";

const itim = Itim({
  weight: "400",
  subsets: ["thai", "latin"],
  variable: "--font-itim",
  display: "swap",
  fallback: ["Tahoma", "Arial", "sans-serif"],
});

const kodchasan = Kodchasan({
  weight: "600",
  subsets: ["thai", "latin"],
  variable: "--font-kodchasan",
  display: "swap",
  fallback: ["Tahoma", "Arial", "sans-serif"],
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
      <body className={`${itim.variable} ${kodchasan.variable}`}>{children}</body>
    </html>
  );
}
