import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src";
import {
  createPlanningOperations,
  createPlanningUseCases,
  type GoalCreateInput,
} from "../src/modules/planning";
import { carryGoalToMonth } from "../src/modules/planning/domain/month-rollover";
import { D1PlanningRepository } from "../src/modules/planning/infrastructure/d1-planning-repository";
import { createReminderOperations } from "../src/modules/reminders";
import { DEFAULT_SETTINGS } from "../src/modules/reminders/domain/model";
import { D1ReminderRepository } from "../src/modules/reminders/infrastructure/d1-reminder-repository";
import type { ReminderTransport } from "../src/modules/reminders/public-contracts";
import { sha256Base64Url } from "../src/platform/crypto/secure-values";

const OWNER = "c5e7a036-50a6-4c56-90a1-59b3d212b44a";
const OTHER = "613b0ba5-3d76-4f0c-a41d-54e09676de20";
const SEPTEMBER = Date.parse("2026-09-30T12:00:00Z");
const OCTOBER = Date.parse("2026-10-01T04:00:00Z");
const TIME_ZONE = "Asia/Yekaterinburg";
const planning = createPlanningOperations(env.DB);
const useCases = createPlanningUseCases(env.DB);
const repository = new D1PlanningRepository(env.DB);
const reminders = new D1ReminderRepository(env.DB);
const ensure = (now = OCTOBER, ownerId = OWNER, timeZone = TIME_ZONE) =>
  planning.ensureCurrentPlan({ ownerId, now, timeZone });
