import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { complete, logicalTime, migrate, observe, scenarios, seed, verify } from "./fixture.mjs";

const backend = fileURLToPath(new URL("../../", import.meta.url));
const root = resolve(backend, "..");
const require = createRequire(join(backend, "package.json"));
const dependencies = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare, convertV4MiniflareOptions } = dependencies("miniflare");
const { build } = dependencies("esbuild");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const rounds = Number(option("rounds", "3"));
const goals = Number(option("goals", "24"));
const selected = option("scenarios", scenarios.join(",")).split(",");
const modes = option("modes", "cron,do-staged,do-direct").split(",");
assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 20);
assert.ok(Number.isInteger(goals) && goals >= 4 && goals <= 100);
assert.ok(selected.length && selected.every((scenario) => scenarios.includes(scenario)));
assert.ok(modes.length && modes.every((mode) => ["cron", "do-staged", "do-direct"].includes(mode)));
assert.ok(
  args.every(
    (arg, index) =>
      index % 2 !== 0 ||
      ["--rounds", "--goals", "--scenarios", "--modes", "--output"].includes(arg),
  ),
);
const output = resolve(option("output", join(tmpdir(), "planner-durable-comparison.json")));
const temporary = await mkdtemp(join(tmpdir(), "planner-durable-prototype-"));
const scriptPath = join(temporary, "worker.mjs");
// This is a historical comparison, not another runtime implementation. Keep the
// removed staged Cron solely in Git, at its reviewed prototype baseline.
const baselineRevision = "5e0d309eb508a427d06d12185902aa11c3f91eaf";
const archived = join(temporary, "baseline");
await mkdir(archived);
const archivePath = join(temporary, "baseline.tar");
await writeFile(
  archivePath,
  execFileSync("git", ["archive", baselineRevision, "backend/src"], {
    cwd: root,
    maxBuffer: 20_000_000,
  }),
);
execFileSync("tar", ["-xf", archivePath, "-C", archived]);
await symlink(join(backend, "node_modules"), join(archived, "backend/node_modules"));
const samples = [];
const rawProfiles = [];
const checks = [];
const messageParity = new Map();
const rolloverParity = new Map();
let runtime;

async function sourceFingerprints() {
  const values = {};
  async function walk(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path, `${prefix}/${entry.name}`);
      else if (/\.(?:ts|mjs|json)$/u.test(entry.name))
        values[`${prefix}/${entry.name}`] = createHash("sha256")
          .update(await readFile(path))
          .digest("hex");
    }
  }
  await walk(join(archived, "backend/src"), "baseline/backend/src");
  await walk(dirname(fileURLToPath(import.meta.url)), "backend/experiments/durable-reminders");
  for (const relative of ["package.json", "backend/package.json", "pnpm-lock.yaml"])
    values[relative] = createHash("sha256")
      .update(await readFile(join(root, relative)))
      .digest("hex");
  return values;
}
const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const fingerprints = await sourceFingerprints();

await build({
  entryPoints: [fileURLToPath(new URL("worker.ts", import.meta.url))],
  outfile: scriptPath,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2024",
  sourcemap: true,
  external: ["node:*", "cloudflare:*"],
  plugins: [
    {
      name: "historical-runtime",
      setup(builder) {
        builder.onResolve({ filter: /^\.\.\/\.\.\/src(?:\/.*)?$/ }, ({ path }) => ({
          path: join(archived, "backend", path.slice(6), "index.ts"),
        }));
      },
    },
  ],
});

