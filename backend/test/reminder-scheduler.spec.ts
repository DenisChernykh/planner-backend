import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import runtime from "../src";
import { createPlanningOperations, createPlanningUseCases } from "../src/modules/planning";
import { createReminderOperations } from "../src/modules/reminders";
import { DEFAULT_SETTINGS } from "../src/modules/reminders/domain/model";
import { createReminderTransport } from "../src/modules/telegram-bot";
import { configureReminderScheduler } from "./reminder-runtime";

const NOW = Date.parse("2030-10-02T06:01:00Z");
const OWNER = "scheduler-owner";
const TOKEN = "123:scheduler-local-only";
const bindings = {
  ...env,
  TELEGRAM_BOT_MODE: "webhook",
  TELEGRAM_BOT_TOKEN: TOKEN,
  APP_ORIGIN: "http://localhost:8787",
} as CloudflareBindings;
const stub = () => env.REMINDER_SCHEDULER.getByName("scheduler-test");
const alarmAt = () => runInDurableObject(stub(), (_instance, state) => state.storage.getAlarm());

beforeEach(async () => {
  vi.setSystemTime(NOW);
  await env.DB.prepare("DELETE FROM users").run();
  await runInDurableObject(stub(), async (_instance, state) => {
    await state.storage.deleteAlarm();
    await state.storage.deleteAll();
  });
  await configureReminderScheduler(bindings, "scheduler-test");
});
afterEach(async () => {
  await runInDurableObject(stub(), async (_instance, state) => {
    await state.storage.deleteAlarm();
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function plan(goals: number) {
  await env.DB.prepare("INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)")
    .bind(OWNER, NOW, NOW)
    .run();
  await env.DB.prepare("INSERT INTO telegram_links VALUES (?, '123', '123', 'active')")
    .bind(OWNER)
    .run();
  const planning = createPlanningOperations(env.DB);
  const operations = createReminderOperations(env.DB, null);
  for (let index = 0; index < goals; index++) {
    // Use the public planning API for owner-scoped definitions.
    const created = await createPlanningUseCases(env.DB).createGoal.execute({
      ownerId: OWNER,
      month: "2030-10",
      title: `Goal ${index}`,
      tracking: { type: "check" },
      cadence: { period: "day" },
      now: NOW - 1000,
    });
    await operations.saveGoalReminder.execute({
      ownerId: OWNER,
      goalId: created.id,
      input: { mode: "scheduled", time: "11:01", weekdays: [1, 2, 3, 4, 5, 6, 7] },
      now: NOW - 1000,
    });
  }
  await operations.saveSettings.execute({
    ownerId: OWNER,
    now: NOW - 1000,
    input: { ...DEFAULT_SETTINGS, enabled: true, eveningTime: "21:00" },
  });
  expect(await planning.list(OWNER, "2030-10")).toHaveLength(goals);
}

describe("Durable reminder scheduler", () => {
  it("Cron only wakes the executor and does not inspect D1 or call Telegram", async () => {
    const wake = vi.fn(async () => {});
    const getByName = vi.fn(() => ({ wake }));
    const fetch = vi.fn(() => {
      throw new Error("Unexpected network");
    });
    vi.stubGlobal("fetch", fetch);
    const prepare = vi.spyOn(env.DB, "prepare");
    await runtime.scheduled({ cron: "* * * * *", scheduledTime: NOW, noRetry() {} }, {
      ...bindings,
      REMINDER_SCHEDULER: { getByName },
    } as unknown as CloudflareBindings);
    expect(getByName).toHaveBeenCalledWith("reminders");
    expect(wake).toHaveBeenCalledOnce();
    expect(prepare).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not postpone a persisted alarm across concurrent wakes or object eviction", async () => {
    await Promise.all([stub().wake(), stub().wake()]);
    expect(await alarmAt()).toBe(NOW);
    vi.setSystemTime(NOW + 30_000);
    await evictDurableObject(stub());
    await configureReminderScheduler(bindings, "scheduler-test");
    await stub().wake();
    expect(await alarmAt()).toBe(NOW);
  });

  it("retains a recovery alarm and rate-limits maintenance to one successful run per hour", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("Unexpected network");
      }),
    );
    await stub().wake();
    expect(await runDurableObjectAlarm(stub())).toBe(true);
    expect(await alarmAt()).toBe(NOW + 60_000);
    expect(
      await runInDurableObject(stub(), (_instance, state) => state.storage.get("maintenanceHour")),
    ).toBe(Math.floor(NOW / 3_600_000));
    await env.DB.prepare("INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)")
      .bind(OWNER, NOW, NOW)
      .run();
    await env.DB.prepare("INSERT INTO telegram_link_tokens VALUES ('expired-fixture', ?, ?)")
      .bind(OWNER, NOW - 1)
      .run();
    await runDurableObjectAlarm(stub());
    expect(await env.DB.prepare("SELECT count(*) AS n FROM telegram_link_tokens").first("n")).toBe(
      1,
    );
    vi.setSystemTime(NOW + 3_600_000);
    await runDurableObjectAlarm(stub());
    expect(await env.DB.prepare("SELECT count(*) AS n FROM telegram_link_tokens").first("n")).toBe(
      0,
    );
  });

  it("continues a delivery backlog in one second and never sends a completed event twice", async () => {
    await plan(24);
    const send = vi.fn(async () => Response.json({ ok: true, result: { message_id: 1 } }));
    vi.stubGlobal("fetch", send);
    await stub().wake();
    await runDurableObjectAlarm(stub());
    expect(send).toHaveBeenCalledTimes(20);
    expect(await alarmAt()).toBe(NOW + 1000);
    await evictDurableObject(stub());
    await configureReminderScheduler(bindings, "scheduler-test");
    await runDurableObjectAlarm(stub());
    expect(send).toHaveBeenCalledTimes(24);
    await runDurableObjectAlarm(stub());
    expect(send).toHaveBeenCalledTimes(24);
    expect(await alarmAt()).toBe(NOW + 60_000);
  }, 15_000);

  it("builds and sends a whole weekly report in one alarm with questions disabled", async () => {
    await plan(1);
    const operations = createReminderOperations(env.DB, createReminderTransport(TOKEN));
    await operations.saveSettings.execute({
      ownerId: OWNER,
      now: NOW - 1000,
      input: { ...DEFAULT_SETTINGS, enabled: false },
    });
    const [goal] = await createPlanningOperations(env.DB).list(OWNER, "2030-10");
    if (!goal) throw new Error("Missing fixture goal");
    await createPlanningUseCases(env.DB).upsertEntry.execute({
      ownerId: OWNER,
      goalId: goal.id,
      date: "2030-10-01",
      value: { completed: true },
      expectedRevision: null,
      now: NOW - 1000,
    });
    await operations.reports.save({
      ownerId: OWNER,
      now: NOW - 1000,
      input: {
        month: "2030-10",
        enabled: true,
        wednesdayTime: "11:01",
        sundayTime: "21:00",
        startsOn: null,
        goals: [{ goalId: goal.id, included: true }],
      },
    });
    const send = vi.fn(async () => Response.json({ ok: true, result: { message_id: 10 } }));
    vi.stubGlobal("fetch", send);
    await stub().wake();
    await runDurableObjectAlarm(stub());
    expect(send).toHaveBeenCalledOnce();
    const job = await env.DB.prepare(
      "SELECT kind, status, attempts, payload FROM reminder_jobs",
    ).first<{ kind: string; status: string; attempts: number; payload: string }>();
    expect(job).toMatchObject({ kind: "weekly-progress", status: "sent", attempts: 1 });
    expect(JSON.parse(job?.payload ?? "{}")).toMatchObject({
      version: 1,
      message: { text: expect.stringContaining("Goal 0") },
    });
    await runDurableObjectAlarm(stub());
    expect(send).toHaveBeenCalledOnce();
  });

  it("keeps retry/recovery state durable after a D1 outage without logging secrets", async () => {
    const secret = "must-not-appear-in-error";
    const batch = vi.spyOn(env.DB, "batch").mockRejectedValueOnce(new Error(secret));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await stub().wake();
    await expect(runDurableObjectAlarm(stub())).rejects.toThrow("Reminder alarm failed");
    expect(await alarmAt()).toBe(NOW + 60_000);
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    batch.mockRestore();
    await evictDurableObject(stub());
    await configureReminderScheduler(bindings, "scheduler-test");
    await runDurableObjectAlarm(stub());
    expect(await alarmAt()).toBe(NOW + 60_000);
  }, 15_000);
});
