import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const owners = ["prototype-a", "prototype-b"];
export const scenarios = ["report", "rollover", "quiet", "question", "ambiguous", "expired"];
export function logicalTime(scenario) {
  return Date.parse(scenario === "rollover" ? "2026-11-01T06:01:00Z" : "2026-10-28T16:01:00Z");
}

export async function migrate(database, backend) {
  for (const file of (await readdir(join(backend, "migrations")))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(join(backend, "migrations", file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint").filter((part) => part.trim()))
      await database.exec(statement.replaceAll("\n", " "));
  }
}

export async function seed(database, scenario, goals) {
  const now = logicalTime(scenario);
  for (const owner of owners) {
    await database
      .prepare("INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)")
      .bind(owner, now, now)
      .run();
    await database
      .prepare(`INSERT INTO reminder_settings
        (owner_id, enabled, next_evening_at, quiet_start, quiet_end)
        VALUES (?, 1, ?, '23:00', '08:00')`)
      .bind(owner, now + 86_400_000)
      .run();
    await database
      .prepare("INSERT INTO telegram_links VALUES (?, ?, ?, 'active')")
      .bind(owner, owner, owner)
      .run();
    await database
      .prepare("INSERT INTO plan_month_rollovers VALUES (?, '2026-10', 'prototype', NULL, ?)")
      .bind(owner, now)
      .run();
    for (let i = 0; i < goals; i++) {
      const id = `${owner}-${i}`;
      const tracking = [
        { type: "check" },
        { type: "quantity", comparison: "atLeast", targetValue: 20, unit: "страниц" },
        { type: "scale", min: 1, max: 10 },
        { type: "time", targetStart: "07:00", targetEnd: "09:00" },
      ][i % 4];
      const cadence = ["day", "week", "month"][i % 3];
      await database
        .prepare(`INSERT INTO plan_goals
          (id, owner_id, month, title, tracking_type, tracking_config, cadence_period,
          target_occurrences, sort_order, created_at, updated_at)
          VALUES (?, ?, '2026-10', ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          id,
          owner,
          `Goal ${i}`,
          tracking.type,
          JSON.stringify(tracking),
          cadence,
          cadence === "day" ? null : cadence === "week" ? 4 : 20,
          i,
          now,
          now,
        )
        .run();
      await database
        .prepare(`INSERT INTO goal_reminders
          (goal_id, owner_id, mode, time, weekdays, next_run_at)
          VALUES (?, ?, 'scheduled', ?, ?, ?)`)
        .bind(
          id,
          owner,
          ["09:00", "13:30", "20:00"][i % 3],
          JSON.stringify(i % 3 === 0 ? [1, 3, 5] : [1, 2, 3, 4, 5, 6, 7]),
          now + 86_400_000,
        )
        .run();
      const entries = Array.from({ length: 28 }, (_, day) => ({
        date: `2026-10-${String(day + 1).padStart(2, "0")}`,
        value:
          tracking.type === "check"
            ? day % 3 !== 0
            : tracking.type === "time"
              ? day === 0
                ? "00:00"
                : "08:15"
              : tracking.type === "scale"
                ? (day % 10) + 1
                : day === 0
                  ? 0
                  : day % 2
                    ? 25
                    : 10,
      }));
      await database
        .prepare(`INSERT INTO goal_entries (goal_id, local_date, value, met, created_at, updated_at)
          SELECT ?, json_extract(value, '$.date'),
            CASE json_type(value, '$.value') WHEN 'true' THEN 'true' WHEN 'false' THEN 'false'
              ELSE json_quote(json_extract(value, '$.value')) END,
            0, ?, ? FROM json_each(?)`)
        .bind(id, now, now, JSON.stringify(entries))
        .run();
    }
    await database
      .prepare(`INSERT INTO goal_progress_reports SELECT id, owner_id,
        CASE WHEN sort_order % 5 = 0 THEN 0 ELSE 1 END FROM plan_goals WHERE owner_id = ?`)
      .bind(owner)
      .run();
  }
  if (["report", "quiet", "ambiguous"].includes(scenario))
    await database
      .prepare(`INSERT INTO progress_report_settings
        (owner_id, enabled, next_wednesday_at, next_sunday_at) VALUES ('prototype-a', 1, ?, ?)`)
      .bind(now, now + 7 * 86_400_000)
      .run();
  if (scenario === "quiet")
    await database
      .prepare(`UPDATE reminder_settings SET quiet_start = '00:00', quiet_end = '23:59'
        WHERE owner_id = 'prototype-a'`)
      .run();
  if (["question", "expired"].includes(scenario)) {
    await database
      .prepare(
        "DELETE FROM goal_entries WHERE goal_id = 'prototype-a-1' AND local_date = '2026-10-28'",
      )
      .run();
    await database
      .prepare(`INSERT INTO reminder_jobs
        (id, event_key, owner_id, goal_id, local_date, kind, status, due_at, expires_at, payload, attempts, created_at)
        VALUES ('local-question', 'local-question', 'prototype-a', 'prototype-a-1', '2026-10-28',
        'question', 'pending', ?, ?, '[]', 0, ?)`)
      .bind(now, scenario === "expired" ? now - 1 : now + 86_400_000, now)
      .run();
  }
}

export async function observe(database) {
  const jobs = (
    await database
      .prepare(`SELECT owner_id, goal_id, kind, status, due_at, attempts,
      message_id, payload FROM reminder_jobs ORDER BY event_key`)
      .all()
  ).results;
  const rollover = await database
    .prepare(`SELECT
    (SELECT count(*) FROM plan_goals WHERE month = '2026-11') AS goals,
    (SELECT count(*) FROM goal_reminders r JOIN plan_goals g ON g.id = r.goal_id
      WHERE g.month = '2026-11') AS reminders,
    (SELECT count(*) FROM goal_progress_reports r JOIN plan_goals g ON g.id = r.goal_id
      WHERE g.month = '2026-11') AS selections`)
    .first();
  return { jobs, rollover };
}

export function complete(state, input) {
  if (input.scenario === "rollover")
    return Object.values(state.rollover).every((value) => value === input.goals * 2);
  return !state.jobs.some((job) => job.status === "pending" && job.due_at <= input.now);
}

export async function verify(database, input, messages) {
  const state = await observe(database);
  assert.ok(complete(state, input), "Scenario must complete within the bounded runner");
  assert.equal((await database.prepare("PRAGMA foreign_key_check").all()).results.length, 0);
  assert.ok(
    state.jobs.every((job) => job.owner_id === owners[0]),
    "Second owner must stay isolated",
  );
  if (input.scenario === "rollover") {
    assert.equal(messages.length, 0);
    const counts = await database
      .prepare(`SELECT count(*) AS excluded
      FROM goal_progress_reports r JOIN plan_goals g ON g.id = r.goal_id
      WHERE g.month = '2026-11' AND r.included = 0`)
      .first();
    assert.equal(counts.excluded, Math.ceil(input.goals / 5) * 2);
  } else {
    assert.equal(state.jobs.length, 1);
    const job = state.jobs[0];
    const expected =
      input.scenario === "quiet"
        ? "pending"
        : input.scenario === "expired"
          ? "cancelled"
          : input.scenario === "ambiguous"
            ? "unknown"
            : "sent";
    assert.equal(job.status, expected);
    assert.equal(job.attempts, ["quiet", "expired"].includes(input.scenario) ? 0 : 1);
    assert.equal(messages.length, ["quiet", "expired"].includes(input.scenario) ? 0 : 1);
    if (messages.length) assert.equal(messages[0].chat_id, owners[0]);
    if (input.scenario === "quiet") assert.ok(job.due_at > input.now);
  }
  return state;
}
