import { runDurableObjectAlarm } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src";
import { createPlanningOperations, type GoalTracking } from "../src/modules/planning";
import { UpsertGoalEntryUseCase } from "../src/modules/planning/application/entries/upsert-goal-entry.use-case";
import { CreateGoalUseCase } from "../src/modules/planning/application/goals/create-goal.use-case";
import { D1PlanningRepository } from "../src/modules/planning/infrastructure/d1-planning-repository";
import { createReminderOperations } from "../src/modules/reminders";
import { createReminderJob } from "../src/modules/reminders/domain/jobs";
import { DEFAULT_SETTINGS } from "../src/modules/reminders/domain/model";
import {
  afterQuietHours,
  localDate,
  localTime,
  nextOccurrence,
  startOfReminderDay,
} from "../src/modules/reminders/domain/schedule";
import { D1ReminderRepository } from "../src/modules/reminders/infrastructure/d1-reminder-repository";
import type { BotInput, OutgoingMessage } from "../src/modules/reminders/public-contracts";
import { DeliveryError, type ReminderTransport } from "../src/modules/reminders/public-contracts";
import { sha256Base64Url } from "../src/platform/crypto/secure-values";
import { configureReminderScheduler } from "./reminder-runtime";

const OWNER = "c5e7a036-50a6-4c56-90a1-59b3d212b44a";
const now = Date.parse("2026-09-29T04:00:00Z"); // 09:00 Yekaterinburg
const planning = createPlanningOperations(env.DB);
const repository = new D1ReminderRepository(env.DB);
const planningRepository = new D1PlanningRepository(env.DB);
let sent: { id: number; message: OutgoingMessage }[];
let transport: ReminderTransport;
let updateId: number;
const operations = () => createReminderOperations(env.DB, transport);
afterEach(() => vi.restoreAllMocks());
const incoming = (fields: Partial<BotInput>): BotInput => ({
  updateId: ++updateId,
  chatId: "123",
  telegramUserId: "123",
  ...fields,
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM users"),
    env.DB.prepare("DELETE FROM planning_entry_commands"),
  ]);
  await env.DB.prepare("INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)")
    .bind(OWNER, now, now)
    .run();
  sent = [];
  updateId = 100;
  transport = {
    send: vi.fn(async (_chatId, message) => {
      const id = sent.length + 1;
      sent.push({ id, message });
      return id;
    }),
    edit: vi.fn(async () => {}),
    username: vi.fn(async () => "planner_test_bot"),
  };
  await repository.saveSettings(
    {
      ownerId: OWNER,
      ...DEFAULT_SETTINGS,
      enabled: true,
      nextEveningAt: nextOccurrence(now, DEFAULT_SETTINGS.timeZone, "21:00"),
    },
    [],
  );
  await env.DB.prepare(
    "INSERT INTO telegram_links (owner_id, chat_id, telegram_user_id, status) VALUES (?, '123', '123', 'active')",
  )
    .bind(OWNER)
    .run();
});

async function goal(
  tracking: GoalTracking = { type: "time" },
  mode: "scheduled" | "evening" = "scheduled",
) {
  const created = await new CreateGoalUseCase(planningRepository).execute({
    ownerId: OWNER,
    month: "2026-09",
    title: tracking.type,
    tracking,
    cadence: { period: "day" },
    now,
  });
  await operations().saveGoalReminder.execute({
    ownerId: OWNER,
    goalId: created.id,
    input: { mode, time: "09:00", weekdays: [1, 2, 3, 4, 5, 6, 7] },
    now: now - 60_000,
  });
  return created;
}
async function firstJob() {
  const rows = await env.DB.prepare("SELECT id FROM reminder_jobs ORDER BY created_at, rowid").all<{
    id: string;
  }>();
  const id = rows.results[0]?.id;
  if (!id) throw new Error("No job");
  const result = await repository.job(id);
  if (!result) throw new Error("Missing job");
  return result;
}