async function profiler(mf) {
  const endpoint = new URL(await mf.getInspectorURL());
  endpoint.protocol = "http:";
  const targets = await (await fetch(new URL("/json/list", endpoint))).json();
  const target = targets.find((item) => item.id.includes("durable-prototype"));
  assert.ok(
    target?.webSocketDebuggerUrl,
    `Missing local workerd inspector: ${JSON.stringify(targets.map(({ id, title }) => ({ id, title })))}`,
  );
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((accept, reject) => {
    socket.addEventListener("open", accept, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const pending = new Map();
  let sequence = 0;
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
    else callback.accept(message.result);
  });
  const command = (method, params = {}) =>
    new Promise((accept, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => reject(new Error(`Inspector timeout: ${method}`)), 15_000);
      pending.set(id, {
        accept: (value) => {
          clearTimeout(timer);
          accept(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  await command("Profiler.enable");
  await command("Profiler.setSamplingInterval", { interval: 100 });
  return {
    start: () => command("Profiler.start"),
    async stop() {
      const { profile } = await command("Profiler.stop");
      const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
      let activeUs = 0;
      for (let i = 0; i < (profile.samples?.length ?? 0); i++)
        if (
          !["(idle)", "(root)", "(program)"].includes(
            nodes.get(profile.samples[i]).callFrame.functionName,
          )
        )
          activeUs += profile.timeDeltas[i];
      return { sampledActiveMs: activeUs / 1000, profile };
    },
    close: () => socket.close(),
  };
}

async function localRuntime(persistence, messages, scenario, mode) {
  let resolveAlarm;
  let alarmPromise;
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "durable-prototype",
      modules: true,
      scriptPath,
      modulesRoot: temporary,
      compatibilityDate: "2026-08-28",
      compatibilityFlags: ["nodejs_compat"],
      inspectorPort: 0,
      unsafeInspectDurableObjects: true,
      resourcePersistencePath: persistence,
      d1Databases: ["DB"],
      durableObjects: { EXECUTOR: { className: "LocalExecutor", useSQLite: true } },
      bindings: {
        AUTH_MODE: "disabled",
        APP_ORIGIN: "http://localhost:8787",
        TELEGRAM_BOT_MODE: "webhook",
        TELEGRAM_BOT_TOKEN: "123:local-prototype-only",
      },
      serviceBindings: {
        RESULTS: async (request) => {
          const result = await request.json();
          resolveAlarm?.(result);
          return new Response("Recorded");
        },
      },
      outboundService: async (request) => {
        const url = new URL(request.url);
        assert.equal(url.hostname, "api.telegram.org", "Every other outbound request is forbidden");
        assert.equal(url.pathname, "/bot123:local-prototype-only/sendMessage");
        messages.push(await request.json());
        // Model API acceptance followed by an unreadable/lost response.
        if (scenario === "ambiguous") return new Response("Unreadable response", { status: 502 });
        return Response.json({ ok: true, result: { message_id: messages.length } });
      },
    }),
  );
  // Load modules before the first measured application execution in every mode.
  await mf.dispatchFetch("http://localhost/ping");
  if (mode !== "cron") await mf.dispatchFetch("http://localhost/init");
  const cpu = await profiler(mf);
  return {
    mf,
    cpu,
    async invoke(input, path = input.mode === "cron" ? "/cron" : "/start") {
      alarmPromise = new Promise((accept) => {
        resolveAlarm = accept;
      });
      const response = await mf.dispatchFetch(`http://localhost${path}`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      assert.equal(response.status, path === "/cron" ? 200 : 202, await response.clone().text());
      if (path === "/cron") return response.json();
      let timeout;
      try {
        return await Promise.race([
          alarmPromise,
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error("Alarm did not finish within 30 seconds")),
              30_000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    },
    async dispose() {
      cpu.close();
      await mf.dispose();
    },
  };
}

async function prepare(input, label) {
  const messages = [];
  const persistence = join(temporary, label);
  const instance = await localRuntime(persistence, messages, input.scenario, input.mode);
  const database = await instance.mf.getD1Database("DB");
  await migrate(database, backend);
  await seed(database, input.scenario, input.goals);
  return { instance, database, messages, persistence };
}

async function capture(instance, input, path, label) {
  await instance.cpu.start();
  const start = performance.now();
  const result = await instance.invoke(input, path);
  const elapsedMs = performance.now() - start;
  const cpu = await instance.cpu.stop();
  // Async alarm continuations need not retain an `alarm` frame in V8's stack.
  // The completion callback can only originate in alarm(); retain raw profiles
  // so application frames and the accounting can be independently inspected.
  rawProfiles.push({ label, mode: input.mode, scenario: input.scenario, profile: cpu.profile });
  assert.ok(cpu.sampledActiveMs >= 0);
  return { ...result, elapsedMs, sampledActiveMs: cpu.sampledActiveMs };
}

try {
  for (let round = 0; round < rounds; round++) {
    for (const scenario of selected) {
      // Rotate order, keep execution sequential to avoid benchmark contention.
      const order = [...modes.slice(round % modes.length), ...modes.slice(0, round % modes.length)];
      for (const mode of order) {
        const input = { mode, scenario, now: logicalTime(scenario), goals };
        const prepared = await prepare(input, `${round}-${scenario}-${mode}`);
        runtime = prepared.instance;
        const observations = [];
        for (let step = 0; step < 200; step++) {
          observations.push(
            await capture(runtime, input, undefined, `${round}-${scenario}-${mode}-${step}`),
          );
          if (complete(await observe(prepared.database), input)) break;
          assert.equal(mode, "cron", "DO must drain the fixture or explicitly pause");
        }
        const state = await verify(prepared.database, input, prepared.messages);
        const key = `${round}-${scenario}`;
        const actual = JSON.stringify(prepared.messages);
        if (messageParity.has(key))
          assert.equal(actual, messageParity.get(key), "Transport payload parity across modes");
        else messageParity.set(key, actual);
        if (scenario === "rollover") {
          const rules = await prepared.database
            .prepare(`SELECT g.owner_id, g.carried_from_goal_id,
            g.title, g.tracking_type, g.tracking_config, g.cadence_period, g.target_occurrences,
            r.mode, r.time, r.weekdays, r.next_run_at, p.included FROM plan_goals g
            JOIN goal_reminders r ON r.goal_id = g.id JOIN goal_progress_reports p ON p.goal_id = g.id
            WHERE g.month = '2026-11' ORDER BY g.owner_id, g.carried_from_goal_id`)
            .all();
          const canonical = JSON.stringify(rules.results);
          if (rolloverParity.has(key))
            assert.equal(canonical, rolloverParity.get(key), "Inherited data parity across modes");
          else rolloverParity.set(key, canonical);
        }
        if (["ambiguous", "expired", "quiet"].includes(scenario)) {
          // Re-enter via the actual scheduled/alarm path after the terminal or
          // postponed state. No second transport attempt may appear.
          await runtime.invoke(input);
          await verify(prepared.database, input, prepared.messages);
          checks.push({
            round,
            mode,
            scenario,
            check: "replay preserves delivery policy",
            passed: true,
          });
        }
        const sample = {
          round,
          scenario,
          mode,
          goalsPerOwner: goals,
          invocations: observations.length,
          transitions: observations.reduce((sum, item) => sum + item.transitions, 0),
          queries: observations.reduce((sum, item) => sum + item.queries, 0),
          observerQueries: observations.reduce((sum, item) => sum + item.observerQueries, 0),
          elapsedMs: observations.reduce((sum, item) => sum + item.elapsedMs, 0),
          sampledActiveMs: observations.reduce((sum, item) => sum + item.sampledActiveMs, 0),
          maxInvocationSampledActiveMs: Math.max(
            ...observations.map((item) => item.sampledActiveMs),
          ),
          modeledCronWaitMs: mode === "cron" ? (observations.length - 1) * 60_000 : 0,
          sends: prepared.messages.length,
          statuses: state.jobs.map((job) => job.status),
          observations,
        };
        samples.push(sample);
        const { observations: _observations, ...summary } = sample;
        console.log(JSON.stringify(summary));
        await runtime.dispose();
        runtime = undefined;
      }
    }
  }
  // Deterministic restart at the raw-capture checkpoint, preserving both stores.
  for (const mode of ["do-staged", "do-direct"].filter((mode) => modes.includes(mode))) {
    const input = {
      mode,
      scenario: "report",
      now: logicalTime("report"),
      goals,
      budget: mode === "do-staged" ? 3 : 1,
    };
    const prepared = await prepare(input, `restart-${mode}`);
    runtime = prepared.instance;
    const partial = await runtime.invoke(input);
    if (mode === "do-staged") {
      assert.equal(partial.done, false);
      assert.equal(prepared.messages.length, 0);
      const before = await observe(prepared.database);
      assert.equal(JSON.parse(before.jobs[0].payload).version, 6);
      await runtime.dispose();
      runtime = undefined;
      runtime = await localRuntime(prepared.persistence, prepared.messages, "report", mode);
      const resumed = await runtime.invoke(input, "/resume");
      assert.equal(resumed.done, true);
      const database = await runtime.mf.getD1Database("DB");
      await verify(database, input, prepared.messages);
      checks.push({ mode, check: "runtime restart after raw capture", passed: true });
    }
    // Replay an already delivered job through a fresh alarm. Existing atomic
    // D1 claim must prevent another external call, including after restart.
    await runtime.invoke({ ...input, budget: 200 });
    assert.equal(prepared.messages.length, 1);
    checks.push({ mode, check: "replay after completed send", passed: true });
    await runtime.dispose();
    runtime = undefined;
  }
  assert.deepEqual(
    await sourceFingerprints(),
    fingerprints,
    "Executable sources changed during measurement",
  );
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    sourceRevision,
  );
  const result = {
    schemaVersion: 1,
    revision: sourceRevision,
    baselineRevision,
    node: process.version,
    createdAt: new Date().toISOString(),
    rounds,
    goalsPerOwner: goals,
    method:
      "Sequential local workerd; V8 inspector active samples excluding idle/root/program; modules loaded, fresh application runner; fixed logical clock for exact payload parity; no simulated minute sleeps.",
    limitations: [
      "Not Cloudflare billed CPU or enforced Free-tier limits",
      "Not production cold-start evidence",
      "Zero real network or Telegram sends",
      "Elapsed time includes local dispatch, D1 and a 25-ms DO alarm arming delay; baseline excludes host observation",
      "DO drain includes one fixture-completion observer query per transition; DO storage and result callback are included in CPU capture",
      "Cron wait is modeled at one minute per transition, not observed wall time; excludes backlog/maintenance/quiet-hours delay",
      "Small synthetic sample; no production reliability or capacity claim",
    ],
    fingerprints,
    samples,
    checks,
  };
  await mkdir(dirname(output), { recursive: true });
  const profilePath = `${output.replace(/\.json$/u, "")}-profiles.json.gz`;
  await writeFile(profilePath, gzipSync(JSON.stringify(rawProfiles)));
  result.profiles = basename(profilePath);
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Comparison and checks saved to ${output}`);
} finally {
  await runtime?.dispose();
  await rm(temporary, { recursive: true, force: true });
}
