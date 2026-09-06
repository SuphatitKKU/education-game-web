import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const root = join(import.meta.dirname, "out");
const port = Number(process.env.PORT || 4173);
const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ogg": "audio/ogg", ".glb": "model/gltf-binary",
  ".ttf": "font/ttf", ".woff2": "font/woff2",
};

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
  if (pathname === "/" || pathname === "" || pathname === "/education-game-web") {
    response.writeHead(302, { Location: "/education-game-web/" });
    response.end();
    return;
  }
  const unaliased = pathname.replace(/^\/education-game-web(?:\/|$)/, "/");
  const relative = normalize(unaliased).replace(/^([/\\])+/, "");
  let file = join(root, relative || "index.html");
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file) || !file.startsWith(root)) file = join(root, "404.html");
  response.writeHead(file.endsWith("404.html") ? 404 : 200, {
    "Content-Type": mime[extname(file)] || "application/octet-stream",
    "Cache-Control": file.includes(`${join("", "_next")}`) ? "public, max-age=31536000, immutable" : "no-cache",
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
  createReadStream(file).pipe(response);
}).listen(port, () => console.log(`Parcel Lab is ready at http://localhost:${port}`));
