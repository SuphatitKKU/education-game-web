import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CSS_OUTPUT = join(process.cwd(), "out", "_next", "static", "chunks");
const HTML_OUTPUT = join(process.cwd(), "out");
const LEGACY_CANVAS_ASPECT = 4 / 3;
const LEGACY_GLOBALS_BOOTSTRAP = `<script id="legacy-browser-globals-bootstrap">(function(root){if(typeof root.globalThis === "undefined"){root.globalThis=root;}})(typeof self !== "undefined" ? self : window);</script>`;
const LEGACY_SERVICE_WORKER_BOOTSTRAP = `<script id="legacy-service-worker-bootstrap">(function(root){if(!root.navigator||!root.navigator.serviceWorker){return;}var path=root.location.pathname;var base=path.indexOf("/education-game-web")===0?"/education-game-web":"";root.navigator.serviceWorker.register(base+"/sw.js",{scope:base+"/"}).then(function(registration){return registration.update();}).catch(function(){});})(typeof self !== "undefined" ? self : window);</script>`;

function legacyContainerWidth(value) {
  return value.replace(/(-?(?:\d+\.?\d*|\.\d+))cqw\b/g, (_, raw) => {
    const amount = Number(raw);
    const viewportHeightAmount = Number((amount * LEGACY_CANVAS_ASPECT).toFixed(6));
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

function expandInset(value) {
  const parts = value.trim().split(/\s+/);
  if (parts.length < 1 || parts.length > 4 || parts.some((part) => part.includes("("))) return null;
  const [top, right = top, bottom = top, left = right] = parts.length === 3
    ? [parts[0], parts[1], parts[2], parts[1]]
    : parts;
  return `top:${top};right:${right};bottom:${bottom};left:${left}`;
}

function addSafari12PropertyFallbacks(css) {
  let compatible = css.replace(/(^|[;{])inset:([^;{}]+)(?=[;}])/g, (original, boundary, value) => {
    const expanded = expandInset(value);
    return expanded ? `${boundary}${expanded};inset:${value}` : original;
  });
  compatible = compatible.replace(/(^|[;{])overflow:clip(?=[;}])/g, "$1overflow:hidden;overflow:clip");
  compatible = compatible.replace(/(^|[;{])backdrop-filter:([^;{}]+)(?=[;}])/g, "$1-webkit-backdrop-filter:$2;backdrop-filter:$2");
  return compatible;
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
  compatible = addSafari12PropertyFallbacks(compatible);
  if (compatible !== original) {
    fallbackCount += 1;
    await writeFile(file, compatible);
  }
}

console.log(`Added Safari 12 CSS fallbacks to ${fallbackCount} generated stylesheet(s).`);

// Turbopack wraps every client chunk in `globalThis.TURBOPACK`. Safari 12 can
// execute the rest of the bundle but does not expose globalThis, so install
// this ES5 guard synchronously before Next's async scripts are evaluated.
const htmlEntries = await readdir(HTML_OUTPUT, { withFileTypes: true });
let htmlBootstrapCount = 0;
for (const entry of htmlEntries) {
  if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
  const file = join(HTML_OUTPUT, entry.name);
  const original = await readFile(file, "utf8");
  if (original.includes("legacy-browser-globals-bootstrap")) continue;
  const compatible = original.replace("<head>", `<head>${LEGACY_GLOBALS_BOOTSTRAP}${LEGACY_SERVICE_WORKER_BOOTSTRAP}`);
  if (compatible !== original) {
    htmlBootstrapCount += 1;
    await writeFile(file, compatible);
  }
}

console.log(`Added Safari globalThis bootstrap to ${htmlBootstrapCount} generated HTML file(s).`);
