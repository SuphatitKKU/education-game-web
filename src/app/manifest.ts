import type { MetadataRoute } from "next";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ภารกิจกล่องแกร่ง",
    short_name: "กล่องแกร่ง",
    description: "เกมเรียนรู้การออกแบบกล่องพัสดุสำหรับเด็ก",
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    orientation: "any",
    background_color: "#d9f1ff",
    theme_color: "#1769ff",
    categories: ["education", "games"],
    icons: [
      { src: `${BASE_PATH}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${BASE_PATH}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
      { src: `${BASE_PATH}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
