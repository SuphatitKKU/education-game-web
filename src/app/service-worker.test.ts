import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("service worker asset fallback", () => {
  const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");

  it("keeps the HTML shell fallback exclusive to navigation requests", () => {
    expect(source).toContain('const isNavigation = request.mode === "navigate"');
    expect(source).toContain('isNavigation\n      ? fetchAndCache().catch(() => caches.match(request).then((cached) => cached || caches.match("./")))');
  });

  it("never returns the HTML shell for JavaScript and Next.js assets", () => {
    expect(source).toContain('const isAppAsset = request.destination === "script"');
    expect(source).toContain('cached || Response.error()');
    expect(source).not.toContain('isAppAsset\n        ? fetchAndCache().catch(() => caches.match(request).then((cached) => cached || caches.match("./")))');
  });
});
