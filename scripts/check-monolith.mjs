import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// Exercise Wrangler's real asset routing, not just Hono's in-process router.
const root = fileURLToPath(new URL("../", import.meta.url));
const backend = join(root, "backend");
const require = createRequire(join(backend, "package.json"));
const wrangler = join(dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js");
const config = JSON.parse(await readFile(join(backend, "wrangler.jsonc"), "utf8"));
assert.deepEqual(config.assets, config.env.production.assets);
assert.equal(config.services, undefined);
assert.equal(config.env.production.services, undefined);
assert.deepEqual(config.triggers.crons, ["* * * * *"]);
assert.deepEqual(config.env.production.triggers, config.triggers);
assert.equal(config.env.production.observability.logs.invocation_logs, false);

const socket = createServer();
socket.listen(0, "127.0.0.1");
await once(socket, "listening");
const port = socket.address().port;
await new Promise((resolve, reject) =>
  socket.close((error) => (error ? reject(error) : resolve())),
);
const origin = `http://localhost:${port}`;
const state = await mkdtemp(join(tmpdir(), "planner-smoke-"));
const worker = spawn(
  process.execPath,
  [
    wrangler,
    "dev",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--inspector-port",
    "0",
    "--persist-to",
    state,
    "--var",
    "AUTH_MODE:disabled",
    "--var",
    "TELEGRAM_BOT_MODE:disabled",
    "--var",
    `APP_ORIGIN:${origin}`,
    "--var",
    `AUTH_SUCCESS_REDIRECT_URL:${origin}/`,
  ],
  {
    cwd: backend,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
  },
);
const closed = once(worker, "exit");
let spawnError;
worker.on("error", (error) => {
  spawnError = error;
});

async function request(path, init) {
  return fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(5000) });
}

try {
  const deadline = Date.now() + 60000;
  while (true) {
    if (spawnError) throw spawnError;
    assert.equal(worker.exitCode, null, "Local Worker exited before readiness");
    const response = await request("/health").catch(() => null);
    if (response) {
      assert.equal(response.status, 200, "Local health endpoint must be healthy");
      assert.equal((await response.json()).revision, "local");
      break;
    }
    assert.ok(Date.now() < deadline, "Local Worker did not become ready within 60 seconds");
    await delay(250);
  }

  const navigation = { headers: { "Sec-Fetch-Mode": "navigate", Accept: "text/html" } };
  const index = await readFile(join(root, "frontend/dist/index.html"), "utf8");
  for (const path of ["/", "/plans/2026-09", "/plans/2026-09/reminders", "/login", "/apiary"]) {
    const response = await request(path, navigation);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("Content-Type"), /text\/html/);
    assert.equal(await response.text(), index, path);
  }

  const asset = /src="([^"]+\.js)"/.exec(index)?.[1];
  assert.ok(asset, "Built SPA must reference a JavaScript bundle");
  const javascript = await request(asset);
  assert.equal(javascript.status, 200);
  assert.match(javascript.headers.get("Content-Type"), /javascript/);

  const schema = await request("/openapi.json", navigation);
  assert.equal(schema.status, 200);
  assert.ok((await schema.json()).paths["/api/auth/me"]);
  const health = await request("/health", navigation);
  assert.deepEqual(await health.json(), { status: "ok", revision: "local" });

  for (const path of [
    "/api",
    "/api/missing",
    "/api/auth/me",
    "/health/missing",
    "/telegram/missing",
  ]) {
    const response = await request(path, navigation);
    assert.equal(response.status, 404, path);
    assert.match(response.headers.get("Content-Type"), /application\/problem\+json/);
    assert.equal((await response.json()).code, "NOT_FOUND", path);
  }
  const webhook = await request("/telegram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"update_id":1}',
  });
  assert.equal(webhook.status, 404);
  assert.match(webhook.headers.get("Content-Type"), /application\/problem\+json/);
  console.log(
    "Monolith smoke passed: SPA, static assets, API, OpenAPI, health and webhook routing",
  );
} finally {
  if (worker.pid && worker.exitCode === null) {
    process.kill(-worker.pid, "SIGTERM");
    const stopped = await Promise.race([closed.then(() => true), delay(5000).then(() => false)]);
    if (!stopped) {
      process.kill(-worker.pid, "SIGKILL");
      await closed;
    }
  }
  await rm(state, { recursive: true, force: true });
}