const create = (month = "2026-09", input: Partial<GoalCreateInput> = {}, ownerId = OWNER) =>
  useCases.createGoal.execute({
    ownerId,
    month,
    now: SEPTEMBER,
    title: "Read",
    description: "Daily reading",
    cadence: { period: "day" },
    tracking: { type: "check" },
    ...input,
  });

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM users"),
    env.DB.prepare("DELETE FROM planning_entry_commands"),
  ]);
  for (const owner of [OWNER, OTHER])
    await env.DB.prepare("INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)")
      .bind(owner, SEPTEMBER, SEPTEMBER)
      .run();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("month rollover in D1", () => {
  it("preserves definitions, group order and old facts; starts the new month with fresh IDs and no facts", async () => {
    const first = await create();
    const second = await create("2026-09", {
      title: "Water",
      tracking: { type: "quantity", targetValue: 1200, comparison: "atLeast", unit: "ml" },
    });
    const weekly = await create("2026-09", {
      title: "Mood",
      tracking: { type: "scale", min: 1, max: 10 },
      cadence: { period: "week", targetOccurrences: 3 },
    });
    const monthly = await create("2026-09", {
      title: "Wake",
      tracking: { type: "time", targetStart: "08:00", targetEnd: "09:30" },
      cadence: { period: "month", targetOccurrences: 20 },
    });
    await useCases.reorderGoals.execute({
      ownerId: OWNER,
      month: "2026-09",
      cadence: "day",
      goalIds: [second.id, first.id],
    });
    await useCases.upsertEntry.execute({
      expectedRevision: null,
      ownerId: OWNER,
      goalId: first.id,
      date: "2026-09-30",
      value: { completed: true, note: "Old fact" },
      now: SEPTEMBER,
      timeZone: TIME_ZONE,
    });
    const deleted = await create("2026-09", { title: "Deleted" });
    await useCases.deleteGoal.execute({ ownerId: OWNER, goalId: deleted.id, now: SEPTEMBER });
    const previous = await planning.list(OWNER, "2026-09");
    await ensure();
    const next = await planning.list(OWNER, "2026-10");
    expect(next.map((goal) => goal.title)).toEqual([
      second.title,
      first.title,
      weekly.title,
      monthly.title,
    ]);
    for (const goal of next) {
      const source = previous.find((item) => item.title === goal.title);
      expect(goal).toMatchObject({
        title: source?.title,
        description: source?.description,
        cadence: source?.cadence,
        tracking: source?.tracking,
        entries: [],
        createdAt: OCTOBER,
        updatedAt: OCTOBER,
      });
      expect(goal.id).not.toBe(source?.id);
    }
    expect(await planning.list(OWNER, "2026-09")).toEqual(previous);
    expect(await planning.list(OTHER, "2026-10")).toEqual([]);
  });

  it("preserves visible order even when old goals have tied sort positions", async () => {
    const first = await create("2026-09", { title: "First" });
    const second = await create("2026-09", { title: "Second" });
    await env.DB.prepare("UPDATE plan_goals SET sort_order = 0, created_at = ? WHERE id = ?")
      .bind(SEPTEMBER + 1, second.id)
      .run();
    await ensure();
    expect((await planning.list(OWNER, "2026-10")).map((goal) => goal.title)).toEqual([
      first.title,
      second.title,
    ]);
  });

  it("seals the destination exactly once under concurrent requests and never resurrects deleted copies", async () => {
    const source = await create();
    const results = await Promise.all(Array.from({ length: 8 }, () => ensure()));
    expect(new Set(results.map((result) => result.carriedGoals[0]?.goalId)).size).toBe(1);
    const [copy] = await planning.list(OWNER, "2026-10");
    expect(copy).toBeDefined();
    if (!copy) throw new Error("Missing copied goal");
    await useCases.deleteGoal.execute({ ownerId: OWNER, goalId: copy.id, now: OCTOBER });
    await useCases.updateGoal.execute({
      ownerId: OWNER,
      goalId: source.id,
      title: "Changed old title",
      now: OCTOBER,
    });
    await ensure();
    expect(await planning.list(OWNER, "2026-10")).toEqual([]);
    expect((await env.DB.prepare("SELECT * FROM plan_month_rollovers").all()).results).toHaveLength(
      1,
    );
  });

  it("preserves a manually planned destination even when all its goals are in trash", async () => {
    await create();
    const manual = await create("2026-10", { title: "Manual" });
    await ensure();
    expect((await planning.list(OWNER, "2026-10")).map((goal) => goal.id)).toEqual([manual.id]);
    await useCases.deleteGoal.execute({ ownerId: OWNER, goalId: manual.id, now: OCTOBER });
    await ensure();
    expect(await planning.list(OWNER, "2026-10")).toEqual([]);
  });

  it.each([
    ["2027-02", 28],
    ["2028-02", 29],
    ["2026-04", 30],
  ] as const)("clamps monthly occurrences in %s", async (month, days) => {
    await create(`${month.slice(0, 4)}-${month.endsWith("02") ? "01" : "03"}`, {
      cadence: { period: "month", targetOccurrences: 31 },
    });
    await ensure(Date.parse(`${month}-01T10:00:00Z`));
    expect((await planning.list(OWNER, month))[0]?.cadence).toEqual({
      period: "month",
      targetOccurrences: days,
    });
  });

  it("catches up from the latest known month without manufacturing skipped history, including December to January", async () => {
    await create();
    await ensure(Date.parse("2026-12-01T10:00:00Z"));
    expect(await planning.list(OWNER, "2026-10")).toEqual([]);
    expect(await planning.list(OWNER, "2026-11")).toEqual([]);
    expect(await planning.list(OWNER, "2026-12")).toHaveLength(1);
    await ensure(Date.parse("2027-01-01T10:00:00Z"));
    expect(await planning.list(OWNER, "2027-01")).toHaveLength(1);
  });

  it("does not fall back to older goals after an empty or completely deleted latest month", async () => {
    await create("2026-08");
    const source = await create();
    await useCases.deleteGoal.execute({ ownerId: OWNER, goalId: source.id, now: SEPTEMBER });
    await ensure();
    expect(await planning.list(OWNER, "2026-10")).toEqual([]);
    await ensure(Date.parse("2026-11-01T10:00:00Z"));
    expect(await planning.list(OWNER, "2026-11")).toEqual([]);
  });

  it("rechecks source definitions, order, deletion and the latest source month before committing", async () => {
    const source = await create("2026-08");
    const state = await repository.rolloverState(OWNER, "2026-10");
    const commit = {
      ownerId: OWNER,
      month: "2026-10",
      now: OCTOBER,
      sourceMonth: state.sourceMonth,
      operationId: crypto.randomUUID(),
      goals: state.goals.map((item) => ({
        sourceGoalId: item.goal.id,
        revision: item.revision,
        sortOrder: item.sortOrder,
        goal: carryGoalToMonth(item.goal, "2026-10", crypto.randomUUID(), OCTOBER),
      })),
    };
    // Same timestamp edits still change the full definition revision.
    await useCases.updateGoal.execute({
      ownerId: OWNER,
      goalId: source.id,
      title: "Edited",
      now: SEPTEMBER,
    });
    expect(await repository.commitRollover(commit)).toBe(false);
    await create("2026-09", { title: "Latest" });
    expect(await repository.commitRollover(commit)).toBe(false);
    await ensure();
    expect((await planning.list(OWNER, "2026-10")).map((goal) => goal.title)).toEqual(["Latest"]);
  });

  it("rolls back the receipt if a goal insert fails, then allows a successful retry", async () => {
    const source = await create();
    const state = await repository.rolloverState(OWNER, "2026-10");
    const item = state.goals[0];
    if (!item) throw new Error("Missing rollover source");
    await expect(
      repository.commitRollover({
        ownerId: OWNER,
        month: "2026-10",
        now: OCTOBER,
        sourceMonth: "2026-09",
        operationId: crypto.randomUUID(),
        goals: [
          {
            sourceGoalId: source.id,
            revision: item.revision,
            sortOrder: item.sortOrder,
            goal: carryGoalToMonth(source, "2026-10", source.id, OCTOBER),
          },
        ],
      }),
    ).rejects.toThrow();
    expect((await repository.rolloverState(OWNER, "2026-10")).initialized).toBe(false);
    await ensure();
    expect(await planning.list(OWNER, "2026-10")).toHaveLength(1);
  });

  it("uses each owner's timezone at the actual month boundary", async () => {
    await create();
    await create("2026-09", {}, OTHER);
    const boundary = Date.parse("2026-09-30T19:00:00Z");
    await ensure(boundary);
    await ensure(boundary, OTHER, "UTC");
    expect(await planning.list(OWNER, "2026-10")).toHaveLength(1);
    expect(await planning.list(OTHER, "2026-10")).toEqual([]);
  });
});

