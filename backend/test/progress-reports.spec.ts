import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateGoalUseCase } from "../src/modules/planning/application/goals/create-goal.use-case";
import { D1PlanningRepository } from "../src/modules/planning/infrastructure/d1-planning-repository";
import { createProgressOperations } from "../src/modules/progress";
import { createReminderOperations } from "../src/modules/reminders";
import { DEFAULT_SETTINGS } from "../src/modules/reminders/domain/model";
import {
  nextReportOccurrence,
  type ReportInput,
} from "../src/modules/reminders/domain/progress-reports";
import { D1ProgressReportRepository } from "../src/modules/reminders/infrastructure/d1-progress-report-repository";
import { D1ReminderRepository } from "../src/modules/reminders/infrastructure/d1-reminder-repository";
import { DeliveryError, type ReminderTransport } from "../src/modules/reminders/public-contracts";

const OWNER = "c5e7a036-50a6-4c56-90a1-59b3d212b44a";
const NOW = Date.parse("2026-10-07T16:00:00Z");
const repository = new D1ReminderRepository(env.DB);
const planning = new D1PlanningRepository(env.DB);
let transport: ReminderTransport;
const operations = () => createReminderOperations(env.DB, transport, "https://example.com");
let goalId: string;
const input = (changes: Partial<ReportInput> = {}): ReportInput => ({
  month: "2026-10",
  enabled: true,
  wednesdayTime: "21:00",
  sundayTime: "21:00",
  startsOn: "2026-10-06",
  goals: [{ goalId, included: true }],
  ...changes,
});
const save = (changes: Partial<ReportInput> = {}, now = NOW - 60000) =>
  operations().reports.save({ ownerId: OWNER, input: input(changes), now });
const jobs = () =>
  env.DB.prepare(
    "SELECT id, status, payload, local_date FROM reminder_jobs WHERE kind = 'weekly-progress'",
  ).all<{ id: string; status: string; payload: string; local_date: string }>();

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
  await env.DB.prepare("INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)")
    .bind(OWNER, NOW, NOW)
    .run();
  await env.DB.prepare(
    "INSERT INTO telegram_links (owner_id, chat_id, telegram_user_id, status) VALUES (?, '123', '123', 'active')",
  )
    .bind(OWNER)
    .run();
  await repository.saveSettings(
    { ownerId: OWNER, ...DEFAULT_SETTINGS, enabled: false, nextEveningAt: null },
    [],
  );
  const goal = await new CreateGoalUseCase(planning).execute({
    ownerId: OWNER,
    month: "2026-10",
    title: "Чтение * _",
    tracking: { type: "quantity", comparison: "atLeast", targetValue: 20, unit: "страниц" },
    cadence: { period: "day" },
    now: NOW,
  });
  goalId = goal.id;
  await planning.upsertEntry({
    goalId,
    date: "2026-10-06",
    value: 25,
    met: true,
    note: "private note",
    createdAt: NOW,
    updatedAt: NOW,
  });
  transport = {
    send: vi.fn(async () => 10),
    edit: vi.fn(async () => {}),
    username: vi.fn(async () => "fake_bot"),
  };
});

describe("report schedules", () => {
  it("uses the first valid minute after a spring gap and one occurrence during fall back", () => {
    expect(
      nextReportOccurrence(Date.parse("2026-03-29T00:00:00Z"), "Europe/Berlin", "02:30", 7),
    ).toBe(Date.parse("2026-03-29T01:00:00Z"));
    expect(
      nextReportOccurrence(Date.parse("2026-10-25T00:45:00Z"), "Europe/Berlin", "02:30", 7),
    ).toBe(Date.parse("2026-11-01T01:30:00Z"));
  });
  it("schedules strictly after saving, without replaying past slots", async () => {
    const state = await save({}, NOW);
    expect(state.settings.nextWednesdayAt).toBe(Date.parse("2026-10-14T16:00:00Z"));
    await operations().runReminders.execute({ now: NOW });
    expect(transport.send).not.toHaveBeenCalled();
  });
});

