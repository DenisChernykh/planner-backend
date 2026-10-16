import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const backend = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(join(backend, "package.json"));
const dependencies = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare, convertV4MiniflareOptions } = dependencies("miniflare");
const { build } = dependencies("esbuild");
const state = await mkdtemp(join(tmpdir(), "planner-reminder-profile-"));
const scriptPath = join(state, "worker.mjs");
const sourceRef = process.env.PLANNER_PROFILE_REF;
const iterations = Number(process.env.PLANNER_PROFILE_ITERATIONS ?? 15);
assert.ok(Number.isInteger(iterations) && iterations >= 1 && iterations <= 50);
if (sourceRef) {
  const run = promisify(execFile);
  const { stdout } = await run("git", ["archive", sourceRef, "backend/src"], {
    cwd: join(backend, ".."),
    encoding: "buffer",
    maxBuffer: 20_000_000,
  });
  const archive = join(state, "source.tar");
  await writeFile(archive, stdout);
  await run("tar", ["-xf", archive, "-C", state]);
  await symlink(join(backend, "node_modules"), join(state, "backend/node_modules"));
}
await build({
  entryPoints: [join(backend, "scripts/profile-reminders-worker.ts")],
  outfile: scriptPath,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2024",
  sourcemap: true,
  external: ["node:*", "cloudflare:*"],
  plugins: sourceRef
    ? [
        {
          name: "profile-committed-source",
          setup(builder) {
            builder.onResolve({ filter: /^\.\.\/src$/ }, () => ({
              path: join(state, "backend/src/index.ts"),
            }));
          },
        },
      ]
    : [],
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    name: "reminder-profile",
    modules: true,
    scriptPath,
    modulesRoot: state,
    compatibilityDate: "2026-08-28",
    compatibilityFlags: ["nodejs_compat"],
    inspectorPort: 0,
    d1Databases: ["DB"],
    bindings: {
      AUTH_MODE: "disabled",
      APP_ORIGIN: "http://localhost:8787",
      AUTH_SUCCESS_REDIRECT_URL: "http://localhost:8787/",
      BUILD_REVISION: "profile",
      TELEGRAM_BOT_MODE: "webhook",
      TELEGRAM_BOT_TOKEN: "123:local-profile-only",
      TELEGRAM_BOT_WEBHOOK_SECRET: "local-profile-only",
    },
    outboundService: () => {
      throw new Error("External network is disabled in the profiling fixture");
    },
  }),
);
let socket;
try {
  const database = await mf.getD1Database("DB");
  for (const file of (await readdir(join(backend, "migrations")))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(join(backend, "migrations", file), "utf8");
    for (const statement of sql
      .split("--> statement-breakpoint")
      .map((part) => part.trim())
      .filter(Boolean))
      await database.exec(statement.replaceAll("\n", " "));
  }
  const now = Date.parse("2026-10-13T06:01:00Z");
  for (const owner of ["profile-a", "profile-b"]) {
    await database
      .prepare("INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)")
      .bind(owner, now, now)
      .run();
    await database
      .prepare(
        "INSERT INTO reminder_settings (owner_id, enabled, next_evening_at) VALUES (?, 1, ?)",
      )
      .bind(owner, now + 3600000)
      .run();
    await database
      .prepare("INSERT INTO telegram_links VALUES (?, ?, ?, 'active')")
      .bind(owner, owner, owner)
      .run();
    await database
      .prepare("INSERT INTO plan_month_rollovers VALUES (?, '2026-10', 'profile', NULL, ?)")
      .bind(owner, now)
      .run();
    for (let i = 0; i < 20; i++) {
      const id = `${owner}-${i}`;
      await database
        .prepare(`INSERT INTO plan_goals (id, owner_id, month, title, tracking_type, tracking_config, cadence_period, sort_order, created_at, updated_at)
        VALUES (?, ?, '2026-10', ?, 'time', '{"type":"time"}', 'day', ?, ?, ?)`)
        .bind(id, owner, `Goal ${i}`, i, now, now)
        .run();
      await database
        .prepare(
          "INSERT INTO goal_reminders (goal_id, owner_id, mode, time, weekdays, next_run_at) VALUES (?, ?, 'scheduled', '11:00', '[1,2,3,4,5,6,7]', ?)",
        )
        .bind(id, owner, now + 86400000)
        .run();
    }
  }
  const inspector = await mf.getInspectorURL();
  const endpoint = new URL(inspector);
  endpoint.protocol = "http:";
  const targets = await (await fetch(new URL("/json/list", endpoint))).json();
  const target = targets.find((item) => item.id.includes("reminder-profile")) ?? targets[0];
  assert.ok(target?.webSocketDebuggerUrl, "Worker inspector must expose a debug target");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
    else callback.resolve(message.result);
  });
  const command = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  await command("Profiler.enable");
  await command("Profiler.setSamplingInterval", { interval: 100 });
  const tick = async (at = now) => {
    const response = await mf.dispatchFetch("http://localhost/profile", {
      method: "POST",
      body: JSON.stringify({ now: at }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const setup = async (scenario) => {
    const at = scenario.startsWith("hour-")
      ? Date.parse("2026-10-13T06:00:00Z")
      : scenario === "weekly-report"
        ? Date.parse("2026-10-14T16:01:00Z")
        : ["rollover", "rollover-inherit"].includes(scenario)
          ? Date.parse("2026-11-01T06:01:00Z")
          : now;
    if (["rollover", "rollover-inherit"].includes(scenario)) {
      await database.prepare("DELETE FROM plan_goals WHERE month = '2026-11'").run();
      await database.prepare("DELETE FROM plan_month_rollovers WHERE month = '2026-11'").run();
      if (scenario === "rollover-inherit") {
        await database
          .prepare(`INSERT INTO plan_goals
          (id, owner_id, month, carried_from_goal_id, title, tracking_type, tracking_config, cadence_period, sort_order, created_at, updated_at)
          SELECT 'inherited-' || id, owner_id, '2026-11', id, title, tracking_type, tracking_config, cadence_period, sort_order, ?, ?
          FROM plan_goals WHERE month = '2026-10'`)
          .bind(at, at)
          .run();
        await database
          .prepare(
            "INSERT INTO plan_month_rollovers SELECT id, '2026-11', 'profile', '2026-10', ? FROM users",
          )
          .bind(at)
          .run();
      }
    }
    await database.prepare("DELETE FROM reminder_jobs").run();
    await database
      .prepare("UPDATE goal_reminders SET next_run_at = ?")
      .bind(at + 86400000)
      .run();
    await database
      .prepare("UPDATE reminder_settings SET next_evening_at = ?")
      .bind(at + 86400000)
      .run();
    await database
      .prepare("UPDATE progress_report_settings SET next_wednesday_at = ?, next_sunday_at = ?")
      .bind(at + 7 * 86400000, at + 7 * 86400000)
      .run();
    if (["question", "hour-question"].includes(scenario))
      await database
        .prepare("UPDATE goal_reminders SET next_run_at = ? WHERE goal_id = 'profile-a-0'")
        .bind(at)
        .run();
    if (scenario === "digest")
      await database
        .prepare("UPDATE reminder_settings SET next_evening_at = ? WHERE owner_id = 'profile-a'")
        .bind(now)
        .run();
    if (["queued-question", "hour-queued-question"].includes(scenario)) {
      await database
        .prepare(`INSERT INTO reminder_jobs
        (id, event_key, owner_id, goal_id, local_date, kind, status, due_at, expires_at, payload, attempts, created_at)
        VALUES ('profile-queued', 'profile-queued', 'profile-a', 'profile-a-0', '2026-10-13', 'question', 'pending', ?, ?, '[]', 0, ?)`)
        .bind(at, at + 86400000, at)
        .run();
    }
    if (scenario === "weekly-report") {
      await database
        .prepare("UPDATE goal_reminders SET next_run_at = ?")
        .bind(at + 86400000)
        .run();
      await database
        .prepare("UPDATE reminder_settings SET next_evening_at = ?")
        .bind(at + 86400000)
        .run();
      await database
        .prepare(`INSERT INTO progress_report_settings (owner_id, enabled, next_wednesday_at, next_sunday_at)
        VALUES ('profile-a', 1, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET next_wednesday_at = excluded.next_wednesday_at`)
        .bind(at, at + 7 * 86400000)
        .run();
      await database
        .prepare(
          "INSERT INTO goal_progress_reports SELECT id, owner_id, 1 FROM plan_goals WHERE owner_id = 'profile-a' ON CONFLICT DO NOTHING",
        )
        .run();
    }
    return at;
  };
  const firstScenario = process.env.PLANNER_PROFILE_FIRST_SCENARIO ?? "idle";
  assert.ok(
    [
      "idle",
      "question",
      "digest",
      "queued-question",
      "weekly-report",
      "rollover",
      "rollover-inherit",
      "hour-question",
      "hour-queued-question",
    ].includes(firstScenario),
  );
  const firstAt = await setup(firstScenario);
  await command("Profiler.start");
  const firstRun = await tick(firstAt);
  const { profile: firstProfile } = await command("Profiler.stop");
  const firstNodes = new Map(firstProfile.nodes.map((node) => [node.id, node]));
  const firstTop = new Map();
  for (let i = 0; i < firstProfile.samples.length; i++) {
    const name = firstNodes.get(firstProfile.samples[i]).callFrame.functionName || "(anonymous)";
    if (!["(idle)", "(root)", "(program)"].includes(name))
      firstTop.set(name, (firstTop.get(name) ?? 0) + firstProfile.timeDeltas[i]);
  }
  const firstActiveMs =
    firstProfile.samples.reduce(
      (total, sample, i) =>
        ["(idle)", "(root)", "(program)"].includes(firstNodes.get(sample).callFrame.functionName)
          ? total
          : total + firstProfile.timeDeltas[i],
      0,
    ) / 1000;
  console.log(
    JSON.stringify({
      scenario: "first-run",
      firstScenario,
      sourceRef: sourceRef ?? "working-tree",
      ...firstRun,
      sampledActiveMs: firstActiveMs,
      top: [...firstTop].sort((a, b) => b[1] - a[1]).slice(0, 10),
    }),
  );
  if (process.env.PLANNER_PROFILE_OUTPUT)
    await writeFile(
      `${process.env.PLANNER_PROFILE_OUTPUT}-first-run.cpuprofile`,
      JSON.stringify(firstProfile),
    );
  for (const scenario of process.env.PLANNER_PROFILE_FIRST_ONLY === "1"
    ? []
    : [
        "idle",
        "question",
        "digest",
        "queued-question",
        "weekly-report",
        "rollover",
        "rollover-inherit",
      ]) {
    const results = [];
    const profiles = [];
    const active = new Map();
    const times = [];
    const followups = new Map();
    for (let i = 0; i < iterations; i++) {
      const at = await setup(scenario);
      await command("Profiler.start");
      results.push(await tick(at));
      const { profile } = await command("Profiler.stop");
      profiles.push(profile);
      // Measure each persisted stage separately: old revisions may send immediately,
      // current Cron schedules, prepares reports and sends on independent ticks.
      for (let step = 1; step <= 2; step++) {
        const pending = await database
          .prepare("SELECT 1 FROM reminder_jobs WHERE status = 'pending' LIMIT 1")
          .first();
        if (!pending) break;
        await command("Profiler.start");
        const result = await tick(at + step * 60_000);
        const { profile: extra } = await command("Profiler.stop");
        const extraNodes = new Map(extra.nodes.map((node) => [node.id, node]));
        const ms =
          extra.samples.reduce(
            (total, sample, index) =>
              ["(idle)", "(root)", "(program)"].includes(
                extraNodes.get(sample).callFrame.functionName,
              )
                ? total
                : total + extra.timeDeltas[index],
            0,
          ) / 1000;
        const phase = result.messages ? "send" : "prepare";
        if (!followups.has(phase)) followups.set(phase, []);
        followups.get(phase).push({ ...result, ms });
        if (process.env.PLANNER_PROFILE_OUTPUT)
          await writeFile(
            `${process.env.PLANNER_PROFILE_OUTPUT}-${scenario}-${phase}-${i}.cpuprofile`,
            JSON.stringify(extra),
          );
      }
      const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
      let time = 0;
      for (let sample = 0; sample < (profile.samples?.length ?? 0); sample++) {
        const node = nodes.get(profile.samples[sample]);
        const name = node.callFrame.functionName || "(anonymous)";
        if (["(idle)", "(root)", "(program)"].includes(name)) continue;
        const duration = profile.timeDeltas[sample];
        active.set(name, (active.get(name) ?? 0) + duration);
        time += duration;
      }
      times.push(time / 1000);
    }
    const sorted = [...times].sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        scenario,
        ticks: results.length,
        queries: results.map((result) => result.queries),
        messages: results.map((result) => result.messages),
        sampledActiveMsMedian: sorted[Math.floor(sorted.length * 0.5)],
        sampledActiveMsP90: sorted[Math.floor(sorted.length * 0.9)],
        sampledActiveMs: times,
        top: [...active].sort((a, b) => b[1] - a[1]).slice(0, 8),
      }),
    );
    for (const [phase, measurements] of followups) {
      const sorted = measurements.map((row) => row.ms).sort((a, b) => a - b);
      console.log(
        JSON.stringify({
          scenario: `${scenario}-${phase}`,
          ticks: measurements.length,
          queries: measurements.map((row) => row.queries),
          messages: measurements.map((row) => row.messages),
          sampledActiveMsMedian: sorted[Math.floor(sorted.length * 0.5)],
          sampledActiveMsP90: sorted[Math.floor(sorted.length * 0.9)],
          sampledActiveMs: measurements.map((row) => row.ms),
        }),
      );
    }
    if (process.env.PLANNER_PROFILE_OUTPUT) {
      for (let i = 0; i < profiles.length; i++)
        await writeFile(
          `${process.env.PLANNER_PROFILE_OUTPUT}-${scenario}-${i}.cpuprofile`,
          JSON.stringify(profiles[i]),
        );
    }
  }
} finally {
  socket?.close();
  await mf.dispose();
  await rm(state, { recursive: true, force: true });
}
