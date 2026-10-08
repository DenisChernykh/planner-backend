import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src";
import { createPlanningOperations, createPlanningUseCases } from "../src/modules/planning";
import { D1PlanningRepository } from "../src/modules/planning/infrastructure/d1-planning-repository";
import { SaveGoalReminderUseCase } from "../src/modules/reminders/application/settings/save-goal-reminder.use-case";
import { SaveReminderSettingsUseCase } from "../src/modules/reminders/application/settings/save-reminder-settings.use-case";
import { DEFAULT_SETTINGS } from "../src/modules/reminders/domain/model";
import { nextOccurrence } from "../src/modules/reminders/domain/schedule";
import { D1ReminderRepository } from "../src/modules/reminders/infrastructure/d1-reminder-repository";

const origin = "http://localhost:8787";
const now = Date.parse("2026-10-08T05:00:00Z");
const bindings = {
  ...env,
  APP_ORIGIN: origin,
  AUTH_MODE: "development",
  AUTH_SUCCESS_REDIRECT_URL: `${origin}/`,
  TELEGRAM_BOT_MODE: "disabled",
  BUILD_REVISION: "local",
} as unknown as CloudflareBindings;
const app = createApp();
let ownerId: string;
const planning = createPlanningOperations(env.DB);
const useCases = createPlanningUseCases(env.DB);
const repository = new D1ReminderRepository(env.DB);
const settings = new SaveReminderSettingsUseCase(repository);
const rules = new SaveGoalReminderUseCase(repository, planning);