describe("progress reports with D1 and fake transport", () => {
  it("sends one report with reminders disabled and handles parallel Cron ticks", async () => {
    await save();
    await Promise.all([
      operations().runReminders.execute({ now: NOW }),
      operations().runReminders.execute({ now: NOW }),
    ]);
    expect(transport.send).toHaveBeenCalledTimes(1);
    const message = vi.mocked(transport.send).mock.calls[0]?.[1];
    expect(message?.text).toContain("Чтение * _");
    expect(message?.text).toContain("25 страниц");
    expect(message?.text).not.toContain("private note");
    expect(message?.buttons?.[0]?.[0]).toMatchObject({
      url: "https://example.com/plans/2026-10/progress?period=week&anchor=2026-10-05",
    });
    expect((await jobs()).results).toHaveLength(1);
  });
  it("does not resend a delivered slot after editing its time", async () => {
    await save();
    await operations().runReminders.execute({ now: NOW });
    await save({ wednesdayTime: "22:00" }, NOW + 1000);
    await operations().runReminders.execute({ now: NOW + 3600000 });
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect((await jobs()).results).toHaveLength(1);
  });
  it("retains a snapshot during a confirmed retry, even if facts change", async () => {
    vi.mocked(transport.send).mockRejectedValueOnce(new DeliveryError("retry", 60));
    await save();
    await operations().runReminders.execute({ now: NOW });
    await planning.upsertEntry(
      {
        goalId,
        date: "2026-10-06",
        value: 100,
        met: true,
        note: null,
        createdAt: NOW,
        updatedAt: NOW + 1,
      },
      (await planning.entrySnapshot(OWNER, goalId, "2026-10-06"))?.revision ?? null,
    );
    await operations().runReminders.execute({ now: NOW + 60000 });
    expect(transport.send).toHaveBeenCalledTimes(2);
    expect(vi.mocked(transport.send).mock.calls[0]?.[1]).toEqual(
      vi.mocked(transport.send).mock.calls[1]?.[1],
    );
    expect(vi.mocked(transport.send).mock.calls[1]?.[1].text).toContain("25 страниц");
  });
  it("rebuilds an unsent snapshot when the shared start date changes", async () => {
    vi.mocked(transport.send).mockRejectedValueOnce(new DeliveryError("retry", 60));
    await save();
    await operations().runReminders.execute({ now: NOW });
    await createProgressOperations(env.DB).saveSettings(OWNER, "2026-10-07");
    await operations().runReminders.execute({ now: NOW + 60000 });
    expect(vi.mocked(transport.send).mock.calls[1]?.[1].text).toContain("пока нет записей");
    expect(vi.mocked(transport.send).mock.calls[1]?.[1].text).not.toContain("25 страниц");
  });
  it("does not retry an unknown delivery result", async () => {
    vi.mocked(transport.send).mockRejectedValueOnce(new DeliveryError("unknown"));
    await save();
    await operations().runReminders.execute({ now: NOW });
    await operations().runReminders.execute({ now: NOW + 60000 });
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect((await jobs()).results[0]?.status).toBe("unknown");
  });
  it("skips slots older than 24 hours", async () => {
    await save();
    await operations().runReminders.execute({ now: NOW + 86400001 });
    expect(transport.send).not.toHaveBeenCalled();
    expect((await jobs()).results).toHaveLength(0);
  });
  it("retains Sunday's original period when quiet hours delay delivery until Monday", async () => {
    await save({ sundayTime: "23:30" });
    const sunday = Date.parse("2026-10-11T18:30:00Z");
    const monday = Date.parse("2026-10-12T03:00:00Z");
    await operations().runReminders.execute({ now: sunday });
    expect(transport.send).not.toHaveBeenCalled();
    const state = await operations().reports.get({ ownerId: OWNER, month: "2026-10", now: sunday });
    expect(state.nextRuns[0]).toMatchObject({
      slot: "sun",
      reportDate: "2026-10-11",
      sendAt: monday,
      scheduledAt: sunday,
    });
    await planning.upsertEntry({
      goalId,
      date: "2026-10-12",
      value: 999,
      met: true,
      note: null,
      createdAt: monday,
      updatedAt: monday,
    });
    await operations().runReminders.execute({ now: monday });
    const message = vi.mocked(transport.send).mock.calls[0]?.[1].text;
    expect(message).toContain("Итоги недели");
    expect(message).toContain("11 октября");
    expect(message).not.toContain("999");
    expect((await jobs()).results[0]?.local_date).toBe("2026-10-11");
  });
  it("rejects a stale claim if selection changes after snapshot formation", async () => {
    vi.mocked(transport.send).mockRejectedValueOnce(new DeliveryError("retry", 60));
    await save();
    await operations().runReminders.execute({ now: NOW });
    const reportRepository = new D1ProgressReportRepository(env.DB);
    const row = (await jobs()).results[0];
    if (!row) throw new Error("Missing pending job");
    const job = await repository.job(row.id);
    if (!job) throw new Error("Missing pending job");
    const snapshot = JSON.parse(row.payload) as {
      reportRevision: number;
      progressRevision: number;
    };
    await save({ enabled: false, goals: [{ goalId, included: false }] }, NOW + 1000);
    expect(
      await reportRepository.claim(
        job,
        await repository.settings(OWNER),
        snapshot.reportRevision,
        snapshot.progressRevision,
        "123",
        NOW + 60000,
      ),
    ).toBe(false);
    await operations().runReminders.execute({ now: NOW + 60000 });
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
  it("rebuilds a pending snapshot when a selected goal is deleted", async () => {
    vi.mocked(transport.send).mockRejectedValueOnce(new DeliveryError("retry", 60));
    await save();
    await operations().runReminders.execute({ now: NOW });
    await planning.softDeleteOwnedGoal(goalId, OWNER, NOW + 1);
    await operations().runReminders.execute({ now: NOW + 60000 });
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect((await jobs()).results[0]?.status).toBe("cancelled");
  });
  it("fits long reports into one message by omitting only whole goal blocks", async () => {
    const selections = [{ goalId, included: true }];
    for (let index = 0; index < 35; index++) {
      const goal = await new CreateGoalUseCase(planning).execute({
        ownerId: OWNER,
        month: "2026-10",
        title: `Длинная цель ${index}: ${"Ж".repeat(100)}`,
        tracking: { type: "check" },
        cadence: { period: "week", targetOccurrences: 3 },
        now: NOW,
      });
      selections.push({ goalId: goal.id, included: true });
    }
    const result = await operations().reports.preview({
      ownerId: OWNER,
      input: input({ goals: selections }),
      slot: "wed",
      now: NOW,
    });
    expect(result.message?.text.length).toBeLessThanOrEqual(3500);
    expect(result.message?.text).toMatch(/Ещё \d+ целей — в подробном отчёте/u);
    for (const goal of result.overview.goals) {
      const prefix = goal.title.slice(0, 18);
      if (result.message?.text.includes(prefix)) expect(result.message.text).toContain(goal.title);
    }
    expect(result.message?.buttons?.[0]?.[0]).toMatchObject({ text: "Открыть прогресс" });
  });
  it("saves disabled drafts without Telegram and rejects enabling or an empty enabled selection", async () => {
    await repository.disconnect(OWNER);
    await save({ enabled: false });
    await expect(save()).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(save({ goals: [] })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
  it("pauses on deleted selected goals, restores their selection and never sends before a future start", async () => {
    await save();
    await planning.softDeleteOwnedGoal(goalId, OWNER, NOW);
    expect(
      await operations().reports.get({ ownerId: OWNER, month: "2026-10", now: NOW }),
    ).toMatchObject({ state: "no-goals" });
    await planning.restoreOwnedGoal(goalId, OWNER, NOW + 1);
    expect(
      (await operations().reports.get({ ownerId: OWNER, month: "2026-10", now: NOW })).goals[0]
        ?.included,
    ).toBe(true);
    await createProgressOperations(env.DB).saveSettings(OWNER, "2026-10-12");
    await operations().runReminders.execute({ now: NOW });
    expect(transport.send).not.toHaveBeenCalled();
  });
  it("keeps preview read-only and applies only selected goals", async () => {
    const other = await new CreateGoalUseCase(planning).execute({
      ownerId: OWNER,
      month: "2026-10",
      title: "Не включать",
      tracking: { type: "check" },
      cadence: { period: "day" },
      now: NOW,
    });
    const before = await env.DB.prepare("SELECT count(*) FROM plan_month_rollovers").first(
      "count(*)",
    );
    const result = await operations().reports.preview({
      ownerId: OWNER,
      input: input({
        enabled: false,
        goals: [
          { goalId, included: true },
          { goalId: other.id, included: false },
        ],
      }),
      slot: "wed",
      now: NOW,
    });
    expect(result.message?.text).toContain("Чтение");
    expect(result.message?.text).not.toContain("Не включать");
    expect(
      await env.DB.prepare("SELECT count(*) FROM plan_month_rollovers").first("count(*)"),
    ).toBe(before);
    expect((await jobs()).results).toHaveLength(0);
    expect(transport.send).not.toHaveBeenCalled();
  });
  it("inherits report selection on rollover, including explicit exclusions", async () => {
    await save();
    const november = Date.parse("2026-11-01T05:00:00Z");
    await operations().prepareCurrentPlan.execute({ ownerId: OWNER, now: november });
    const state = await operations().reports.get({
      ownerId: OWNER,
      month: "2026-11",
      now: november,
    });
    expect(state.goals).toHaveLength(1);
    expect(state.goals[0]?.included).toBe(true);
    await operations().reports.save({
      ownerId: OWNER,
      input: {
        ...input(),
        month: "2026-11",
        enabled: false,
        goals: [{ goalId: state.goals[0]?.goalId as string, included: false }],
      },
      now: november,
    });
    await operations().prepareCurrentPlan.execute({ ownerId: OWNER, now: november + 60000 });
    expect(
      (await operations().reports.get({ ownerId: OWNER, month: "2026-11", now: november })).goals[0]
        ?.included,
    ).toBe(false);
  });
});