describe("reminder schedules", () => {
  it.each([
    "Asia/Yekaterinburg",
    "UTC",
    "Europe/Berlin",
    "Australia/Lord_Howe",
    "America/Santiago",
    "Pacific/Apia",
    "Pacific/Kiritimati",
    "Asia/Kathmandu",
  ])("keeps cached local dates and times consistent with Intl around transitions in %s", (zone) => {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    for (const day of [
      "2026-03-29",
      "2026-10-25",
      "2026-10-04",
      "2026-09-06",
      "2026-12-31",
      "2011-12-30",
      "1990-01-01",
    ])
      for (const hour of [-36, -12, -1, 0, 1, 12, 36]) {
        const at = Date.parse(`${day}T00:00:00Z`) + hour * 3_600_000;
        for (const minute of [0, 1, 59]) {
          const instant = at + minute * 60_000 + 59_999;
          const expected = Object.fromEntries(
            formatter.formatToParts(instant).map((part) => [part.type, part.value]),
          );
          expect(localDate(instant, zone)).toBe(
            `${expected.year}-${expected.month}-${expected.day}`,
          );
          expect(localTime(instant, zone)).toBe(`${expected.hour}:${expected.minute}`);
        }
      }
  });
  it.each([
    ["UTC", "2026-12-31T23:58:00Z", "2027-01-01T00:15:00Z"],
    ["Pacific/Kiritimati", "2026-12-31T09:58:00Z", "2026-12-31T10:15:00Z"],
    ["Pacific/Honolulu", "2027-01-01T09:58:00Z", "2027-01-01T10:15:00Z"],
    ["Asia/Kathmandu", "2026-12-31T18:13:00Z", "2026-12-31T18:30:00Z"],
  ])("keeps local year boundaries and fractional offsets in %s", (zone, now, expected) => {
    const at = Date.parse(expected);
    expect(nextOccurrence(Date.parse(now), zone, "00:15")).toBe(at);
    expect(nextOccurrence(at, zone, "00:15")).toBe(at + 86_400_000);
  });
  it("preserves half-hour DST gaps, earliest folds and a missing local midnight", () => {
    expect(nextOccurrence(Date.parse("2026-10-03T14:00:00Z"), "Australia/Lord_Howe", "02:15")).toBe(
      Date.parse("2026-10-03T15:45:00Z"),
    );
    expect(nextOccurrence(Date.parse("2026-04-04T14:00:00Z"), "Australia/Lord_Howe", "01:45")).toBe(
      Date.parse("2026-04-04T14:45:00Z"),
    );
    expect(nextOccurrence(Date.parse("2026-04-04T14:50:00Z"), "Australia/Lord_Howe", "01:45")).toBe(
      Date.parse("2026-04-05T15:15:00Z"),
    );
    expect(
      afterQuietHours(Date.parse("2026-10-03T14:00:00Z"), {
        ...DEFAULT_SETTINGS,
        timeZone: "Australia/Lord_Howe",
        quietStart: "23:00",
        quietEnd: "02:15",
      }),
    ).toBe(Date.parse("2026-10-03T15:45:00Z"));
    expect(startOfReminderDay(Date.parse("2026-09-06T04:30:00Z"), "America/Santiago")).toBe(
      Date.parse("2026-09-06T04:00:00Z"),
    );
  });
  it("handles quiet hours across midnight and disabled quiet hours", () => {
    expect(afterQuietHours(Date.parse("2026-09-29T19:00:00Z"), DEFAULT_SETTINGS)).toBe(
      Date.parse("2026-09-30T03:00:00Z"),
    );
    expect(afterQuietHours(now, DEFAULT_SETTINGS)).toBe(now);
    expect(
      afterQuietHours(now, { ...DEFAULT_SETTINGS, quietStart: "00:00", quietEnd: "00:00" }),
    ).toBe(now);
  });
  it("uses local weekdays and handles both DST transitions once", () => {
    expect(
      nextOccurrence(Date.parse("2026-09-29T04:00:00Z"), "Asia/Yekaterinburg", "09:00", [1]),
    ).toBe(Date.parse("2026-10-05T04:00:00Z"));
    expect(nextOccurrence(Date.parse("2026-03-29T00:00:00Z"), "Europe/Berlin", "02:30")).toBe(
      Date.parse("2026-03-29T01:30:00Z"),
    );
    expect(nextOccurrence(Date.parse("2026-10-25T00:45:00Z"), "Europe/Berlin", "02:30")).toBe(
      Date.parse("2026-10-26T01:30:00Z"),
    );
  });
  it("reuses local-time resolutions without repeating a due occurrence or mixing zones", () => {
    const due = Date.parse("2026-09-29T04:00:00Z");
    expect(nextOccurrence(due - 1, "Asia/Yekaterinburg", "09:00")).toBe(due);
    expect(nextOccurrence(due, "Asia/Yekaterinburg", "09:00")).toBe(due + 86400000);
    expect(nextOccurrence(due, "Europe/Berlin", "09:00")).toBe(Date.parse("2026-09-29T07:00:00Z"));
    expect(nextOccurrence(Date.parse("2026-03-29T01:15:00Z"), "Europe/Berlin", "02:30")).toBe(
      Date.parse("2026-03-29T01:30:00Z"),
    );
  });
});

