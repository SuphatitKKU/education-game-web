import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const basePath = isGitHubPages ? "/education-game-web" : "";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  transpilePackages: [
    "@google/model-viewer",
    "lit",
    "lit-html",
    "@lit/reactive-element",
    "@supabase/supabase-js",
    "@supabase/auth-js",
    "@supabase/functions-js",
    "@supabase/postgrest-js",
    "@supabase/realtime-js",
    "@supabase/storage-js",
    "@supabase/phoenix",
    "iceberg-js",
  ],
  allowedDevOrigins: ["127.0.0.1"],
  basePath,
  assetPrefix: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