describe("atomic Cron month copy", () => {
  const copy = (now: number) =>
    planning.ensureCurrentPlan({
      ownerId: OWNER,
      now,
      timeZone: TIME_ZONE,
      includeCarriedGoals: false,
    });
  it("matches the domain copy, clamps February and copies once under concurrency", async () => {
    const february = Date.parse("2027-02-01T06:00:00Z");
    const definitions: Partial<GoalCreateInput>[] = [
      { tracking: { type: "check" } },
      {
        tracking: { type: "quantity", comparison: "equal", targetValue: 12, unit: "шт." },
        cadence: { period: "week", targetOccurrences: 4 },
      },
      {
        tracking: { type: "scale", min: 1, max: 10 },
        cadence: { period: "month", targetOccurrences: 31 },
      },
      {
        tracking: { type: "time", targetEnd: "08:30" },
        cadence: { period: "month", targetOccurrences: 29 },
      },
    ];
    for (const [index, definition] of definitions.entries())
      await create("2027-01", { ...definition, title: `Goal ${index}` });
    await create("2027-01", { title: "Other account" }, OTHER);
    const source = await planning.list(OWNER, "2027-01");
    const deleted = await create("2027-01", { title: "Deleted" });
    await useCases.deleteGoal.execute({ ownerId: OWNER, goalId: deleted.id, now: february - 1 });
    await Promise.all(Array.from({ length: 8 }, () => copy(february)));
    const targets = await planning.list(OWNER, "2027-02");
    expect(targets).toHaveLength(4);
    expect(new Set(targets.map((goal) => goal.id)).size).toBe(4);
    for (const [index, target] of targets.entries()) {
      expect(target.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      );
      const original = source[index];
      if (!original) throw new Error("Missing copy source");
      expect(target).toEqual({
        ...carryGoalToMonth(original, "2027-02", target.id, february),
        entries: [],
      });
    }
    expect(await planning.list(OTHER, "2027-02")).toEqual([]);
    expect(await planning.list(OWNER, "2027-01")).toEqual(source);
    const first = targets[0];
    if (!first) throw new Error("Missing copy target");
    await useCases.deleteGoal.execute({ ownerId: OWNER, goalId: first.id, now: february });
    await copy(february + 60_000);
    expect(await planning.list(OWNER, "2027-02")).toHaveLength(3);
  });
  it("preserves a manual destination including trash and an empty previous receipt", async () => {
    await create();
    const manual = await create("2026-10", { title: "Manual" });
    await useCases.deleteGoal.execute({ ownerId: OWNER, goalId: manual.id, now: OCTOBER });
    await copy(OCTOBER);
    expect(await planning.list(OWNER, "2026-10")).toEqual([]);
    await copy(Date.parse("2026-11-01T06:00:00Z"));
    expect(await planning.list(OWNER, "2026-11")).toEqual([]);
  });
  it("rolls back the receipt with a failed copy and can resume next tick", async () => {
    await create();
    await env.DB.prepare(`CREATE TRIGGER fail_cron_copy BEFORE INSERT ON plan_goals WHEN NEW.month = '2026-10'
      BEGIN SELECT RAISE(ABORT, 'test copy failure'); END`).run();
    try {
      await expect(copy(OCTOBER)).rejects.toThrow();
      expect(
        await env.DB.prepare(
          "SELECT count(*) AS n FROM plan_month_rollovers WHERE month = '2026-10'",
        ).first("n"),
      ).toBe(0);
      expect(await planning.list(OWNER, "2026-10")).toEqual([]);
    } finally {
      await env.DB.prepare("DROP TRIGGER fail_cron_copy").run();
    }
    await copy(OCTOBER + 60_000);
    expect(await planning.list(OWNER, "2026-10")).toHaveLength(1);
  });
});