describe("Telegram reminders with D1", () => {
  it("schedules and drains multiple questions in one execution", async () => {
    await goal({ type: "check" });
    await goal({ type: "check" });
    await operations().runReminders.execute({ now });
    expect(sent).toHaveLength(2);
    expect(await repository.due(now)).toHaveLength(0);
    await operations().runReminders.execute({ now });
    expect(sent).toHaveLength(2);
  });

  it("rechecks the clock between deliveries when a batch reaches quiet hours", async () => {
    await goal({ type: "check" });
    await goal({ type: "check" });
    let clock = now;
    vi.mocked(transport.send).mockImplementationOnce(async (_chatId, message) => {
      sent.push({ id: 1, message });
      clock = Date.parse("2026-09-29T18:00:00Z"); // 23:00 local
      return 1;
    });
    await operations().runReminders.execute({ now, clock: () => clock });
    expect(sent).toHaveLength(1);
    const deferred = await env.DB.prepare(
      "SELECT due_at, attempts FROM reminder_jobs WHERE status = 'pending'",
    ).first();
    expect(deferred).toEqual({ due_at: Date.parse("2026-09-30T03:00:00Z"), attempts: 0 });
  });

  it("does not read another owner's reminder through the combined delivery state", async () => {
    const created = await goal();
    const state = await repository.deliveryState("another-owner", created.id, "2026-09-29");
    expect(state).toEqual({
      settings: { ownerId: "another-owner", ...DEFAULT_SETTINGS, nextEveningAt: null },
      link: null,
      reminder: null,
      question: null,
    });
  });

  it("claims a question only once when two runners race", async () => {
    await goal({ type: "check" });
    await Promise.all([
      operations().runReminders.execute({ now }),
      operations().runReminders.execute({ now }),
    ]);
    expect(sent).toHaveLength(1);
    expect(await firstJob()).toMatchObject({ status: "sent", attempts: 1, messageId: 1 });
  });

  it.each(["answer", "rule", "connection", "settings", "deletion"])(
    "rejects a concurrent %s change at the delivery claim",
    async (change) => {
      const created = await goal({ type: "check" });
      const original = D1ReminderRepository.prototype.claim;
      vi.spyOn(D1ReminderRepository.prototype, "claim").mockImplementationOnce(async function (
        this: D1ReminderRepository,
        job,
        at,
        state,
        interactive,
      ) {
        if (change === "answer")
          await new UpsertGoalEntryUseCase(planningRepository).execute({
            ownerId: OWNER,
            goalId: created.id,
            date: "2026-09-29",
            now: at,
            expectedRevision: null,
            value: { completed: false },
          });
        else if (change === "rule")
          await env.DB.prepare(
            "UPDATE goal_reminders SET mode = 'off', revision = 'changed' WHERE goal_id = ?",
          )
            .bind(created.id)
            .run();
        else if (change === "settings")
          await env.DB.prepare(
            "UPDATE reminder_settings SET enabled = 0, revision = 'changed' WHERE owner_id = ?",
          )
            .bind(OWNER)
            .run();
        else if (change === "deletion")
          await env.DB.prepare("UPDATE plan_goals SET deleted_at = ? WHERE id = ?")
            .bind(at, created.id)
            .run();
        else
          await env.DB.prepare("UPDATE telegram_links SET status = 'blocked' WHERE owner_id = ?")
            .bind(OWNER)
            .run();
        return original.call(this, job, at, state, interactive);
      });
      await operations().runReminders.execute({ now });
      expect(sent).toHaveLength(0);
      expect((await firstJob()).attempts).toBe(0);
      await operations().runReminders.execute({ now: now + 60_000 });
      expect((await firstJob()).status).toBe("cancelled");
      expect(sent).toHaveLength(0);
    },
  );

  it("keeps an idle tick independent of plan preparation and reminder history", async () => {
    await goal();
    await operations().runReminders.execute({ now });
    const rollover = vi.spyOn(D1PlanningRepository.prototype, "rolloverState");
    const inheritance = vi.spyOn(D1PlanningRepository.prototype, "carriedGoals");
    const schedules = vi.spyOn(D1ReminderRepository.prototype, "scheduledReminders");
    await operations().runReminders.execute({ now: now + 60_000 });
    expect(rollover).not.toHaveBeenCalled();
    expect(inheritance).not.toHaveBeenCalled();
    expect(schedules).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });

  it("drains persisted questions together without duplicating scheduled events", async () => {
    const first = await goal();
    const second = await goal();
    for (const created of [first, second])
      await repository.enqueue(
        createReminderJob({
          id: crypto.randomUUID(),
          ownerId: OWNER,
          goalId: created.id,
          date: "2026-09-29",
          kind: "question",
          eventKey: `scheduled:${created.id}:2026-09-29`,
          now,
        }),
      );
    await operations().runReminders.execute({ now });
    expect(sent).toHaveLength(2);
    expect(await repository.due(now)).toHaveLength(0);
    await operations().runReminders.execute({ now: now + 60_000 });
    expect(sent).toHaveLength(2);
    expect(await repository.due(now + 60_000)).toHaveLength(0);
    const rows = await env.DB.prepare("SELECT status, attempts FROM reminder_jobs").all();
    expect(rows.results).toEqual([
      { status: "sent", attempts: 1 },
      { status: "sent", attempts: 1 },
    ]);
  });

  it("collects today's missing goals without loading another day's facts", async () => {
    const yesterday = await goal({ type: "check" }, "evening");
    const today = await goal({ type: "check" }, "evening");
    for (const [created, date] of [
      [yesterday, "2026-09-28"],
      [today, "2026-09-29"],
    ] as const)
      await new UpsertGoalEntryUseCase(planningRepository).execute({
        ownerId: OWNER,
        goalId: created.id,
        date,
        now,
        expectedRevision: null,
        value: { completed: false },
      });
    const snapshot = await planning.listForDate(OWNER, "2026-09-29");
    expect(snapshot.find((item) => item.id === yesterday.id)?.entries).toEqual([]);
    expect(snapshot.find((item) => item.id === today.id)?.entries).toHaveLength(1);
    expect(
      (await planning.list(OWNER, "2026-09")).find((item) => item.id === yesterday.id)?.entries,
    ).toHaveLength(1);
    await operations().runReminders.execute({ now: Date.parse("2026-09-29T16:00:00Z") });
    expect(JSON.parse((await firstJob()).payload)).toEqual([yesterday.id]);
  });

  it("handles help and stop commands before interpreting a reply to a question", async () => {
    const created = await goal();
    await operations().runReminders.execute({ now });
    const help = await operations().bot.receive(
      incoming({ text: "  /help  ", replyToMessageId: 1 }),
      now,
    );
    expect(help.text).toContain("Настройки — в Planner");
    expect(await planning.entry(OWNER, created.id, "2026-09-29")).toBeNull();
    expect((await firstJob()).status).toBe("sent");

    const stopped = await operations().bot.receive(
      incoming({ text: "/stop", replyToMessageId: 1 }),
      now,
    );
    expect(stopped.text).toContain("чат отвязан");
    expect(await repository.link(OWNER)).toBeNull();
    expect((await repository.settings(OWNER)).enabled).toBe(false);
    const reply = await operations().bot.receive(
      incoming({ text: "07:40", replyToMessageId: 1 }),
      now,
    );
    expect(reply.text).toContain("подключите Telegram");
    expect(await planning.entry(OWNER, created.id, "2026-09-29")).toBeNull();
  });

  it("keeps settings readable and scheduled work untouched when the bot is unavailable", async () => {
    await goal();
    const disabled = createReminderOperations(env.DB, null);
    expect(await disabled.getState.execute({ ownerId: OWNER, now })).toMatchObject({
      botAvailable: false,
      connection: "active",
    });
    await expect(disabled.connect.execute({ ownerId: OWNER, now })).rejects.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
    });
    await disabled.runReminders.execute({ now });
    expect(sent).toHaveLength(0);
    expect(await repository.due(now)).toHaveLength(0);
    await operations().runReminders.execute({ now });
    expect(sent).toHaveLength(1);
  });

  it.each(["scheduled", "evening"] as const)(
    "replaces an unsent %s job when rescheduled on the same day, but retains sent events",
    async (mode) => {
      const created = await goal({ type: "check" }, mode);
      const morning = Date.parse("2026-09-29T02:00:00Z"); // 07:00, quiet until 08:00
      if (mode === "scheduled")
        await operations().saveGoalReminder.execute({
          ownerId: OWNER,
          goalId: created.id,
          input: {
            mode,
            time: "07:00",
            weekdays: [1, 2, 3, 4, 5, 6, 7],
          },
          now: morning - 60_000,
        });
      else
        await operations().saveSettings.execute({
          ownerId: OWNER,
          input: {
            ...DEFAULT_SETTINGS,
            enabled: true,
            eveningTime: "07:00",
          },
          now: morning - 60_000,
        });
      await operations().runReminders.execute({ now: morning });
      const pending = await firstJob();
      expect(pending.status).toBe("pending");
      expect(sent).toHaveLength(0);
      const reschedule = (time: string, at: number) =>
        mode === "scheduled"
          ? operations().saveGoalReminder.execute({
              ownerId: OWNER,
              goalId: created.id,
              input: {
                mode,
                time,
                weekdays: [1, 2, 3, 4, 5, 6, 7],
              },
              now: at,
            })
          : operations().saveSettings.execute({
              ownerId: OWNER,
              input: {
                ...DEFAULT_SETTINGS,
                enabled: true,
                eveningTime: time,
              },
              now: at,
            });
      await reschedule("09:00", morning + 30 * 60_000);
      expect(await repository.job(pending.id)).toBeNull();
      await operations().runReminders.execute({ now });
      expect(sent).toHaveLength(1);
      const delivered = await firstJob();
      expect(delivered.dueAt).toBe(now);
      await reschedule("10:00", now + 60_000);
      await operations().runReminders.execute({ now: now + 60 * 60_000 });
      expect(sent).toHaveLength(1);
      expect((await repository.job(delivered.id))?.status).toBe("sent");
    },
  );
  it.each(["time", "weekdays", "mode", "quiet hours"])(
    "does not enqueue a stale question when %s change during a tick",
    async (change) => {
      const created = await goal();
      const original = D1ReminderRepository.prototype.advanceGoal;
      vi.spyOn(D1ReminderRepository.prototype, "advanceGoal").mockImplementationOnce(
        async function (this: D1ReminderRepository, item, previous, job, settings) {
          if (change === "quiet hours")
            await operations().saveSettings.execute({
              ownerId: OWNER,
              input: {
                ...DEFAULT_SETTINGS,
                enabled: true,
                quietStart: "00:00",
                quietEnd: "10:00",
              },
              now: now - 30_000,
            });
          else
            await operations().saveGoalReminder.execute({
              ownerId: OWNER,
              goalId: created.id,
              input: {
                mode: change === "mode" ? "evening" : "scheduled",
                time: change === "time" ? "09:30" : "09:00",
                weekdays: change === "weekdays" ? [2] : [1, 2, 3, 4, 5, 6, 7],
              },
              now: now - 30_000,
            });
          await original.call(this, item, previous, job, settings);
        },
      );
      await operations().runReminders.execute({ now });
      expect(sent).toHaveLength(0);
      expect(
        await env.DB.prepare("SELECT count(*) AS total FROM reminder_jobs").first("total"),
      ).toBe(0);
      const [updated] = await repository.reminders(OWNER);
      expect(updated?.nextRunAt).toBe(
        change === "mode" ? null : change === "time" ? now + 30 * 60_000 : now,
      );
    },
  );
  it.each(["time", "quiet hours"])(
    "does not enqueue a stale digest when evening %s change",
    async (change) => {
      await goal({ type: "check" }, "evening");
      const evening = Date.parse("2026-09-29T16:00:00Z");
      const original = D1ReminderRepository.prototype.advanceEvening;
      vi.spyOn(D1ReminderRepository.prototype, "advanceEvening").mockImplementationOnce(
        async function (this: D1ReminderRepository, settings, previous, next, job) {
          await operations().saveSettings.execute({
            ownerId: OWNER,
            input: {
              ...DEFAULT_SETTINGS,
              enabled: true,
              eveningTime: change === "time" ? "21:30" : "21:00",
              quietStart: change === "quiet hours" ? "20:00" : "23:00",
            },
            now: evening - 30_000,
          });
          await original.call(this, settings, previous, next, job);
        },
      );
      await operations().runReminders.execute({ now: evening });
      expect(sent).toHaveLength(0);
      expect(
        await env.DB.prepare("SELECT count(*) AS total FROM reminder_jobs").first("total"),
      ).toBe(0);
      expect((await repository.settings(OWNER)).nextEveningAt).toBe(
        change === "time" ? evening + 30 * 60_000 : evening,
      );
    },
  );
  it.each([
    [{ type: "check" } as GoalTracking, "да", true],
    [{ type: "quantity", targetValue: 10, comparison: "atLeast" } as GoalTracking, "2,5", 2.5],
    [{ type: "scale", min: 1, max: 5 } as GoalTracking, "4", 4],
    [{ type: "time" } as GoalTracking, "07:40", "07:40"],
  ])("records %j answers for the question date, even tomorrow", async (tracking, answer, value) => {
    const created = await goal(tracking);
    await operations().runReminders.execute({ now });
    expect(sent).toHaveLength(1);
    const response = await operations().bot.receive(
      incoming({ text: answer, replyToMessageId: 1 }),
      now + 86_400_000,
    );
    expect(response.text).toContain("2026-09-29");
    expect((await planning.entry(OWNER, created.id, "2026-09-29"))?.entry.value).toBe(value);
    expect(await planning.entry(OWNER, created.id, "2026-09-30")).toBeNull();
  });
  it("does not ask for existing false values or deleted goals", async () => {
    const created = await goal({ type: "check" });
    await new UpsertGoalEntryUseCase(planningRepository).execute({
      expectedRevision: null,
      ownerId: OWNER,
      goalId: created.id,
      date: "2026-09-29",
      now,
      value: { completed: false },
    });
    const removed = await goal();
    await planningRepository.softDeleteOwnedGoal(removed.id, OWNER, now);
    await operations().runReminders.execute({ now });
    expect(sent).toHaveLength(0);
  });
  it("does not overwrite the website and requires a fresh correction after a conflict", async () => {
    const created = await goal();
    await operations().runReminders.execute({ now });
    const job = await firstJob();
    const website = async (value: string) =>
      new UpsertGoalEntryUseCase(planningRepository).execute({
        expectedRevision: (await planning.entry(OWNER, created.id, "2026-09-29"))?.revision ?? null,
        ownerId: OWNER,
        goalId: created.id,
        date: "2026-09-29",
        now,
        value: { value, note: "keep this note" },
      });
    await website("08:10");
    const conflict = await operations().bot.receive(
      incoming({ text: "07:40", replyToMessageId: 1 }),
      now,
    );
    expect(conflict.text).toContain("уже есть запись");
    await operations().bot.receive(incoming({ callback: `edit:${job.id}` }), now);
    expect(sent[1]?.message.forceReply).toBe(true);
    await website("08:20"); // same millisecond: revision must still differ
    await operations().bot.receive(incoming({ text: "07:45", replyToMessageId: 2 }), now);
    expect((await planning.entry(OWNER, created.id, "2026-09-29"))?.entry.value).toBe("08:20");
    await operations().bot.receive(incoming({ callback: `edit:${job.id}` }), now);
    await operations().bot.receive(incoming({ text: "07:50", replyToMessageId: 3 }), now);
    expect((await planning.entry(OWNER, created.id, "2026-09-29"))?.entry).toMatchObject({
      value: "07:50",
      note: "keep this note",
    });
  });
  it("atomically accepts only one concurrent answer and never reapplies a processed command", async () => {
    const created = await goal();
    const base = {
      ownerId: OWNER,
      goalId: created.id,
      date: "2026-09-29",
      now,
      timeZone: DEFAULT_SETTINGS.timeZone,
      expectedRevision: null,
    };
    const outcomes = await Promise.all([
      planning.recordAnswer({ ...base, operationId: "a", value: { value: "07:00" } }),
      planning.recordAnswer({ ...base, operationId: "b", value: { value: "08:00" } }),
    ]);
    expect(outcomes.sort()).toEqual(["conflict", "saved"]);
    const existing = await planning.entry(OWNER, created.id, base.date);
    const original = existing?.revision as string;
    await planning.recordAnswer({
      ...base,
      expectedRevision: existing?.revision ?? null,
      operationId: "correction",
      value: { value: "09:00" },
    });
    await planning.recordAnswer({ ...base, operationId: original, value: { value: "07:00" } });
    expect((await planning.entry(OWNER, created.id, base.date))?.entry.value).toBe("09:00");
  });
  it("does not duplicate scheduled sends or snoozes on repeated updates", async () => {
    await goal();
    await Promise.all([
      operations().runReminders.execute({ now }),
      operations().runReminders.execute({ now }),
    ]);
    expect(sent).toHaveLength(1);
    const job = await firstJob();
    const snooze = incoming({ callback: `snooze:${job.id}` });
    await operations().bot.receive(snooze, now);
    await operations().bot.receive(snooze, now);
    await operations().runReminders.execute({ now: now + 29 * 60_000 });
    expect(sent).toHaveLength(1);
    await operations().runReminders.execute({ now: now + 30 * 60_000 });
    expect(sent).toHaveLength(2);
  });
  it("sends one evening digest, preserves button identities and updates it after answers", async () => {
    const first = await goal({ type: "check" }, "evening");
    const second = await goal({ type: "time" }, "evening");
    const evening = Date.parse("2026-09-29T16:00:00Z");
    await operations().runReminders.execute({ now: evening });
    expect(sent).toHaveLength(1);
    const digest = await firstJob();
    const initial = await repository.job(digest.id);
    const ids = JSON.parse(initial?.payload ?? "[]") as string[];
    await operations().bot.receive(
      incoming({ callback: `pick:${digest.id}:${ids.indexOf(first.id)}` }),
      evening,
    );
    vi.mocked(transport.edit).mockRejectedValueOnce(new Error("Message was deleted"));
    await operations().bot.receive(incoming({ text: "да", replyToMessageId: 2 }), evening);
    expect(transport.edit).toHaveBeenCalled();
    expect((await planning.entry(OWNER, first.id, "2026-09-29"))?.entry.value).toBe(true);
    const updated = await repository.job(digest.id);
    expect((JSON.parse(updated?.payload ?? "[]") as string[]).indexOf(second.id)).toBe(
      ids.indexOf(second.id),
    );
    await operations().bot.receive(
      incoming({ callback: `pick:${digest.id}:${ids.indexOf(second.id)}` }),
      evening,
    );
    expect(sent[2]?.message.text).toContain("time");
    await operations().bot.receive(incoming({ text: "07:40", replyToMessageId: 3 }), evening);
    expect(transport.edit).toHaveBeenLastCalledWith("123", 1, {
      text: "Всё заполнено · 2026-09-29",
    });
  });
  it("validates the current scale after its range changes while a question is open", async () => {
    const created = await goal({ type: "scale", min: 1, max: 5 });
    await operations().runReminders.execute({ now });
    await env.DB.prepare("UPDATE plan_goals SET tracking_config = ? WHERE id = ?")
      .bind(JSON.stringify({ type: "scale", min: 1, max: 3 }), created.id)
      .run();
    const invalid = await operations().bot.receive(
      incoming({ text: "5", replyToMessageId: 1 }),
      now,
    );
    expect(invalid?.text).toBe("Введите целое число от 1 до 3.");
    expect(await planning.entry(OWNER, created.id, "2026-09-29")).toBeNull();
    await operations().bot.receive(incoming({ text: "3", replyToMessageId: 1 }), now);
    expect((await planning.entry(OWNER, created.id, "2026-09-29"))?.entry.value).toBe(3);
  });
  it("retries 429, pauses blocked chats, and does not retry ambiguous sends", async () => {
    await goal();
    vi.mocked(transport.send).mockRejectedValueOnce(new DeliveryError("retry", 120));
    await operations().runReminders.execute({ now });
    expect((await firstJob()).status).toBe("pending");
    await operations().runReminders.execute({ now: now + 60_000 });
    expect(transport.send).toHaveBeenCalledTimes(1);
    vi.mocked(transport.send).mockRejectedValueOnce(new DeliveryError("unknown"));
    await operations().runReminders.execute({ now: now + 120_000 });
    expect((await firstJob()).status).toBe("unknown");
    await operations().runReminders.execute({ now: now + 180_000 });
    expect(transport.send).toHaveBeenCalledTimes(2);
    const other = await goal();
    await repository.saveReminder({
      goalId: other.id,
      ownerId: OWNER,
      mode: "scheduled",
      time: "09:00",
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      nextRunAt: now,
    });
    vi.mocked(transport.send).mockRejectedValueOnce(new DeliveryError("blocked"));
    await operations().runReminders.execute({ now: now + 240_000 });
    expect((await repository.link(OWNER))?.status).toBe("blocked");
  });
  it.each(["permanent", "unknown"] as const)(
    "expires the %s delivery warning after 24 hours without erasing or retrying the job",
    async (failure) => {
      await goal();
      vi.mocked(transport.send).mockRejectedValueOnce(new DeliveryError(failure));
      await operations().runReminders.execute({ now });
      const job = await firstJob();
      const day = 24 * 60 * 60 * 1000;

      expect(await operations().getState.execute({ ownerId: OWNER, now })).toMatchObject({
        deliveryIssues: 1,
      });
      expect(await operations().getState.execute({ ownerId: "another-owner", now })).toMatchObject({
        deliveryIssues: 0,
      });
      expect(
        await operations().getState.execute({ ownerId: OWNER, now: now + day - 1 }),
      ).toMatchObject({ deliveryIssues: 1 });
      expect(await operations().getState.execute({ ownerId: OWNER, now: now + day })).toMatchObject(
        { deliveryIssues: 0 },
      );
      expect(
        await operations().getState.execute({ ownerId: OWNER, now: now + 3 * day }),
      ).toMatchObject({ deliveryIssues: 0 });

      expect(await repository.job(job.id)).toMatchObject({
        status: failure === "unknown" ? "unknown" : "failed",
        attempts: 1,
      });
      await operations().runReminders.execute({ now: now + 60_000 });
      expect(transport.send).toHaveBeenCalledTimes(1);
    },
  );
  it("ignores other senders, arbitrary text, and questions after disconnect", async () => {
    await goal();
    await operations().runReminders.execute({ now });
    expect((await operations().bot.receive(incoming({ text: "07:40" }), now)).text).toContain(
      "конкретный вопрос",
    );
    expect(
      (
        await operations().bot.receive(
          incoming({ text: "07:40", replyToMessageId: 1, telegramUserId: "999" }),
          now,
        )
      ).text,
    ).toContain("подключите Telegram");
    await operations().disconnect.execute({ ownerId: OWNER });
    expect(
      (await operations().bot.receive(incoming({ text: "07:40", replyToMessageId: 1 }), now)).text,
    ).toContain("подключите Telegram");
  });
  it("requires confirmation of an expiring, one-use connection token", async () => {
    await operations().disconnect.execute({ ownerId: OWNER });
    const connection = await operations().connect.execute({ ownerId: OWNER, now });
    const token = new URL(connection.url).searchParams.get("start");
    const start = await operations().bot.receive(incoming({ text: `/start ${token}` }), now);
    expect(start.buttons?.[0]?.[0]?.data).toBe(`link:${token}`);
    expect(await repository.link(OWNER)).toBeNull();
    const responses = await Promise.all([
      operations().bot.receive(incoming({ callback: `link:${token}` }), now),
      operations().bot.receive(incoming({ callback: `link:${token}` }), now),
    ]);
    expect(
      responses.filter((response) => response.text.startsWith("Telegram подключён")),
    ).toHaveLength(1);
    const expired = await operations().connect.execute({ ownerId: OWNER, now });
    expect(
      (
        await operations().bot.receive(
          incoming({ text: `/start ${new URL(expired.url).searchParams.get("start")}` }),
          now + 600_001,
        )
      ).text,
    ).toContain("истекла");
  });
});

