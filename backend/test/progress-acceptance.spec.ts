import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src";
import { createPlanningOperations } from "../src/modules/planning";
import { CreateGoalUseCase } from "../src/modules/planning/application/goals/create-goal.use-case";
import { UpdateGoalUseCase } from "../src/modules/planning/application/goals/update-goal.use-case";
import type { GoalTracking } from "../src/modules/planning/domain/model";
import { D1PlanningRepository } from "../src/modules/planning/infrastructure/d1-planning-repository";
import { createProgressOperations } from "../src/modules/progress";
import { createReminderOperations } from "../src/modules/reminders";
import { DEFAULT_SETTINGS } from "../src/modules/reminders/domain/model";
import type { ReportInput } from "../src/modules/reminders/domain/progress-reports";
import { D1ProgressReportRepository } from "../src/modules/reminders/infrastructure/d1-progress-report-repository";
import { D1ReminderRepository } from "../src/modules/reminders/infrastructure/d1-reminder-repository";
import { DeliveryError, type ReminderTransport } from "../src/modules/reminders/public-contracts";
import { messageOptions } from "../src/modules/telegram-bot/infrastructure/reminder-transport";
import { sha256Base64Url } from "../src/platform/crypto/secure-values";

const OWNER = "c5e7a036-50a6-4c56-90a1-59b3d212b44a",
  OTHER = "cdbe1eba-d2d5-4db3-b636-1b3237756f1a";
const NOW = Date.parse("2026-10-07T16:00:00Z"),
  ORIGIN = "https://planner.example";
const planning = new D1PlanningRepository(env.DB),
  reminders = new D1ReminderRepository(env.DB);
const reports = new D1ProgressReportRepository(env.DB),
  progress = createProgressOperations(env.DB);
const rule: GoalTracking = {
  type: "quantity",
  comparison: "atLeast",
  targetValue: 20,
  unit: "страниц",
};
let transport: ReminderTransport, goalId: string;
const operations = () => createReminderOperations(env.DB, transport, ORIGIN);
const input = (changes: Partial<ReportInput> = {}): ReportInput => ({
  month: "2026-10",
  enabled: true,
  wednesdayTime: "21:00",
  sundayTime: "21:00",
  startsOn: "2026-10-06",
  goals: [{ goalId, included: true }],
  ...changes,
});
const create = (title: string, ownerId = OWNER, month = "2026-10", tracking: GoalTracking = rule) =>
  new CreateGoalUseCase(planning).execute({
    ownerId,
    month,
    title,
    tracking,
    cadence: { period: "day" },
    now: NOW,
  });
const fact = async (id: string, date: string, value: number, now = NOW) =>
  planning.upsertEntry(
    {
      goalId: id,
      date,
      value,
      met: value >= 20,
      note: "preserve note",
      createdAt: now,
      updatedAt: now,
    },
    (await planning.entrySnapshot(OWNER, id, date))?.revision ?? null,
  );
const save = (changes: Partial<ReportInput> = {}, now = NOW - 60000) =>
  operations().reports.save({ ownerId: OWNER, input: input(changes), now });
const rows = () =>
  env.DB.prepare(
    "SELECT * FROM reminder_jobs WHERE kind = 'weekly-progress' ORDER BY created_at",
  ).all<{ id: string; status: string; payload: string; due_at: number; attempts: number }>();
const overview = (now = NOW, zone = "Asia/Yekaterinburg") =>
  progress.overview({
    ownerId: OWNER,
    period: "week",
    anchor: "2026-10-07",
    today: "2026-10-07",
    now,
    timeZone: zone,
  });
const bindings = () =>
  ({
    ...env,
    AUTH_MODE: "telegram",
    APP_ORIGIN: ORIGIN,
    AUTH_SUCCESS_REDIRECT_URL: `${ORIGIN}/`,
    BUILD_REVISION: "test",
    TELEGRAM_BOT_MODE: "disabled",
    TELEGRAM_OIDC_CLIENT_ID: "123",
    TELEGRAM_OIDC_CLIENT_SECRET: "test-only",
    AUTH_FLOW_SECRET: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  }) as unknown as CloudflareBindings;