describe("reminder inheritance and scheduled rollover", () => {
  it("bounds Cron inheritance and resumes the remaining rules and report selections next tick", async () => {
    for (let index = 0; index < 30; index++) await create("2026-09", { title: `Goal ${index}` });
    await reminders.saveSettings(
      { ownerId: OWNER, ...DEFAULT_SETTINGS, enabled: true, nextEveningAt: null },
      [],
    );
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO goal_reminders (goal_id, owner_id, mode, time, weekdays)
        SELECT id, owner_id, 'scheduled', '09:00', '[1,2,3,4,5,6,7]' FROM plan_goals WHERE owner_id = ?`).bind(
        OWNER,
      ),
      env.DB.prepare(`INSERT INTO goal_progress_reports SELECT id, owner_id, CASE WHEN sort_order % 5 = 0 THEN 0 ELSE 1 END
        FROM plan_goals WHERE owner_id = ?`).bind(OWNER),
      env.DB.prepare("INSERT INTO telegram_links VALUES (?, '123', '123', 'active')").bind(OWNER),
    ]);
    const transport: ReminderTransport = {
      send: vi.fn(async () => 1),
      edit: vi.fn(async () => {}),
      username: vi.fn(async () => "test"),
    };
    const runner = createReminderOperations(env.DB, transport);
    const counts = () =>
      env.DB.prepare(`SELECT
      (SELECT count(*) FROM goal_reminders r JOIN plan_goals g ON g.id = r.goal_id WHERE g.owner_id = ? AND g.month = '2026-10') AS reminders,
      (SELECT count(*) FROM goal_progress_reports r JOIN plan_goals g ON g.id = r.goal_id WHERE g.owner_id = ? AND g.month = '2026-10') AS selections`)
        .bind(OWNER, OWNER)
        .first();
    await runner.runReminders.execute({ now: OCTOBER, deferNewDelivery: true });
    expect(await counts()).toEqual({ reminders: 0, selections: 0 });
    await runner.runReminders.execute({ now: OCTOBER + 60_000, deferNewDelivery: true });
    expect(await counts()).toEqual({ reminders: 8, selections: 8 });
    await runner.runReminders.execute({ now: OCTOBER + 120_000, deferNewDelivery: true });
    expect(await counts()).toEqual({ reminders: 16, selections: 16 });
    await runner.runReminders.execute({ now: OCTOBER + 180_000, deferNewDelivery: true });
    expect(await counts()).toEqual({ reminders: 24, selections: 24 });
    await runner.runReminders.execute({ now: OCTOBER + 240_000, deferNewDelivery: true });
    expect(await counts()).toEqual({ reminders: 30, selections: 30 });
    expect(transport.send).not.toHaveBeenCalled();
  });
  const prepare = (now = OCTOBER) =>
    createReminderOperations(env.DB, null).prepareCurrentPlan.execute({ ownerId: OWNER, now });
  const configure = async (goalId: string, mode: "scheduled" | "off" | "evening" = "scheduled") =>
    createReminderOperations(env.DB, null).saveGoalReminder.execute({
      ownerId: OWNER,
      goalId,
      now: SEPTEMBER,
      input: { mode, time: "09:00", weekdays: [1, 2, 3, 4, 5, 6, 7] },
    });

  it.each(["scheduled", "off", "evening"] as const)(
    "inherits %s and does not overwrite edits or reset the new schedule on repeat",
    async (mode) => {
      const source = await create();
      await configure(source.id, mode);
      await prepare();
      const [copy] = await planning.list(OWNER, "2026-10");
      if (!copy) throw new Error("Missing copied goal");
      const rule = (await reminders.reminders(OWNER)).find((item) => item.goalId === copy?.id);
      expect(rule).toMatchObject({
        mode,
        time: "09:00",
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        nextRunAt: mode === "scheduled" ? OCTOBER : null,
      });
      await createReminderOperations(env.DB, null).saveGoalReminder.execute({
        ownerId: OWNER,
        goalId: copy.id,
        now: OCTOBER,
        input: { mode: "off", time: "12:00", weekdays: [1] },
      });
      await prepare();
      expect(
        (await reminders.reminders(OWNER)).find((item) => item.goalId === copy?.id),
      ).toMatchObject({ mode: "off", time: "12:00", weekdays: [1], nextRunAt: null });
    },
  );

  it("repairs incomplete reminder inheritance, even after a second month transition", async () => {
    const source = await create();
    await configure(source.id);
    await ensure(); // Simulate an interruption after planning's transaction.
    const november = Date.parse("2026-11-01T04:00:00Z");
    await prepare(november);
    const [copy] = await planning.list(OWNER, "2026-11");
    expect(
      (await reminders.reminders(OWNER)).find((item) => item.goalId === copy?.id),
    ).toMatchObject({ mode: "scheduled", time: "09:00" });
  });

  it("stages a new month's copy and bulk rule inheritance before scheduling delivery", async () => {
    const source = await create();
    const second = await create();
    await configure(source.id);
    await configure(second.id);
    await reminders.saveSettings(
      { ownerId: OWNER, ...DEFAULT_SETTINGS, enabled: true, nextEveningAt: null },
      await reminders.reminders(OWNER),
    );
    await env.DB.prepare("INSERT INTO telegram_links VALUES (?, '123', '123', 'active')")
      .bind(OWNER)
      .run();
    const transport: ReminderTransport = {
      send: vi.fn(async () => 1),
      edit: vi.fn(async () => {}),
      username: vi.fn(async () => "test"),
    };
    const runner = createReminderOperations(env.DB, transport);
    await runner.runReminders.execute({ now: OCTOBER, deferNewDelivery: true });
    const copies = await planning.list(OWNER, "2026-10");
    expect(copies).toHaveLength(2);
    expect(
      (await reminders.reminders(OWNER)).filter((rule) =>
        copies.some((copy) => copy.id === rule.goalId),
      ),
    ).toHaveLength(0);
    await runner.runReminders.execute({ now: OCTOBER + 60_000, deferNewDelivery: true });
    expect(
      (await reminders.reminders(OWNER)).filter((rule) =>
        copies.some((copy) => copy.id === rule.goalId),
      ),
    ).toHaveLength(2);
    expect(transport.send).not.toHaveBeenCalled();
    await runner.runReminders.execute({ now: OCTOBER + 120_000, deferNewDelivery: true });
    expect(await reminders.due(OCTOBER + 120_000)).toHaveLength(1);
    await runner.runReminders.execute({ now: OCTOBER + 180_000, deferNewDelivery: true });
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it("repairs a committed but incomplete rollover through Cron on the next tick", async () => {
    const source = await create();
    await configure(source.id);
    await reminders.saveSettings(
      { ownerId: OWNER, ...DEFAULT_SETTINGS, enabled: true, nextEveningAt: null },
      await reminders.reminders(OWNER),
    );
    await env.DB.prepare("INSERT INTO telegram_links VALUES (?, '123', '123', 'active')")
      .bind(OWNER)
      .run();
    await ensure();
    const [copy] = await planning.list(OWNER, "2026-10");
    expect((await reminders.reminders(OWNER)).some((item) => item.goalId === copy?.id)).toBe(false);
    const transport: ReminderTransport = {
      send: vi.fn(async () => 1),
      edit: vi.fn(async () => {}),
      username: vi.fn(async () => "test"),
    };
    await createReminderOperations(env.DB, transport).runReminders.execute({ now: OCTOBER });
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect((await reminders.reminders(OWNER)).find((item) => item.goalId === copy?.id)?.mode).toBe(
      "scheduled",
    );
  });

  it("prepares report-only owners even when no general reminder settings exist", async () => {
    const source = await create();
    await env.DB.prepare("INSERT INTO telegram_links VALUES (?, '123', '123', 'active')")
      .bind(OWNER)
      .run();
    await env.DB.prepare(
      "INSERT INTO progress_report_settings (owner_id, enabled, next_wednesday_at, next_sunday_at) VALUES (?, 1, ?, ?)",
    )
      .bind(OWNER, OCTOBER + 86400000, OCTOBER + 2 * 86400000)
      .run();
    await env.DB.prepare("INSERT INTO goal_progress_reports VALUES (?, ?, 1)")
      .bind(source.id, OWNER)
      .run();
    const transport: ReminderTransport = {
      send: vi.fn(async () => 1),
      edit: vi.fn(async () => {}),
      username: vi.fn(async () => "test"),
    };
    await createReminderOperations(env.DB, transport).runReminders.execute({ now: OCTOBER });
    const [copy] = await planning.list(OWNER, "2026-10");
    expect(copy?.title).toBe(source.title);
    expect(
      await env.DB.prepare("SELECT included FROM goal_progress_reports WHERE goal_id = ?")
        .bind(copy?.id)
        .first("included"),
    ).toBe(1);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("initializes through Cron without a browser and sends only new-month goals exactly once", async () => {
    const source = await create();
    await configure(source.id);
    await reminders.saveSettings(
      { ownerId: OWNER, ...DEFAULT_SETTINGS, enabled: true, nextEveningAt: null },
      await reminders.reminders(OWNER),
    );
    await env.DB.prepare(
      "INSERT INTO telegram_links (owner_id, chat_id, telegram_user_id, status) VALUES (?, '123', '123', 'active')",
    )
      .bind(OWNER)
      .run();
    const transport: ReminderTransport = {
      send: vi.fn(async () => 1),
      edit: vi.fn(async () => {}),
      username: vi.fn(async () => "test"),
    };
    const operations = createReminderOperations(env.DB, transport);
    await Promise.all([
      operations.runReminders.execute({ now: OCTOBER }),
      operations.runReminders.execute({ now: OCTOBER }),
    ]);
    expect(transport.send).toHaveBeenCalledTimes(1);
    const [copy] = await planning.list(OWNER, "2026-10");
    const jobs = await env.DB.prepare("SELECT goal_id, local_date FROM reminder_jobs").all<{
      goal_id: string;
      local_date: string;
    }>();
    expect(jobs.results).toEqual([{ goal_id: copy?.id, local_date: "2026-10-01" }]);
    await operations.runReminders.execute({ now: OCTOBER + 60_000 });
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
});

describe("authenticated plan reads", () => {
  it("materializes only the owner's current month; future and historical reads stay read-only", async () => {
    await create();
    const token = "test-month-rollover-session";
    await env.DB.prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
      .bind(await sha256Base64Url(token), OWNER, SEPTEMBER, OCTOBER + 86400000)
      .run();
    const origin = "https://app.getplanner.workers.dev";
    const bindings = {
      ...env,
      APP_ORIGIN: origin,
      AUTH_MODE: "telegram",
      AUTH_SUCCESS_REDIRECT_URL: `${origin}/`,
      AUTH_FLOW_SECRET: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      TELEGRAM_OIDC_CLIENT_ID: "123456789",
      TELEGRAM_OIDC_CLIENT_SECRET: "test-only-secret",
      TELEGRAM_BOT_MODE: "disabled",
    } as CloudflareBindings;
    vi.setSystemTime(new Date(OCTOBER));
    const app = createApp();
    const read = (month: string, authenticated = true) =>
      app.request(
        `${origin}/api/plans/${month}`,
        { headers: authenticated ? { Cookie: `__Host-session=${token}` } : {} },
        bindings,
      );
    expect((await read("2026-10", false)).status).toBe(401);
    expect((await read("2026-09")).status).toBe(200);
    expect((await read("2026-11")).status).toBe(200);
    expect((await env.DB.prepare("SELECT * FROM plan_month_rollovers").all()).results).toEqual([]);
    const result = await read("2026-10");
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      month: "2026-10",
      goals: [expect.objectContaining({ title: "Read", entries: [] })],
    });
    expect(await planning.list(OTHER, "2026-10")).toEqual([]);
  });
});