describe("reminder HTTP contracts", () => {
  it("enforces owner and Origin, and uses the saved timezone for planning dates", async () => {
    const origin = "https://planner.example";
    const token = "reminder-test-session";
    const realNow = Date.now();
    await env.DB.prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
      .bind(await sha256Base64Url(token), OWNER, realNow, realNow + 60_000)
      .run();
    const bindings = {
      ...env,
      AUTH_MODE: "telegram",
      APP_ORIGIN: origin,
      AUTH_SUCCESS_REDIRECT_URL: `${origin}/`,
      BUILD_REVISION: "test",
      TELEGRAM_BOT_MODE: "disabled",
      TELEGRAM_OIDC_CLIENT_ID: "123",
      TELEGRAM_OIDC_CLIENT_SECRET: "test-only",
      AUTH_FLOW_SECRET: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    } as unknown as CloudflareBindings;
    const app = createApp();
    const body = JSON.stringify({ ...DEFAULT_SETTINGS, timeZone: "America/Los_Angeles" });
    const request = (cookie = true, trusted = true) =>
      app.request(
        `${origin}/api/reminders/settings`,
        {
          method: "PUT",
          body,
          headers: {
            "Content-Type": "application/json",
            ...(cookie ? { Cookie: `__Host-session=${token}` } : {}),
            Origin: trusted ? origin : "https://other.example",
          },
        },
        bindings,
      );
    expect((await request(false)).status).toBe(401);
    expect((await request(true, false)).status).toBe(403);
    expect((await request()).status).toBe(200);
    const invalidSettings = await app.request(
      `${origin}/api/reminders/settings`,
      {
        method: "PUT",
        body: JSON.stringify({ ...DEFAULT_SETTINGS, timeZone: "Not/A_Timezone" }),
        headers: {
          "Content-Type": "application/json",
          Cookie: `__Host-session=${token}`,
          Origin: origin,
        },
      },
      bindings,
    );
    expect(invalidSettings.status).toBe(400);
    expect(await invalidSettings.json()).toMatchObject({
      code: "INVALID_REQUEST",
      detail: "Проверьте часовой пояс и время.",
    });
    const plan = await app.request(
      `${origin}/api/plans/2026-09`,
      { headers: { Cookie: `__Host-session=${token}` } },
      bindings,
    );
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(realNow));
    expect(((await plan.json()) as { today: string }).today).toBe(parts);
  });
});

