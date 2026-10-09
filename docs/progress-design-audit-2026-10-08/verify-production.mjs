// Read-only production verification. Never print auth Location, cookies or credentials.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const revision = process.argv[2];
assert(/^[a-f0-9]{40}$/u.test(revision ?? ""), "Pass the exact published Git revision");
const root = fileURLToPath(new URL("../../", import.meta.url));
const origin = "https://app.getplanner.workers.dev";
const checks = [];
const request = (path, options = {}) =>
  fetch(origin + path, { redirect: "manual", signal: AbortSignal.timeout(20000), ...options });
const health = await request("/health");
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: "ok", revision });
checks.push({
  id: "S01",
  status: "passed",
  description: "Health confirms the exact pushed release revision",
});
const html = await readFile(resolve(root, "frontend/dist/index.html"), "utf8");
const pages = [
  "/",
  "/login",
  "/plans/2026-10",
  "/plans/2026-10/progress",
  "/plans/2026-10/reminders",
  "/plans/2026-10/reminders?tab=reports",
  "/plans/2026-09/progress?period=month",
];
for (const path of pages) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  assert.equal(await response.text(), html, `SPA differs: ${path}`);
}
checks.push({
  id: "S02",
  status: "passed",
  pages,
  description: "Seven public SPA paths match the checked production build byte for byte",
});
const assets = await readdir(resolve(root, "frontend/dist/assets"));
const assetProof = [];
for (const file of assets) {
  const response = await request(`/assets/${file}`);
  assert.equal(response.status, 200, file);
  const actual = Buffer.from(await response.arrayBuffer());
  const expected = await readFile(resolve(root, "frontend/dist/assets", file));
  const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha(actual), sha(expected), file);
  assetProof.push({ file, bytes: actual.length, sha256: sha(actual) });
}
checks.push({
  id: "S03",
  status: "passed",
  assetCount: assets.length,
  description: "All emitted JavaScript, CSS and fonts match the checked build SHA-256",
});
const schemaResponse = await request("/openapi.json");
assert.equal(schemaResponse.status, 200);
const schema = await schemaResponse.json();
for (const [path, method] of [
  ["/api/progress", "get"],
  ["/api/progress/settings", "get"],
  ["/api/progress/settings", "put"],
  ["/api/progress/goals/{goalId}", "get"],
  ["/api/reminders/progress-reports", "get"],
  ["/api/reminders/progress-reports", "put"],
  ["/api/reminders/progress-reports/preview", "post"],
])
  assert(
    schema.paths[path]?.[method]?.security?.length,
    `Missing authenticated contract ${method} ${path}`,
  );
checks.push({
  id: "S04",
  status: "passed",
  description: "All seven progress/report operations remain authenticated in the published OpenAPI",
});
for (const [path, method] of [
  ["/api/auth/me", "GET"],
  ["/api/progress?period=week&anchor=2026-10-09", "GET"],
  ["/api/progress/settings", "GET"],
  ["/api/progress/settings", "PUT"],
  ["/api/progress/goals/00000000-0000-4000-8000-000000000000?period=week&anchor=2026-10-09", "GET"],
  ["/api/reminders/progress-reports?month=2026-10", "GET"],
  ["/api/reminders/progress-reports", "PUT"],
  ["/api/reminders/progress-reports/preview", "POST"],
]) {
  const response = await request(path, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json" },
    ...(method === "GET" ? {} : { body: "{}" }),
  });
  assert.equal(response.status, 401, path);
  assert.match(response.headers.get("content-type"), /application\/problem\+json/u);
  assert.equal((await response.json()).status, 401, path);
}
checks.push({
  id: "S05",
  status: "passed",
  description:
    "Account and every progress/report operation reject anonymous access with Problem Details",
});
const foreign = await request("/api/progress/settings", {
  method: "PUT",
  headers: { Origin: "https://untrusted.invalid", "Content-Type": "application/json" },
  body: JSON.stringify({ startsOn: null }),
});
assert.equal(foreign.status, 403);
checks.push({
  id: "S06",
  status: "passed",
  description: "Untrusted Origin is rejected before settings mutation",
});
const webhook = await request("/telegram/webhook", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(webhook.status, 401);
checks.push({
  id: "S07",
  status: "passed",
  description: "Webhook still requires the existing secret header",
});
const { chromium } = await import(process.argv[3] ?? "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const destination = "/plans/2026-09/progress?period=month&anchor=2026-09-21";
  await page.goto(origin + destination, { waitUntil: "networkidle" });
  const url = new URL(page.url());
  assert.equal(url.pathname, "/login");
  assert.equal(url.searchParams.get("returnTo"), destination);
  const login = page.locator('a[href*="/api/auth/telegram/start"]');
  const start = new URL(await login.getAttribute("href"), origin);
  assert.equal(start.searchParams.get("returnTo"), destination);
  await page.setViewportSize({ width: 320, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, []);
  checks.push({
    id: "S08",
    status: "passed",
    description:
      "Real published SPA preserves the protected month/period through the login destination; cold browser has no page errors or 320px overflow",
  });
} finally {
  await browser.close();
}
const result = {
  revision,
  origin,
  checkedAt: new Date().toISOString(),
  method:
    "Read-only public production HTTPS and clean Chromium. Authenticated browser, real Telegram and the installed ChatGPT plugin are recorded separately.",
  checks,
  assets: assetProof,
};
await writeFile(
  new URL("evidence/production-http.json", import.meta.url),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(
  JSON.stringify({ revision, status: "passed", checks: checks.length, assetCount: assets.length }),
);