async function request(path: string, method = "GET", body?: unknown) {
  return app.request(
    `${origin}${path}`,
    {
      method,
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    bindings,
  );
}
async function goal(type: "time" | "check" = "time") {
  return useCases.createGoal.execute({
    ownerId,
    month: "2026-10",
    now,
    title: "Сон",
    tracking: type === "time" ? { type, targetStart: "07:00", targetEnd: "09:00" } : { type },
    cadence: { period: "day" },
  });
}
beforeEach(async () => {
  vi.useRealTimers();
  await env.DB.prepare("DELETE FROM users").run();
  const response = await request("/api/auth/me");
  ownerId = ((await response.json()) as { user: { id: string } }).user.id;
});

describe("entry revision conflicts", () => {
  it("preserves Telegram's 07:40 when a stale website saves its note or deletes the entry", async () => {
    const created = await goal();
    const path = `/api/goals/${created.id}/entries/2026-10-07`;
    const first = await request(path, "PUT", {
      value: "07:00",
      note: "original",
      expectedRevision: null,
    });
    expect(first.status).toBe(200);
    const base = ((await first.json()) as { entry: { revision: string } }).entry;
    expect(
      await planning.recordAnswer({
        ownerId,
        goalId: created.id,
        date: "2026-10-07",
        value: { value: "07:40" },
        expectedRevision: base.revision,
        operationId: "telegram:revision-test",
        now,
        timeZone: "Asia/Yekaterinburg",
      }),
    ).toBe("saved");
    const stale = await request(path, "PUT", {
      value: "07:00",
      note: "my draft",
      expectedRevision: base.revision,
    });
    expect(stale.status).toBe(409);
    expect((await request(`${path}?expectedRevision=${base.revision}`, "DELETE")).status).toBe(409);
    const latest = await planning.entry(ownerId, created.id, "2026-10-07");
    expect(latest?.entry).toMatchObject({ value: "07:40", note: "original" });
    const merge = await request(path, "PUT", {
      value: "07:40",
      note: "my draft",
      expectedRevision: latest?.revision,
    });
    expect(merge.status).toBe(200);
    expect((await planning.entry(ownerId, created.id, "2026-10-07"))?.entry).toMatchObject({
      value: "07:40",
      note: "my draft",
    });
  });
  it("requires a revision and rejects stale create, delete and recreate operations", async () => {
    const created = await goal("check");
    const path = `/api/goals/${created.id}/entries/2026-10-07`;
    expect((await request(path, "PUT", { completed: true })).status).toBe(400);
    const first = await request(path, "PUT", { completed: true, expectedRevision: null });
    const { entry } = (await first.json()) as { entry: { revision: string } };
    expect((await request(path, "PUT", { completed: false, expectedRevision: null })).status).toBe(
      409,
    );
    expect((await request(`${path}?expectedRevision=${entry.revision}`, "DELETE")).status).toBe(
      204,
    );
    expect(
      (await request(path, "PUT", { completed: false, expectedRevision: entry.revision })).status,
    ).toBe(409);
    expect(await planning.entry(ownerId, created.id, "2026-10-07")).toBeNull();
    expect((await request(path, "PUT", { completed: false, expectedRevision: null })).status).toBe(
      200,
    );
    expect((await request(`${path}?expectedRevision=${entry.revision}`, "DELETE")).status).toBe(
      409,
    );
  });
});

describe("schedule snapshot writes", () => {
  it("recalculates after a goal schedule changes between settings reads and commit", async () => {
    const created = await goal();
    await settings.execute({ ownerId, input: { ...DEFAULT_SETTINGS, enabled: true }, now });
    await rules.execute({
      ownerId,
      goalId: created.id,
      input: { mode: "scheduled", time: "09:00", weekdays: [4] },
      now,
    });
    const original = repository.saveSettings.bind(repository);
    let interrupted = false;
    const spy = vi.spyOn(repository, "saveSettings").mockImplementation(async (...args) => {
      if (!interrupted) {
        interrupted = true;
        await rules.execute({
          ownerId,
          goalId: created.id,
          input: { mode: "scheduled", time: "12:00", weekdays: [5] },
          now,
        });
      }
      return original(...args);
    });
    await settings.execute({
      ownerId,
      input: { ...DEFAULT_SETTINGS, enabled: true, timeZone: "Europe/Berlin" },
      now,
    });
    expect(spy).toHaveBeenCalledTimes(2);
    const [rule] = await repository.reminders(ownerId);
    expect(rule).toMatchObject({
      time: "12:00",
      weekdays: [5],
      nextRunAt: nextOccurrence(now, "Europe/Berlin", "12:00", [5]),
    });
    spy.mockRestore();
  });
  it("rejects a stale timezone write and a Cron advance based on the old schedule", async () => {
    const created = await goal();
    await settings.execute({ ownerId, input: { ...DEFAULT_SETTINGS, enabled: true }, now });
    await rules.execute({
      ownerId,
      goalId: created.id,
      input: { mode: "scheduled", time: "09:00", weekdays: [1, 2, 3, 4, 5, 6, 7] },
      now,
    });
    const staleSettings = await repository.settings(ownerId);
    const [staleRule] = await repository.reminders(ownerId);
    if (!staleRule) throw new Error("Missing test reminder");
    await settings.execute({
      ownerId,
      input: { ...DEFAULT_SETTINGS, enabled: true, timeZone: "Europe/Berlin" },
      now,
    });
    expect(
      await repository.saveReminder(
        {
          ...staleRule,
          time: "10:00",
          nextRunAt: nextOccurrence(now, staleSettings.timeZone, "10:00"),
        },
        staleSettings,
      ),
    ).toBe(false);
    await repository.advanceGoal(
      { ...staleRule, nextRunAt: now + 1 },
      staleRule.nextRunAt as number,
      null,
      staleSettings,
    );
    expect((await repository.reminders(ownerId))[0]).toMatchObject({
      time: "09:00",
      nextRunAt: nextOccurrence(now, "Europe/Berlin", "09:00"),
    });
  });
});

describe("bounded indexed retention", () => {
  it("uses retention indexes on accumulated history and preserves lifetime receipts", async () => {
    const created = await goal();
    await env.DB.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x < 3600)
      INSERT INTO reminder_jobs (id, event_key, owner_id, local_date, kind, status, due_at, expires_at, payload, attempts, created_at)
      SELECT 'retention-'||x, 'retention-'||x, ?, '2026-10-07', 'digest', 'sent', ?, ?, '[]', 1, ? FROM n`)
      .bind(ownerId, now, now, now)
      .run();
    await env.DB.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x < 3600)
      INSERT INTO planning_entry_commands (id, result, created_at, goal_id) SELECT 'receipt-'||x, 'saved', ?, NULL FROM n`)
      .bind(now)
      .run();
    for (const [table, filter, index] of [
      ["reminder_jobs", "created_at < ?", "reminder_jobs_retention_idx"],
      [
        "planning_entry_commands",
        "goal_id IS NULL AND created_at < ?",
        "planning_entry_commands_retention_idx",
      ],
    ]) {
      const hint = table === "planning_entry_commands" ? ` INDEXED BY ${index}` : "";
      const sql = `SELECT id FROM ${table}${hint} WHERE ${filter} ORDER BY created_at LIMIT 25`;
      const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .bind(now - 90 * 86_400_000)
        .all();
      expect(JSON.stringify(plan.results)).toContain(index);
      const result = await env.DB.prepare(sql)
        .bind(now - 90 * 86_400_000)
        .all();
      expect(result.meta.rows_read).toBeLessThan(10);
    }
    await env.DB.prepare(
      "INSERT INTO planning_entry_commands (id, result, created_at, goal_id) VALUES ('lifetime', 'saved', 0, ?)",
    )
      .bind(created.id)
      .run();
    await new D1PlanningRepository(env.DB).pruneEntryCommands(now);
    expect(
      await env.DB.prepare("SELECT id FROM planning_entry_commands WHERE id = 'lifetime'").first(),
    ).not.toBeNull();
  });
});