describe("reminder runtime integration", () => {
  it("runs the Worker cron and accepts a real-shaped Telegram webhook through grammY", async () => {
    const created = await goal({ type: "check" });
    let messageId = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const endpoint = String(url);
        if (endpoint.endsWith("/getMe"))
          return Response.json({
            ok: true,
            result: { id: 321, is_bot: true, first_name: "Test", username: "planner_test_bot" },
          });
        if (endpoint.endsWith("/answerCallbackQuery"))
          return Response.json({ ok: true, result: true });
        if (endpoint.endsWith("/sendMessage"))
          return Response.json({
            ok: true,
            result: {
              message_id: ++messageId,
              date: 1,
              chat: { id: 123, type: "private" },
              text: "test",
            },
          });
        throw new Error("Unexpected Bot API method");
      }),
    );
    vi.setSystemTime(now);
    try {
      const runtime = await import("../src");
      const bindings = {
        ...env,
        AUTH_MODE: "disabled",
        APP_ORIGIN: "http://localhost:8787",
        AUTH_SUCCESS_REDIRECT_URL: "http://localhost:8787/",
        BUILD_REVISION: "local",
        TELEGRAM_BOT_MODE: "webhook",
        TELEGRAM_BOT_TOKEN: "321:runtime-test-token",
        TELEGRAM_BOT_WEBHOOK_SECRET: "runtime-test-secret",
      } as unknown as CloudflareBindings;
      // Cron only arms the durable executor. The entire due question is sent
      // by one alarm, including when hourly maintenance also runs.
      await configureReminderScheduler(bindings, "reminders", true);
      await runtime.default.scheduled(
        { scheduledTime: now, cron: "* * * * *", noRetry() {} },
        bindings,
      );
      expect(messageId).toBe(0);
      expect(await runDurableObjectAlarm(env.REMINDER_SCHEDULER.getByName("reminders"))).toBe(true);
      const job = await firstJob();
      expect(job.messageId).toBe(1);
      const response = await createApp().request(
        "http://localhost:8787/telegram/webhook",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Telegram-Bot-Api-Secret-Token": "runtime-test-secret",
          },
          body: JSON.stringify({
            update_id: 999,
            callback_query: {
              id: "cb",
              from: { id: 123, is_bot: false, first_name: "User" },
              chat_instance: "test",
              data: `value:${job.id}:yes`,
              message: { message_id: 1, date: 1, chat: { id: 123, type: "private" } },
            },
          }),
        },
        bindings,
      );
      expect(response.status).toBe(200);
      expect((await planning.entry(OWNER, created.id, "2026-09-29"))?.entry.value).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
  it("postpones quiet-hour sends with the original date and skips goals from another month", async () => {
    const created = await goal();
    const late = Date.parse("2026-09-29T19:00:00Z");
    await repository.saveReminder({
      goalId: created.id,
      ownerId: OWNER,
      mode: "scheduled",
      time: "00:00",
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      nextRunAt: late,
    });
    await operations().runReminders.execute({ now: late });
    expect(sent).toHaveLength(0);
    await operations().runReminders.execute({ now: Date.parse("2026-09-30T03:00:00Z") });
    // The digest and question share a send time; Cron drains one message per minute.
    await operations().runReminders.execute({ now: Date.parse("2026-09-30T03:01:00Z") });
    expect(sent.length).toBeGreaterThan(0);
    const questions = await env.DB.prepare(
      "SELECT local_date FROM reminder_jobs WHERE goal_id = ? AND status = 'sent'",
    )
      .bind(created.id)
      .all<{ local_date: string }>();
    expect(questions.results[0]?.local_date).toBe("2026-09-30"); // midnight event belongs to Sep 30
    const other = await new CreateGoalUseCase(planningRepository).execute({
      ownerId: OWNER,
      month: "2026-10",
      title: "Future",
      tracking: { type: "check" },
      cadence: { period: "day" },
      now,
    });
    await operations().saveGoalReminder.execute({
      ownerId: OWNER,
      goalId: other.id,
      input: { mode: "scheduled", time: "09:00", weekdays: [1, 2, 3, 4, 5, 6, 7] },
      now: now - 60_000,
    });
    const before = sent.length;
    await operations().runReminders.execute({ now });
    expect(sent).toHaveLength(before);
  });
  it("recovers a crashed delivery as unknown and cancels pending work when disabled", async () => {
    await goal();
    await operations().runReminders.execute({ now });
    const job = await firstJob();
    await repository.updateJob(job.id, { status: "sending", leaseUntil: now - 1 });
    await operations().runReminders.execute({ now });
    expect((await repository.job(job.id))?.status).toBe("unknown");
    expect(sent).toHaveLength(1);
    await repository.updateJob(job.id, { status: "pending" });
    await operations().saveSettings.execute({
      ownerId: OWNER,
      input: { ...DEFAULT_SETTINGS, enabled: false },
      now,
    });
    await operations().runReminders.execute({ now });
    expect((await repository.job(job.id))?.status).toBe("cancelled");
    expect(sent).toHaveLength(1);
  });
});
