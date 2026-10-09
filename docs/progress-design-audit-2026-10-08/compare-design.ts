import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const { chromium } = await import(process.argv[2] ?? "playwright");
const folder = new URL("./evidence/", import.meta.url);
const targets = JSON.parse(readFileSync(new URL("./capture-targets.json", import.meta.url), "utf8")).targets;
const frames = JSON.parse(readFileSync(new URL("../../frontend/docs/design/progress/frames.json", import.meta.url), "utf8")).frames.map((frame) => ({ ...frame, file: targets.find((target) => target.id === frame.id).render }));
const captures = JSON.parse(readFileSync(new URL("design-captures.json", folder), "utf8")).captures;
if (!process.argv[3] || !process.argv[4]) throw new Error("Pass the transient Pen MCP screenshot folder and a temporary review output folder. No mockup export is written into the repository.");
if (!isAbsolute(process.argv[3]) || !isAbsolute(process.argv[4])) throw new Error("Both temporary folders must use absolute paths.");
const repository = fileURLToPath(new URL("../../", import.meta.url));
const reviewPath = resolve(process.argv[4]);
const relativeOutput = relative(repository, reviewPath);
if (!relativeOutput.startsWith("..") && !isAbsolute(relativeOutput)) throw new Error("Combined source comparisons must remain outside the repository.");
const inspection = JSON.parse(readFileSync(new URL("pen-inspection.json", folder), "utf8"));
if (inspection.frames.length !== 55 || inspection.frames.some((frame) => !frame.unchangedSincePreviousInspection)) throw new Error("Re-read the live Pen layers and resolve changes before using earlier temporary source captures.");
const sourceFolder = pathToFileURL(`${resolve(process.argv[3])}/`);
const reviewFolder = pathToFileURL(`${reviewPath}/`);
const output = new URL("comparisons/", reviewFolder);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const pages: string[] = [];
for (const frame of frames.filter((frame) => frame.file !== "overview-map.png")) {
  const rendered = captures.filter((capture) => capture.penFrame === frame.id || capture.reference === frame.file);
  if (!rendered.length) throw new Error(`No rendered state for ${frame.file}`);
  const scaled = frame.width <= 390 ? frame.width : 720;
  const name = frame.file.replace(".png", "");
  const html = `<!doctype html><meta charset="utf-8"><title>${escape(frame.name)}</title>
    <style>*{box-sizing:border-box}body{margin:0;background:#e6e6e6;font:14px system-ui}header{padding:12px}main{display:grid;grid-template-columns:${scaled}px ${scaled}px;gap:16px;padding:8px}img{display:block;width:100%;height:auto}h2{font-size:14px;margin:0;padding:8px;background:white}section{align-self:start}article{margin-bottom:16px}p{padding:8px;background:white;margin:0}</style>
    <header>${escape(frame.name)} · pen.dev / rendered. Source density 1×; CSS viewport is recorded in design-captures.json.</header>
    <main><section><h2>pen.dev · ${frame.id}</h2><img src="${new URL(frame.file, sourceFolder).href}"></section><section><h2>Реализация</h2>
    ${rendered.map((capture) => `<article><img src="${new URL(`final/${capture.file}`, folder).href}"><p>${escape(capture.state)}</p></article>`).join("")}</section></main>`;
  const location = new URL(`comparison-${name}.html`, reviewFolder);
  writeFileSync(location, html);
  await page.setViewportSize({ width: scaled * 2 + 40, height: 1000 });
  await page.goto(location.href);
  await page.locator("img").evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
  await page.screenshot({ path: new URL(frame.file, output).pathname, fullPage: true });
  pages.push(`<li><a href="comparison-${name}.html">${escape(frame.name)} (${rendered.length} состояний)</a></li>`);
}
writeFileSync(new URL("visual-review.html", reviewFolder), `<!doctype html><meta charset="utf-8"><title>Приёмка макетов</title><h1>Актуальный pen.dev → реальный рендер</h1><p>Каждая пара открывается рядом. Таблицы состояний сопоставляются с отдельными состояниями работающего интерфейса, а не с отдельным продуктовым маршрутом таблицы.</p><ul>${pages.join("")}</ul>`);
await browser.close();
console.log(`Compared ${pages.length} source frames with ${captures.length} renders`);
