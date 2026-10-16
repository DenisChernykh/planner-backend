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
const goalCount = Number(process.env.PLANNER_PROFILE_GOALS ?? 20);
assert.ok(Number.isInteger(goalCount) && goalCount >= 1 && goalCount <= 100);
const workload = process.env.PLANNER_PROFILE_WORKLOAD ?? "uniform";
assert.ok(["uniform", "mixed"].includes(workload));
const reportDate = workload === "mixed" ? "2026-10-28" : "2026-10-14";
const reportMonday = workload === "mixed" ? "2026-10-26" : "2026-10-12";
const scenarios = [
  "idle",
  "question",
  "digest",
  "queued-question",
  "weekly-report",
  "weekly-report-quiet",
  "weekly-report-prepare",
  "weekly-report-render",
  "weekly-report-send",
  "rollover",
  "rollover-inherit",
  "hour-question",
  "hour-queued-question",
];
const selectedScenarios = process.env.PLANNER_PROFILE_SCENARIOS?.split(",") ?? [
  "idle",
  "question",
  "digest",
  "queued-question",
  "weekly-report",
  "rollover",
  "rollover-inherit",
];
assert.ok(
  selectedScenarios.length > 0 &&
    selectedScenarios.every((scenario) => scenarios.includes(scenario)),
);
const inputSnapshot = process.env.PLANNER_PROFILE_SNAPSHOT
  ? await readFile(process.env.PLANNER_PROFILE_SNAPSHOT, "utf8")
  : null;
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
    for (let i = 0; i < goalCount; i++) {
      const id = `${owner}-${i}`;
      const tracking =
        workload === "uniform"
          ? { type: "time" }
          : [
              { type: "check" },
              { type: "quantity", comparison: "atLeast", targetValue: 20, unit: "страниц" },
              { type: "scale", min: 1, max: 10 },
              { type: "time", targetStart: "07:00", targetEnd: "09:00" },
            ][i % 4];
      const cadence = workload === "uniform" ? "day" : ["day", "week", "month"][i % 3];
      await database
        .prepare(`INSERT INTO plan_goals (id, owner_id, month, title, tracking_type, tracking_config, cadence_period, sort_order, created_at, updated_at)
        VALUES (?, ?, '2026-10', ?, 'time', '{"type":"time"}', 'day', ?, ?, ?)`)
        .bind(id, owner, `Goal ${i}`, i, now, now)
        .run();
      if (workload === "mixed")
        await database
          .prepare(`UPDATE plan_goals SET tracking_type = ?, tracking_config = ?,
          cadence_period = ?, target_occurrences = ? WHERE id = ?`)
          .bind(
            tracking.type,
            JSON.stringify(tracking),
            cadence,
            cadence === "day" ? null : cadence === "week" ? 4 : 20,
            id,
          )
          .run();
      await database
        .prepare(
          "INSERT INTO goal_reminders (goal_id, owner_id, mode, time, weekdays, next_run_at) VALUES (?, ?, 'scheduled', '11:00', '[1,2,3,4,5,6,7]', ?)",
        )
        .bind(id, owner, now + 86400000)
        .run();
      if (workload === "mixed") {
        await database
          .prepare("UPDATE goal_reminders SET time = ?, weekdays = ? WHERE goal_id = ?")
          .bind(
            ["09:00", "13:30", "20:00"][i % 3],
            JSON.stringify(i % 3 === 0 ? [1, 3, 5] : [1, 2, 3, 4, 5, 6, 7]),
            id,
          )
          .run();
        const entries = Array.from({ length: 28 }, (_, day) => ({
          date: `2026-10-${String(day + 1).padStart(2, "0")}`,
          value:
            tracking.type === "check"
              ? day % 3 !== 0
              : tracking.type === "time"
                ? "08:15"
                : tracking.type === "scale"
                  ? (day % 10) + 1
                  : day % 2
                    ? 25
                    : 10,
          met:
            tracking.type === "check"
              ? day % 3 !== 0
              : tracking.type === "quantity"
                ? day % 2 === 1
                : true,
        }));
        await database
          .prepare(`INSERT INTO goal_entries (goal_id, local_date, value, met, created_at, updated_at)
          SELECT ?, json_extract(value, '$.date'),
            CASE json_type(value, '$.value') WHEN 'true' THEN 'true' WHEN 'false' THEN 'false'
              ELSE json_quote(json_extract(value, '$.value')) END,
            json_extract(value, '$.met'), ?, ? FROM json_each(?)`)
          .bind(id, now, now, JSON.stringify(entries))
          .run();
      }
    }
    // Include both inherited inclusions and explicit exclusions, including when
    // inheritance is the very first request in a fresh Worker instance.
    await database
      .prepare(`INSERT INTO goal_progress_reports SELECT id, owner_id,
      CASE WHEN ? = 'mixed' AND sort_order % 5 = 0 THEN 0 ELSE 1 END
      FROM plan_goals WHERE owner_id = ?`)
      .bind(workload, owner)
      .run();
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
      : scenario.startsWith("weekly-report")
        ? Date.parse(`${reportDate}T16:01:00Z`)
        : ["rollover", "rollover-inherit"].includes(scenario)
          ? Date.parse("2026-11-01T06:01:00Z")
          : now;
    if (["rollover", "rollover-inherit"].includes(scenario)) {
      await database.prepare("DELETE FROM plan_goals WHERE month = '2026-11'").run();
      await database.prepare("DELETE FROM plan_month_rollovers WHERE month = '2026-11'").run();
      if (scenario === "rollover-inherit") {
        await database
          .prepare(`INSERT INTO plan_goals
          (id, owner_id, month, carried_from_goal_id, title, tracking_type, tracking_config, cadence_period, target_occurrences, sort_order, created_at, updated_at)
          SELECT 'inherited-' || id, owner_id, '2026-11', id, title, tracking_type, tracking_config, cadence_period, target_occurrences, sort_order, ?, ?
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
      .prepare(
        "UPDATE reminder_settings SET next_evening_at = ?, quiet_start = '23:00', quiet_end = '08:00'",
      )
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
    if (scenario.startsWith("weekly-report")) {
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
        .bind(
          ["weekly-report", "weekly-report-quiet"].includes(scenario) ? at : at + 7 * 86400000,
          at + 7 * 86400000,
        )
        .run();
      if (!["weekly-report", "weekly-report-quiet"].includes(scenario)) {
        const payload = ["weekly-report-render", "weekly-report-send"].includes(scenario)
          ? inputSnapshot
          : "[]";
        assert.ok(
          payload,
          "Sending a report as the first invocation requires PLANNER_PROFILE_SNAPSHOT from a separate preparation run",
        );
        await database
          .prepare(`INSERT INTO reminder_jobs
          (id, event_key, owner_id, local_date, kind, status, due_at, expires_at, payload, attempts, created_at)
          VALUES ('profile-report', ?, 'profile-a', ?, 'weekly-progress', 'pending', ?, ?, ?, 0, ?)`)
          .bind(
            `progress:profile-a:${reportMonday}:wed`,
            reportDate,
            at,
            at + 86400000,
            payload,
            at,
          )
          .run();
      }
      await database
        .prepare(
          "INSERT INTO goal_progress_reports SELECT id, owner_id, 1 FROM plan_goals WHERE owner_id = 'profile-a' ON CONFLICT DO NOTHING",
        )
        .run();
      if (scenario === "weekly-report-quiet")
        await database
          .prepare(
            "UPDATE reminder_settings SET quiet_start = '00:00', quiet_end = '23:59' WHERE owner_id = 'profile-a'",
          )
          .run();
    }
    return at;
  };
  const monthState = () =>
    database
      .prepare(`SELECT
    (SELECT count(*) FROM plan_month_rollovers WHERE month = '2026-11') AS owners,
    (SELECT count(*) FROM plan_goals WHERE month = '2026-11') AS goals,
    (SELECT count(*) FROM goal_reminders r JOIN plan_goals g ON g.id = r.goal_id WHERE g.month = '2026-11') AS reminders,
    (SELECT count(*) FROM goal_progress_reports r JOIN plan_goals g ON g.id = r.goal_id WHERE g.month = '2026-11') AS selections`)
      .first();
  const verifyStage = async (scenario, result) => {
    if (scenario === "weekly-report-quiet") {
      const job = await database
        .prepare(
          "SELECT due_at, payload, attempts FROM reminder_jobs WHERE kind = 'weekly-progress'",
        )
        .first();
      assert.ok(job && job.due_at > Date.parse(`${reportDate}T16:01:00Z`));
      assert.equal(job.payload, "[]");
      assert.equal(job.attempts, 0);
      assert.equal(result.messages, 0);
    }
    if (
      ["weekly-report-prepare", "weekly-report-render", "weekly-report-send"].includes(scenario)
    ) {
      const job = await database
        .prepare("SELECT status, attempts, payload FROM reminder_jobs WHERE id = 'profile-report'")
        .first();
      assert.ok(
        job && job.payload !== "[]",
        "The report snapshot must be built, not silently cancelled",
      );
      assert.ok(JSON.parse(job.payload).goalIds.length > 0);
      assert.ok([1, 2].includes(JSON.parse(job.payload).version));
      if (scenario !== "weekly-report-prepare") assert.equal(JSON.parse(job.payload).version, 1);
      assert.equal(job.status, scenario === "weekly-report-send" ? "sent" : "pending");
      assert.equal(job.attempts, scenario === "weekly-report-send" ? 1 : 0);
      assert.equal(result.messages, scenario === "weekly-report-send" ? 1 : 0);
    }
    if (scenario === "rollover" || scenario === "rollover-inherit") {
      const state = await monthState();
      assert.equal(result.messages, 0);
      assert.equal(state.goals, goalCount * (scenario === "rollover" ? 1 : 2));
      if (scenario === "rollover") {
        assert.equal(state.reminders, 0);
        assert.equal(state.selections, 0);
      } else {
        assert.ok(state.reminders > 0 && state.reminders <= goalCount);
        assert.ok(state.selections > 0 && state.selections <= goalCount);
      }
    }
  };
  const firstScenario = process.env.PLANNER_PROFILE_FIRST_SCENARIO ?? "idle";
  assert.ok(scenarios.includes(firstScenario));
  const firstAt = await setup(firstScenario);
  await command("Profiler.start");
  const firstRun = await tick(firstAt);
  const { profile: firstProfile } = await command("Profiler.stop");
  await verifyStage(firstScenario, firstRun);
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
      workload,
      goalsPerOwner: goalCount,
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
  if (process.env.PLANNER_PROFILE_SNAPSHOT_OUTPUT) {
    const prepared = await database
      .prepare(
        "SELECT payload FROM reminder_jobs WHERE kind = 'weekly-progress' AND payload != '[]' LIMIT 1",
      )
      .first("payload");
    assert.equal(
      typeof prepared,
      "string",
      "The first invocation must prepare a real report snapshot",
    );
    await writeFile(process.env.PLANNER_PROFILE_SNAPSHOT_OUTPUT, prepared);
  }
  for (const scenario of process.env.PLANNER_PROFILE_FIRST_ONLY === "1" ? [] : selectedScenarios) {
    const results = [];
    const profiles = [];
    const active = new Map();
    const times = [];
    const followups = new Map();
    for (let i = 0; i < iterations; i++) {
      const at = await setup(scenario);
      await command("Profiler.start");
      const result = await tick(at);
      results.push(result);
      const { profile } = await command("Profiler.stop");
      await verifyStage(scenario, result);
      profiles.push(profile);
      // Measure each persisted stage separately: old revisions may send immediately,
      // current Cron schedules, prepares reports and sends on independent ticks.
      for (let step = 1; step <= 2 + 2 * Math.ceil(goalCount / 24); step++) {
        if (scenario === "weekly-report-quiet") break;
        const monthly = scenario === "rollover" || scenario === "rollover-inherit";
        const before = monthly ? await monthState() : null;
        if (
          monthly &&
          before.owners === 2 &&
          before.reminders === goalCount * 2 &&
          before.selections === goalCount * 2
        )
          break;
        const pending = await database
          .prepare("SELECT 1 FROM reminder_jobs WHERE status = 'pending' LIMIT 1")
          .first();
        if (!monthly && !pending) break;
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
        const after = monthly ? await monthState() : null;
        const currentPayload =
          !monthly && !result.messages
            ? await database
                .prepare("SELECT payload FROM reminder_jobs WHERE status = 'pending' LIMIT 1")
                .first("payload")
            : null;
        const phase = monthly
          ? after.goals > before.goals
            ? "copy"
            : "inherit"
          : result.messages
            ? "send"
            : currentPayload && JSON.parse(currentPayload).version === 2
              ? "load"
              : "prepare";
        if (!followups.has(phase)) followups.set(phase, []);
        followups.get(phase).push({ ...result, ms });
        if (process.env.PLANNER_PROFILE_OUTPUT)
          await writeFile(
            `${process.env.PLANNER_PROFILE_OUTPUT}-${scenario}-${phase}-${i}.cpuprofile`,
            JSON.stringify(extra),
          );
      }
      if (scenario === "rollover" || scenario === "rollover-inherit") {
        const state = await monthState();
        assert.equal(state.owners, 2);
        assert.equal(state.reminders, goalCount * 2);
        assert.equal(state.selections, goalCount * 2);
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
        sourceScenario: scenario,
        phase: "initial",
        sourceRef: sourceRef ?? "working-tree",
        workload,
        goalsPerOwner: goalCount,
        ticks: results.length,
        queries: results.map((result) => result.queries),
        messages: results.map((result) => result.messages),
        sampledActiveMsMedian: sorted[Math.floor(sorted.length * 0.5)],
        sampledActiveMsP90: sorted[Math.floor(sorted.length * 0.9)],
        sampledActiveMsMax: sorted.at(-1),
        over10: times.filter((ms) => ms > 10).length,
        sampledActiveMs: times,
        top: [...active].sort((a, b) => b[1] - a[1]).slice(0, 8),
      }),
    );
    for (const [phase, measurements] of followups) {
      const sorted = measurements.map((row) => row.ms).sort((a, b) => a - b);
      console.log(
        JSON.stringify({
          scenario: `${scenario}-${phase}`,
          sourceScenario: scenario,
          phase,
          sourceRef: sourceRef ?? "working-tree",
          workload,
          goalsPerOwner: goalCount,
          ticks: measurements.length,
          queries: measurements.map((row) => row.queries),
          messages: measurements.map((row) => row.messages),
          sampledActiveMsMedian: sorted[Math.floor(sorted.length * 0.5)],
          sampledActiveMsP90: sorted[Math.floor(sorted.length * 0.9)],
          sampledActiveMsMax: sorted.at(-1),
          over10: sorted.filter((ms) => ms > 10).length,
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
