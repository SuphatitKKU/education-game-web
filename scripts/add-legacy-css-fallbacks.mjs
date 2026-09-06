import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CSS_OUTPUT = join(process.cwd(), "out", "_next", "static", "chunks");

function legacyContainerWidth(value) {
  return value.replace(/(-?(?:\d+\.?\d*|\.\d+))cqw\b/g, (_, raw) => {
    const amount = Number(raw);
    const viewportHeightAmount = Number((amount * 16 / 9).toFixed(6));
    return amount < 0
      ? `max(${amount}vw,${viewportHeightAmount}vh)`
      : `min(${amount}vw,${viewportHeightAmount}vh)`;
  });
}

function addFallback(css, unit, convert) {
  const declaration = new RegExp(`([-\\w]+):([^;{}]*${unit}[^;{}]*)(?=[;}])`, "g");
  return css.replace(declaration, (original, property, value) => {
    return `${property}:${convert(value)};${original}`;
  });
}

async function cssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.isFile() && entry.name.endsWith(".css") ? [path] : [];
  }));
  return nested.flat();
}

const files = await cssFiles(CSS_OUTPUT);
let fallbackCount = 0;
for (const file of files) {
  const original = await readFile(file, "utf8");
  let compatible = addFallback(original, "cqw", legacyContainerWidth);
  compatible = addFallback(compatible, "dvh", (value) => value.replace(/dvh\b/g, "vh"));
  if (compatible !== original) {
    fallbackCount += 1;
    await writeFile(file, compatible);
  }
}

console.log(`Added Safari 12 CSS fallbacks to ${fallbackCount} generated stylesheet(s).`);