async function http(
  path: string,
  method = "GET",
  body?: unknown,
  authenticated = true,
  origin = ORIGIN,
) {
  return createApp().request(
    `${ORIGIN}${path}`,
    {
      method,
      headers: {
        ...(authenticated ? { Cookie: "__Host-session=acceptance-local-session" } : {}),
        ...(method === "GET" ? {} : { Origin: origin, "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    bindings(),
  );
}

beforeEach(async () => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  await env.DB.prepare("DELETE FROM users").run();
  for (const id of [OWNER, OTHER])
    await env.DB.prepare("INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)")
      .bind(id, NOW, NOW)
      .run();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(await sha256Base64Url("acceptance-local-session"), OWNER, NOW, NOW + 86400000)
    .run();
  await env.DB.prepare(
    "INSERT INTO telegram_links (owner_id, chat_id, telegram_user_id, status) VALUES (?, '123', '123', 'active')",
  )
    .bind(OWNER)
    .run();
  await reminders.saveSettings(
    { ...DEFAULT_SETTINGS, ownerId: OWNER, enabled: false, nextEveningAt: null },
    [],
  );
  goalId = (await create("Любое название <b> & * _")).id;
  await fact(goalId, "2026-10-05", 100);
  await fact(goalId, "2026-10-06", 25);
  await fact(goalId, "2026-10-07", 30);
  transport = {
    send: vi.fn(async () => 10),
    edit: vi.fn(async () => {}),
    username: vi.fn(async () => "fake_bot"),
  };
});
afterEach(() => vi.restoreAllMocks());

describe("shared start date acceptance", () => {
  it("changes one saved date through both HTTP forms and restores history for all consumers", async () => {
    for (const [date, days, sum] of [
      ["2026-10-06", 2, 55],
      ["2026-10-07", 1, 30],
      [null, 3, 155],
    ] as const) {
      const response =
        date === "2026-10-07"
          ? await http(
              "/api/reminders/progress-reports",
              "PUT",
              input({ enabled: false, startsOn: date }),
            )
          : await http("/api/progress/settings", "PUT", { startsOn: date });
      expect(response.status).toBe(200);
      expect((await overview()).goals[0]).toMatchObject({ eligibleDays: days, sum });
      const state = await operations().reports.get({ ownerId: OWNER, month: "2026-10", now: NOW });
      expect(state.startsOn).toBe(date);
      const preview = await operations().reports.preview({
        ownerId: OWNER,
        input: input({ startsOn: state.startsOn }),
        slot: "wed",
        now: NOW,
      });
      expect(preview.overview.goals[0]?.sum).toBe(sum);
      expect(preview.overview.goals[0]?.targets[0]?.target).toBe(days);
    }
  });
  it("preserves facts, civil dates, notes, questions and digests when the start changes", async () => {
    const before = await planning.listEntries(goalId);
    const { createReminderJob } = await import("../src/modules/reminders/domain/jobs");
    for (const kind of ["question", "digest"] as const)
      await reminders.enqueue(
        createReminderJob({
          id: crypto.randomUUID(),
          ownerId: OWNER,
          goalId: kind === "question" ? goalId : null,
          date: "2026-10-07",
          kind,
          eventKey: kind,
          now: NOW,
        }),
      );
    const jobs = (await env.DB.prepare("SELECT * FROM reminder_jobs ORDER BY id").all()).results;
    await http("/api/progress/settings", "PUT", { startsOn: "2026-10-07" });
    expect(await planning.listEntries(goalId)).toEqual(before);
    expect((await env.DB.prepare("SELECT * FROM reminder_jobs ORDER BY id").all()).results).toEqual(
      jobs,
    );
    expect(await createPlanningOperations(env.DB).list(OWNER, "2026-10")).toHaveLength(1);
  });
  it("preserves local dates and a sent slot after changing the account timezone", async () => {
    await save();
    await operations().runReminders.execute({ now: NOW });
    const before = await planning.listEntries(goalId),
      shared = await progress.settings(OWNER);
    await operations().saveSettings.execute({
      ownerId: OWNER,
      input: { ...DEFAULT_SETTINGS, timeZone: "Europe/Moscow" },
      now: NOW + 1000,
    });
    await operations().runReminders.execute({ now: NOW + 2 * 3600000 });
    expect(await planning.listEntries(goalId)).toEqual(before);
    expect(await progress.settings(OWNER)).toEqual(shared);
    expect(transport.send).toHaveBeenCalledTimes(1);
    const snapshot = JSON.parse((await rows()).results[0]?.payload ?? "{}");
    expect(snapshot.period).toEqual({ from: "2026-10-05", to: "2026-10-11" });
  });
  it("edits only one carried monthly version and recalculates its cadence and criterion", async () => {
    const next = await create("Следующая версия", OWNER, "2026-11");
    await env.DB.prepare("UPDATE plan_goals SET carried_from_goal_id = ? WHERE id = ?")
      .bind(goalId, next.id)
      .run();
    await fact(next.id, "2026-11-01", 25);
    const otherBefore = await planning.listEntries(next.id);
    await new UpdateGoalUseCase(planning).execute({
      ownerId: OWNER,
      goalId,
      tracking: { ...rule, targetValue: 30 },
      cadence: { period: "week", targetOccurrences: 3 },
      now: NOW + 1,
    });
    expect((await planning.listEntries(goalId)).map((entry) => entry.met)).toEqual([
      true,
      false,
      true,
    ]);
    expect(await planning.listEntries(next.id)).toEqual(otherBefore);
    expect((await overview()).goals[0]?.targets[0]).toMatchObject({ value: 2, target: 3 });
  });
});

describe("selection, formatting and atomic persistence acceptance", () => {
  it("selects exactly two of five for preview and Cron while web retains five and manual additions stay excluded", async () => {
    const ids = [goalId];
    for (let index = 1; index < 5; index++) ids.push((await create(`Цель ${index}`)).id);
    await fact(ids[2] as string, "2026-10-06", 20);
    const choices = ids.map((id, index) => ({ goalId: id, included: index === 0 || index === 2 }));
    await save({ goals: choices });
    const preview = await operations().reports.preview({
      ownerId: OWNER,
      input: input({ goals: choices }),
      slot: "wed",
      now: NOW,
    });
    expect(preview.overview.goals.map((goal) => goal.id).sort()).toEqual([ids[0], ids[2]].sort());
    expect((await overview()).goals).toHaveLength(5);
    await operations().runReminders.execute({ now: NOW });
    const sent = vi.mocked(transport.send).mock.calls[0]?.[1];
    expect(sent?.blocks?.filter((block) => block.kind === "goal")).toHaveLength(2);
    const manual = await create("Новая ручная цель");
    expect(
      (await operations().reports.get({ ownerId: OWNER, month: "2026-10", now: NOW })).goals.find(
        (goal) => goal.goalId === manual.id,
      )?.included,
    ).toBe(false);
    await save(
      { enabled: false, goals: choices.map((choice) => ({ ...choice, included: false })) },
      NOW + 1000,
    );
    await operations().runReminders.execute({ now: NOW + 4 * 86400000 });
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
  it("uses safe HTML, literal user text and the same complete blocks in preview and transport", async () => {
    await save();
    const preview = await operations().reports.preview({
      ownerId: OWNER,
      input: input(),
      slot: "wed",
      now: NOW,
    });
    await operations().runReminders.execute({ now: NOW });
    const sent = vi.mocked(transport.send).mock.calls[0]?.[1];
    expect(sent).toEqual(preview.message);
    expect(sent?.html).toContain("&lt;b&gt; &amp; * _");
    expect(sent?.html).not.toContain("preserve note");
    expect(sent?.text).toContain("Любое название <b> & * _");
    expect(messageOptions(sent as NonNullable<typeof sent>)).toMatchObject({ parse_mode: "HTML" });
    expect(sent?.html?.length).toBeLessThanOrEqual(3500);
    expect(messageOptions({ text: "legacy question", forceReply: true })).not.toHaveProperty(
      "parse_mode",
    );
  });
  it("rolls back settings, selections and start date if the last batch statement fails", async () => {
    await save();
    await operations().reports.schedule(NOW);
    const before = await reports.settings(OWNER),
      shared = await progress.settings(OWNER),
      selected = await reports.selections(OWNER);
    const failing = new D1ProgressReportRepository(
      new Proxy(env.DB, {
        get(target, key) {
          if (key === "batch")
            return (statements: D1PreparedStatement[]) =>
              target.batch([
                ...statements.slice(0, -1),
                target.prepare("UPDATE acceptance_missing_table SET id = 1"),
              ]);
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    );
    await expect(
      failing.save(
        { ...before, sundayTime: "22:00" },
        [{ goalId, included: false }],
        "2026-10-07",
        true,
      ),
    ).rejects.toThrow();
    expect(await reports.settings(OWNER)).toEqual(before);
    expect(await progress.settings(OWNER)).toEqual(shared);
    expect(await reports.selections(OWNER)).toEqual(selected);
  });
  it("preserves an explicit selection in another month", async () => {
    const next = await create("Ноябрь", OWNER, "2026-11");
    await save({ enabled: false, month: "2026-11", goals: [{ goalId: next.id, included: true }] });
    await save({ goals: [{ goalId, included: false }], enabled: false });
    expect(await reports.selections(OWNER)).toEqual(
      expect.arrayContaining([
        { goalId: next.id, included: true },
        { goalId, included: false },
      ]),
    );
  });
});

describe("schedule and delivery acceptance", () => {
  it("shows pending Sunday and next Wednesday, includes late original-period facts and labels the quiet-hour delay", async () => {
    await save({ sundayTime: "23:30" });
    const sunday = Date.parse("2026-10-11T18:30:00Z"),
      monday = Date.parse("2026-10-12T03:00:00Z");
    await operations().runReminders.execute({ now: sunday });
    const state = await operations().reports.get({ ownerId: OWNER, month: "2026-10", now: sunday });
    expect(state.nextRuns.map((run) => [run.slot, run.reportDate])).toEqual([
      ["sun", "2026-10-11"],
      ["wed", "2026-10-14"],
    ]);
    await fact(goalId, "2026-10-11", 40, monday - 1000);
    await fact(goalId, "2026-10-12", 999, monday - 1000);
    await operations().runReminders.execute({ now: monday });
    const sent = vi.mocked(transport.send).mock.calls[0]?.[1];
    expect(sent?.text).toContain("Перенос из-за тихих часов");
    expect(sent?.text).toContain("23:30");
    expect(sent?.text).toContain("40");
    expect(sent?.text).not.toContain("999");
    expect(JSON.parse((await rows()).results[0]?.payload ?? "{}").formedAt).toBe(monday);
  });
  it.each(["schedule", "quiet"] as const)(
    "cancels unsent jobs after a %s change and recalculates both next runs",
    async (change) => {
      await save();
      await operations().reports.schedule(NOW);
      if (change === "schedule") await save({ wednesdayTime: "22:00" }, NOW + 1000);
      else
        await operations().saveSettings.execute({
          ownerId: OWNER,
          input: { ...DEFAULT_SETTINGS, quietStart: "20:00" },
          now: NOW + 1000,
        });
      expect((await rows()).results[0]?.status).toBe("cancelled");
      expect(
        (await operations().reports.get({ ownerId: OWNER, month: "2026-10", now: NOW + 1000 }))
          .nextRuns,
      ).toHaveLength(2);
      expect(transport.send).not.toHaveBeenCalled();
    },
  );
  it("honours retry_after, limits confirmed retries and scopes the 24-hour warning to reports and owner", async () => {
    vi.mocked(transport.send).mockRejectedValue(new DeliveryError("retry", 120));
    await save();
    await operations().runReminders.execute({ now: NOW });
    expect((await rows()).results[0]).toMatchObject({
      status: "pending",
      due_at: NOW + 120000,
      attempts: 1,
    });
    expect(await reports.deliveryStatus(OWNER, NOW - 86400000)).toEqual({
      retrying: 1,
      failed: 0,
      unknown: 0,
    });
    expect(await reports.deliveryStatus(OTHER, NOW - 86400000)).toEqual({
      retrying: 0,
      failed: 0,
      unknown: 0,
    });
    for (let index = 1; index <= 3; index++)
      await operations().runReminders.execute({ now: NOW + index * 120000 });
    expect(transport.send).toHaveBeenCalledTimes(4);
    expect((await rows()).results[0]?.status).toBe("failed");
    expect(await reports.deliveryStatus(OWNER, NOW + 1)).toEqual({
      retrying: 0,
      failed: 0,
      unknown: 0,
    });
  });
  it("blocks both kinds after Telegram 403 and cancels both kinds after disconnect", async () => {
    await save();
    await operations().reports.schedule(NOW);
    const { createReminderJob } = await import("../src/modules/reminders/domain/jobs");
    await reminders.enqueue(
      createReminderJob({
        id: crypto.randomUUID(),
        ownerId: OWNER,
        goalId,
        date: "2026-10-07",
        kind: "question",
        eventKey: "acceptance-question",
        now: NOW,
      }),
    );
    await operations().disconnect.execute({ ownerId: OWNER });
    const all = (await env.DB.prepare("SELECT status FROM reminder_jobs").all<{ status: string }>())
      .results;
    expect(all.every((job) => job.status === "cancelled")).toBe(true);
    await env.DB.prepare(
      "INSERT INTO telegram_links (owner_id, chat_id, telegram_user_id, status) VALUES (?, '123', '123', 'active')",
    )
      .bind(OWNER)
      .run();
    await save({ wednesdayTime: "22:00" }, NOW + 1000);
    vi.mocked(transport.send).mockRejectedValue(new DeliveryError("blocked"));
    await operations().runReminders.execute({ now: NOW + 3600000 });
    expect((await reminders.link(OWNER))?.status).toBe("blocked");
    expect(
      (await operations().reports.get({ ownerId: OWNER, month: "2026-10", now: NOW + 3600000 }))
        .state,
    ).toBe("disconnected");
  });
  it("never turns a reply to a report into a fact or question", async () => {
    await save();
    await operations().runReminders.execute({ now: NOW });
    const before = await planning.listEntries(goalId),
      jobs = (await rows()).results.length;
    await operations().bot.receive(
      { updateId: 90001, chatId: "123", telegramUserId: "123", text: "1000", replyToMessageId: 10 },
      NOW + 1000,
    );
    expect(await planning.listEntries(goalId)).toEqual(before);
    expect((await rows()).results).toHaveLength(jobs);
  });
});

describe("new HTTP route acceptance", () => {
  it("protects all seven API paths and returns Problem Details on untrusted mutations", async () => {
    const routes = [
      ["/api/progress/settings", "GET", undefined],
      ["/api/progress/settings", "PUT", { startsOn: null }],
      ["/api/progress?anchor=2026-10-07", "GET", undefined],
      [`/api/progress/goals/${goalId}?anchor=2026-10-07`, "GET", undefined],
      ["/api/reminders/progress-reports?month=2026-10", "GET", undefined],
      ["/api/reminders/progress-reports", "PUT", input({ enabled: false })],
      [
        "/api/reminders/progress-reports/preview",
        "POST",
        { ...input({ enabled: false }), slot: "wed" },
      ],
    ] as const;
    for (const [path, method, body] of routes) {
      const denied = await http(path, method, body, false);
      expect(denied.status, path).toBe(401);
      expect(denied.headers.get("Content-Type")).toContain("application/problem+json");
      if (method !== "GET")
        expect((await http(path, method, body, true, "https://other.example")).status, path).toBe(
          403,
        );
      expect((await http(path, method, body)).status, path).toBe(200);
    }
    expect(transport.send).not.toHaveBeenCalled();
  });
  it("keeps foreign and missing IDs indistinguishable for details, filters and report selection", async () => {
    const foreign = (await create("Чужая цель", OTHER)).id,
      missing = "00000000-0000-4000-8000-000000000000";
    for (const route of ["detail", "filter", "save", "preview"] as const) {
      const bodies = [];
      for (const id of [foreign, missing]) {
        const response =
          route === "detail"
            ? await http(`/api/progress/goals/${id}?anchor=2026-10-07`)
            : route === "filter"
              ? await http(`/api/progress?anchor=2026-10-07&goals=${id}`)
              : await http(
                  route === "save"
                    ? "/api/reminders/progress-reports"
                    : "/api/reminders/progress-reports/preview",
                  route === "save" ? "PUT" : "POST",
                  {
                    ...input({ enabled: false, goals: [{ goalId: id, included: true }] }),
                    ...(route === "preview" ? { slot: "wed" } : {}),
                  },
                );
        expect(response.status).toBe(404);
        const body = (await response.json()) as { code: string; detail: string };
        bodies.push([body.code, body.detail]);
      }
      expect(bodies[0]).toEqual(bodies[1]);
    }
    expect(
      (await http("/api/progress/settings", "PUT", { startsOn: null, ownerId: OTHER })).status,
    ).toBe(400);
    expect((await http("/api/reminders/progress-reports?month=2026-10")).status).toBe(200);
    expect((await progress.settings(OTHER)).startsOn).toBeNull();
  });
  it("rejects invalid civil dates, month, times and filters without writing or sending", async () => {
    const before = await reports.settings(OWNER);
    for (const path of [
      "/api/progress?anchor=2026-02-30",
      "/api/progress?anchor=2026-10-07&period=year",
      "/api/progress?anchor=2026-10-07&goals=bad",
      "/api/reminders/progress-reports?month=2026-13",
    ])
      expect((await http(path)).status, path).toBe(400);
    for (const patch of [
      { startsOn: "2026-02-30" },
      { sundayTime: "25:00" },
      { month: "2026-13" },
    ]) {
      expect(
        (await http("/api/reminders/progress-reports", "PUT", input({ ...patch, enabled: false })))
          .status,
      ).toBe(400);
      expect(
        (
          await http("/api/reminders/progress-reports/preview", "POST", {
            ...input({ ...patch, enabled: false }),
            slot: "wed",
          })
        ).status,
      ).toBe(400);
    }
    expect(await reports.settings(OWNER)).toEqual(before);
    expect((await rows()).results).toHaveLength(0);
    expect(transport.send).not.toHaveBeenCalled();
  });
  it("makes HTTP preview read-only across settings, selection, jobs and month preparation", async () => {
    const snapshot = async () =>
      Promise.all(
        [
          "progress_settings",
          "progress_report_settings",
          "goal_progress_reports",
          "reminder_jobs",
          "plan_month_rollovers",
        ].map(async (table) => (await env.DB.prepare(`SELECT * FROM ${table}`).all()).results),
      );
    const before = await snapshot();
    expect(
      (
        await http("/api/reminders/progress-reports/preview", "POST", {
          ...input({ enabled: false }),
          slot: "sun",
        })
      ).status,
    ).toBe(200);
    expect(await snapshot()).toEqual(before);
    expect(transport.send).not.toHaveBeenCalled();
  });
});
describe("bounded D1 profile", () => {
  it("uses indexed bulk reads for a personal plan without one query per goal", async () => {
    const statements: string[] = [];
    const measured = new D1PlanningRepository(
      new Proxy(env.DB, {
        get(target, key) {
          if (key === "prepare")
            return (sql: string) => {
              statements.push(sql);
              return target.prepare(sql);
            };
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    );
    for (let index = 0; index < 29; index++) {
      const goal = await create(`Профиль ${index}`);
      for (let day = 1; day <= 7; day++) await fact(goal.id, `2026-10-0${day}`, 25);
    }
    const start = performance.now();
    const sources = await measured.progressSources(OWNER, "2026-09", "2026-10");
    expect(sources).toHaveLength(30);
    expect(statements).toHaveLength(3);
    expect(sources.reduce((total, source) => total + source.entries.length, 0)).toBe(206);
    const queries = [
      [
        "SELECT * FROM plan_goals WHERE owner_id = ? AND month >= ? AND month <= ? AND deleted_at IS NULL",
        [OWNER, "2026-09", "2026-10"],
      ],
      [
        "SELECT e.* FROM plan_goals g JOIN goal_entries e ON e.goal_id = g.id WHERE g.owner_id = ? AND g.month BETWEEN ? AND ?",
        [OWNER, "2026-09", "2026-10"],
      ],
      ["SELECT * FROM progress_report_settings WHERE enabled = 1", []],
      [
        "SELECT * FROM reminder_jobs WHERE status = 'pending' AND due_at <= ? ORDER BY due_at LIMIT 5",
        [NOW],
      ],
      [
        "SELECT * FROM reminder_jobs WHERE created_at > ? AND owner_id = ? AND kind = 'weekly-progress'",
        [NOW - 86400000, OWNER],
      ],
    ] as const;
    const plans = [];
    for (const [sql, args] of queries) {
      const rows = (
        await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
          .bind(...args)
          .all<{ detail: string }>()
      ).results.map((row) => row.detail);
      expect(
        rows.some((row) => /USING (?:COVERING )?INDEX/u.test(row)),
        sql,
      ).toBe(true);
      plans.push(rows);
    }
    await save();
    await operations().runReminders.execute({ now: NOW });
    expect(transport.send).toHaveBeenCalledTimes(1);
    console.log(
      JSON.stringify({
        acceptanceProfile: {
          goals: 30,
          entries: 206,
          bulkReads: statements.length,
          elapsedMs: Math.round(performance.now() - start),
          indexedPlans: plans,
        },
      }),
    );
  });
});
describe("monthly boundary and report leases", () => {
  it("counts selected monthly versions once and keeps two monthly plans separate", async () => {
    const september = await create("Месячная", OWNER, "2026-09", { type: "check" });
    const october = await create("Месячная", OWNER, "2026-10", { type: "check" });
    await env.DB.prepare(
      "UPDATE plan_goals SET carried_from_goal_id = ?, cadence_period = 'month', target_occurrences = 10 WHERE id = ?",
    )
      .bind(september.id, october.id)
      .run();
    await env.DB.prepare(
      "UPDATE plan_goals SET cadence_period = 'month', target_occurrences = 10 WHERE id = ?",
    )
      .bind(september.id)
      .run();
    for (const [id, date] of [
      [september.id, "2026-09-29"],
      [october.id, "2026-10-02"],
    ] as const)
      await planning.upsertEntry({
        goalId: id,
        date,
        value: true,
        met: true,
        note: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
    await save({
      enabled: false,
      month: "2026-09",
      startsOn: null,
      goals: [{ goalId: september.id, included: true }],
    });
    await save({
      startsOn: null,
      goals: [
        { goalId: october.id, included: true },
        { goalId, included: false },
      ],
    });
    const preview = await operations().reports.preview({
      ownerId: OWNER,
      input: input({
        startsOn: null,
        goals: [
          { goalId: october.id, included: true },
          { goalId, included: false },
        ],
      }),
      slot: "sun",
      now: Date.parse("2026-10-04T16:00Z"),
    });
    expect(preview.overview.goals).toHaveLength(1);
    expect(preview.overview.goals[0]).toMatchObject({ records: 2, met: 2 });
    expect(
      preview.overview.goals[0]?.targets.map((target) => [
        target.from,
        target.value,
        target.target,
      ]),
    ).toEqual([
      ["2026-09-01", 1, 10],
      ["2026-10-01", 1, 10],
    ]);
    await save({
      enabled: false,
      month: "2026-09",
      goals: [{ goalId: september.id, included: false }],
    });
    const excluded = await operations().reports.preview({
      ownerId: OWNER,
      input: input({
        startsOn: null,
        goals: [
          { goalId: october.id, included: true },
          { goalId, included: false },
        ],
      }),
      slot: "sun",
      now: Date.parse("2026-10-04T16:00Z"),
    });
    expect(excluded.overview.goals[0]?.records).toBe(1);
  });
  it("claims a weekly delivery with one 60-second lease and never reclaims the delivered slot", async () => {
    await save();
    await operations().reports.schedule(NOW);
    const id = (await rows()).results[0]?.id as string;
    vi.mocked(transport.send).mockImplementation(async () => {
      const job = await reminders.job(id);
      expect(job).toMatchObject({
        kind: "weekly-progress",
        status: "sending",
        leaseUntil: NOW + 60000,
        attempts: 1,
      });
      return 10;
    });
    await Promise.all([
      operations().reports.deliver(id, NOW),
      operations().reports.deliver(id, NOW),
    ]);
    await operations().reports.deliver(id, NOW + 60000);
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(await reminders.job(id)).toMatchObject({ status: "sent", leaseUntil: null });
  });
});
