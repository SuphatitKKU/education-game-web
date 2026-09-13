import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { PwaRegister } from "./pwa-register";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "ภารกิจกล่องแกร่ง",
  description: "เกมเรียนรู้การออกแบบกล่องพัสดุสำหรับเด็ก",
  manifest: `${BASE_PATH}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${BASE_PATH}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { url: `${BASE_PATH}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
    apple: { url: `${BASE_PATH}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
  },
  appleWebApp: {
    capable: true,
    title: "กล่องแกร่ง",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1769ff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <head>
        {/*
          Next's client runtime uses globalThis. Safari 12 (including the last
          iPad mini 2/3 updates) can run the game but does not define it yet.
          Keep this tiny ES5 guard before any async Next chunks are evaluated.
        */}
        <Script id="legacy-browser-globals" strategy="beforeInteractive">
          {( `(function(root){if(typeof root.globalThis === "undefined"){root.globalThis=root;}})(typeof self !== "undefined" ? self : window);` )}
        </Script>
      </head>
      <body>
        {children}
        <PwaRegister />
        <script dangerouslySetInnerHTML={{ __html: `(function(){window.setTimeout(function(){var loading=document.querySelector(".loading-screen");if(!loading){return;}loading.setAttribute("role","alert");loading.innerHTML="<div class='legacy-boot-error'><b>เปิดห้องทดลองไม่สำเร็จ</b><span>กรุณาอัปเดตเป็น iOS 12.5.7 แล้วแตะปุ่มด้านล่างเพื่อล้างไฟล์เว็บเก่าและลองใหม่</span><button type='button' onclick='window.parcelLabClearCacheAndReload()'>ล้างแคชแล้วลองใหม่</button></div>";},15000);window.parcelLabClearCacheAndReload=function(){var done=function(){var url=new URL(window.location.href);url.searchParams.set("refresh",Date.now().toString());window.location.replace(url.toString());};var jobs=[];if(window.caches&&window.caches.keys){jobs.push(window.caches.keys().then(function(keys){return Promise.all(keys.map(function(key){return window.caches.delete(key);}));}));}if(window.navigator.serviceWorker&&window.navigator.serviceWorker.getRegistrations){jobs.push(window.navigator.serviceWorker.getRegistrations().then(function(registrations){return Promise.all(registrations.map(function(registration){return registration.unregister();}));}));}if(jobs.length){Promise.all(jobs).then(done,done);}else{done();}};}());` }} />
      </body>
    </html>
  );
}
