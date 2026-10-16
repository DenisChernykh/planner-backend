import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runReminders } from "../src/app/run-reminders";
import { CreateGoalUseCase } from "../src/modules/planning/application/goals/create-goal.use-case";
import { D1PlanningRepository } from "../src/modules/planning/infrastructure/d1-planning-repository";
import { createProgressOperations } from "../src/modules/progress";
import { createReminderOperations } from "../src/modules/reminders";
import { DEFAULT_SETTINGS } from "../src/modules/reminders/domain/model";
import {
  nextReportOccurrence,
  type ReportInput,
  reportWeek,
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

const firstJob = async () => {
  const job = (await jobs()).results[0];
  if (!job) throw new Error("Missing report job");
  return job;
};

const deliverQueued = async (id: string, now: number) => {
  const job = (await repository.recoverAndDue(now)).find((candidate) => candidate.id === id);
  if (!job) throw new Error("Missing queued report");
  await operations().reports.deliver(id, now, true, job);
};

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
  it("preserves original Monday event keys across month and year boundaries", () => {
    expect(reportWeek("2027-01-03")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
    expect(reportWeek("2027-01-04")).toEqual({ from: "2027-01-04", to: "2027-01-10" });
    expect(
      nextReportOccurrence(Date.parse("2026-10-03T14:00:00Z"), "Australia/Lord_Howe", "02:15", 7),
    ).toBe(Date.parse("2026-10-03T15:30:00Z"));
  });
  it("uses the first valid minute after a spring gap and one occurrence during fall back", () => {
    expect(
      nextReportOccurrence(Date.parse("2026-03-29T00:00:00Z"), "Europe/Berlin", "02:30", 7),
    ).toBe(Date.parse("2026-03-29T01:00:00Z"));
    expect(
      nextReportOccurrence(Date.parse("2026-10-25T00:45:00Z"), "Europe/Berlin", "02:30", 7),
    ).toBe(Date.parse("2026-11-01T01:30:00Z"));
    expect(
      nextReportOccurrence(Date.parse("2026-03-29T01:15:00Z"), "Europe/Berlin", "02:30", 7),
    ).toBe(Date.parse("2026-04-05T00:30:00Z"));
  });
  it("schedules strictly after saving, without replaying past slots", async () => {
    const state = await save({}, NOW);
    expect(state.settings.nextWednesdayAt).toBe(Date.parse("2026-10-14T16:00:00Z"));
    await operations().runReminders.execute({ now: NOW });
    expect(transport.send).not.toHaveBeenCalled();
  });
});

describe("progress reports with D1 and fake transport", () => {
  it("freezes report facts before rendering and sends once after concurrent staged ticks", async () => {
    await save();
    const reports = operations().reports;
    await reports.schedule(NOW);
    const id = (await jobs()).results[0]?.id as string;
    await reports.deliver(id, NOW, true);
    expect(JSON.parse((await jobs()).results[0]?.payload ?? "[]").version).toBe(5);
    await reports.deliver(id, NOW + 60_000, true);
    const captured = JSON.parse((await jobs()).results[0]?.payload ?? "[]");
    expect(captured.version).toBe(6);
    expect(captured.sourceReportRevision).toBe(-1);
    expect(captured.sourceProgressRevision).toBe(-1);
    expect(captured.calculation.sources[0].entries[0].met).toBeUndefined();
    expect(JSON.stringify(captured.calculation)).not.toContain("private note");
    expect(captured.reportRevision).toBe(-1);
    expect(captured.progressRevision).toBe(-1);
    expect(transport.send).not.toHaveBeenCalled();
    await planning.upsertEntry({
      goalId,
      date: "2026-10-07",
      value: 35,
      met: true,
      note: null,
      createdAt: NOW + 1,
      updatedAt: NOW + 1,
    });
    await Promise.all([
      reports.deliver(id, NOW + 120_000, true),
      reports.deliver(id, NOW + 120_000, true),
    ]);
    expect(JSON.parse((await jobs()).results[0]?.payload ?? "[]").version).toBe(8);
    await reports.deliver(id, NOW + 180_000, true);
    expect(JSON.parse((await jobs()).results[0]?.payload ?? "[]").version).toBe(4);
    await reports.deliver(id, NOW + 240_000, true);
    const rendered = JSON.parse((await jobs()).results[0]?.payload ?? "[]");
    expect(rendered.version).toBe(1);
    expect(rendered.formedAt).toBe(NOW + 60_000);
    expect(rendered.message.text).toContain("25 страниц за период");
    expect(rendered.message.text).not.toContain("60 страниц за период");
    expect(transport.send).not.toHaveBeenCalled();
    await Promise.all([
      reports.deliver(id, NOW + 300_000, true),
      reports.deliver(id, NOW + 300_000, true),
    ]);
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect((await jobs()).results[0]?.status).toBe("sent");
  });
  it("resumes bounded calculations across fresh runners and concurrent ticks with frozen facts", async () => {
    const selected = [{ goalId, included: true }];
    for (let index = 0; index < 8; index++) {
      const goal = await new CreateGoalUseCase(planning).execute({
        ownerId: OWNER,
        month: "2026-10",
        title: `Goal ${index}`,
        tracking: { type: "check" },
        cadence: { period: "week", targetOccurrences: 4 },
        now: NOW,
      });
      selected.push({ goalId: goal.id, included: true });
      if (index === 0)
        await planning.upsertEntry({
          goalId: goal.id,
          date: "2026-10-07",
          value: false,
          met: false,
          note: null,
          createdAt: NOW,
          updatedAt: NOW,
        });
    }
    await save({ goals: selected });
    await operations().reports.schedule(NOW);
    const id = (await firstJob()).id;
    await deliverQueued(id, NOW);
    await deliverQueued(id, NOW + 60_000);
    const expected = await operations().reports.preview({
      ownerId: OWNER,
      input: input({ goals: selected }),
      slot: "wed",
      now: NOW + 60_000,
    });
    await planning.upsertEntry({
      goalId,
      date: "2026-10-07",
      value: 35,
      met: true,
      note: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    for (let step = 2; step <= 10; step++) {
      await Promise.all([
        deliverQueued(id, NOW + step * 60_000),
        deliverQueued(id, NOW + step * 60_000),
      ]);
      const state = JSON.parse((await firstJob()).payload);
      expect(state.version).toBe(step === 10 ? 8 : 7);
      expect(state.goals.length).toBe(step - 1);
      expect(transport.send).not.toHaveBeenCalled();
    }
    await deliverQueued(id, NOW + 11 * 60_000);
    expect(JSON.parse((await firstJob()).payload).version).toBe(4);
    await deliverQueued(id, NOW + 12 * 60_000);
    const ready = JSON.parse((await firstJob()).payload);
    expect(ready.version).toBe(1);
    expect(ready.message.blocks).toBeUndefined();
    expect(ready.message.text).toBe(expected.message?.text);
    expect(ready.message.html).toBe(expected.message?.html);
    await Promise.all([deliverQueued(id, NOW + 13 * 60_000), deliverQueued(id, NOW + 13 * 60_000)]);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
  it.each([6, 8, 4, 1])(
    "invalidates persisted phase %s after report settings change",
    async (version) => {
      await save();
      await operations().reports.schedule(NOW);
      const id = (await firstJob()).id;
      let step = 0;
      while (JSON.parse((await firstJob()).payload).version !== version) {
        expect(step).toBeLessThan(6);
        await deliverQueued(id, NOW + step++ * 60_000);
      }
      const stale = (await repository.recoverAndDue(NOW + step * 60_000))[0];
      await env.DB.prepare(
        "UPDATE progress_report_settings SET revision = revision + 1 WHERE owner_id = ?",
      )
        .bind(OWNER)
        .run();
      await deliverQueued(id, NOW + step * 60_000);
      expect(JSON.parse((await firstJob()).payload).version).toBe(5);
      await operations().reports.deliver(id, NOW + step * 60_000, true, stale);
      expect(JSON.parse((await firstJob()).payload).version).toBe(5);
      expect(transport.send).not.toHaveBeenCalled();
    },
  );
  it("resets a stale ready selection without sending on claim failure", async () => {
    await save();
    await operations().reports.schedule(NOW);
    const id = (await firstJob()).id;
    for (let step = 0; step < 5; step++)
      await operations().reports.deliver(id, NOW + step * 60_000, true);
    expect(JSON.parse((await firstJob()).payload).version).toBe(1);
    await env.DB.prepare("UPDATE goal_progress_reports SET included = 0 WHERE owner_id = ?")
      .bind(OWNER)
      .run();
    await operations().reports.deliver(id, NOW + 5 * 60_000, true);
    expect((await firstJob()).payload).toBe("[]");
    expect(transport.send).not.toHaveBeenCalled();
    await operations().reports.deliver(id, NOW + 6 * 60_000, true);
    expect((await firstJob()).status).toBe("cancelled");
  });
  it.each(["quantity", "time"] as const)(
    "preserves the last %s record when projecting the formatting stage",
    async (type) => {
      const goal = await new CreateGoalUseCase(planning).execute({
        ownerId: OWNER,
        month: "2026-10",
        title: "Last record",
        tracking:
          type === "quantity"
            ? { type: "quantity", comparison: "atLeast", targetValue: 20 }
            : { type: "time" },
        cadence: { period: "day" },
        now: NOW,
      });
      for (const [date, value] of [
        ["2026-10-06", type === "quantity" ? 25 : "23:30"],
        ["2026-10-07", type === "quantity" ? 0 : "00:00"],
      ] as const)
        await planning.upsertEntry({
          goalId: goal.id,
          date,
          value,
          met: false,
          note: null,
          createdAt: NOW,
          updatedAt: NOW,
        });
      const changes = { goals: [{ goalId: goal.id, included: true }] };
      await save(changes);
      await operations().reports.schedule(NOW);
      const id = (await firstJob()).id;
      await deliverQueued(id, NOW);
      await deliverQueued(id, NOW + 60_000);
      const expected = await operations().reports.preview({
        ownerId: OWNER,
        input: input(changes),
        slot: "wed",
        now: NOW + 60_000,
      });
      for (let step = 2; step <= 4; step++) await deliverQueued(id, NOW + step * 60_000);
      const ready = JSON.parse((await firstJob()).payload);
      expect(ready.message.text).toBe(expected.message?.text);
      expect(ready.message.html).toBe(expected.message?.html);
      expect(ready.message.text).toContain(type === "quantity" ? "7 октября: 0" : "00:00");
    },
  );
  it("captures owner-scoped cross-month raw sources with preview parity and recalculates stale stored met flags", async () => {
    const foreignOwner = "b48d9caf-003d-4fc9-94ed-dfca2d105d40";
    await env.DB.prepare("INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)")
      .bind(foreignOwner, NOW, NOW)
      .run();
    await new CreateGoalUseCase(planning).execute({
      ownerId: foreignOwner,
      month: "2026-10",
      title: "Foreign private goal",
      tracking: { type: "check" },
      cadence: { period: "day" },
      now: NOW,
    });
    const excluded = await new CreateGoalUseCase(planning).execute({
      ownerId: OWNER,
      month: "2026-10",
      title: "Excluded",
      tracking: { type: "check" },
      cadence: { period: "day" },
      now: NOW,
    });
    await save({
      startsOn: null,
      goals: [
        { goalId, included: true },
        { goalId: excluded.id, included: false },
      ],
    });
    const at = Date.parse("2026-11-01T16:00:00Z");
    await operations().prepareCurrentPlan.execute({ ownerId: OWNER, now: at });
    const november = await planning.progressSources(OWNER, "2026-11", "2026-11");
    const copy = november.find((goal) => goal.title === "Чтение * _");
    if (!copy) throw new Error("Missing November copy");
    for (const [id, date] of [
      [goalId, "2026-10-28"],
      [copy.id, "2026-11-01"],
    ] as const) {
      await planning.upsertEntry({
        goalId: id,
        date,
        value: 25,
        met: true,
        note: "private note",
        createdAt: at,
        updatedAt: at,
      });
      await env.DB.prepare("UPDATE plan_goals SET tracking_config = ? WHERE id = ?")
        .bind(
          JSON.stringify({
            type: "quantity",
            comparison: "atLeast",
            targetValue: 30,
            unit: "страниц",
          }),
          id,
        )
        .run();
    }
    await operations().reports.save({
      ownerId: OWNER,
      input: input({
        month: "2026-11",
        startsOn: null,
        goals: [{ goalId: copy.id, included: true }],
      }),
      now: at - 60_000,
    });
    await env.DB.prepare(
      "UPDATE progress_report_settings SET next_sunday_at = ?, next_wednesday_at = ? WHERE owner_id = ?",
    )
      .bind(at, at + 7 * 86_400_000, OWNER)
      .run();
    await operations().reports.schedule(at);
    const id = (await firstJob()).id;
    await deliverQueued(id, at);
    await deliverQueued(id, at + 60_000);
    const raw = JSON.parse((await firstJob()).payload);
    expect(raw.version).toBe(6);
    expect(raw.calculation.sources).toHaveLength(2);
    expect(raw.calculation.knownSources).toHaveLength(4);
    expect(
      new Set(raw.calculation.sources.map((goal: { chainId: string }) => goal.chainId)),
    ).toEqual(new Set([goalId]));
    expect(JSON.stringify(raw.calculation)).not.toContain("Foreign private");
    expect(JSON.stringify(raw.calculation)).not.toContain("private note");
    const expected = await operations().reports.preview({
      ownerId: OWNER,
      input: input({
        month: "2026-11",
        startsOn: null,
        goals: [{ goalId: copy.id, included: true }],
      }),
      slot: "sun",
      now: at + 60_000,
    });
    expect(expected.overview.summary.met).toBe(0);
    // The event is a Sunday slot and must render the same full cross-month week.
    for (let step = 2; step <= 4; step++) await deliverQueued(id, at + step * 60_000);
    const ready = JSON.parse((await firstJob()).payload);
    expect(ready.version).toBe(1);
    expect(ready.message.text).toBe(expected.message?.text);
    expect(ready.message.html).toBe(expected.message?.html);
    expect(transport.send).not.toHaveBeenCalled();
  });
  it.each([6, 7, 8])(
    "never claims raw/intermediate version %s even with current revisions and makes rollback rebuild",
    async (version) => {
      const extra = await new CreateGoalUseCase(planning).execute({
        ownerId: OWNER,
        month: "2026-10",
        title: "Second",
        tracking: { type: "check" },
        cadence: { period: "day" },
        now: NOW,
      });
      await save({
        goals: [
          { goalId, included: true },
          { goalId: extra.id, included: true },
        ],
      });
      await operations().reports.schedule(NOW);
      const id = (await firstJob()).id;
      let step = 0;
      while (JSON.parse((await firstJob()).payload).version !== version) {
        expect(step).toBeLessThan(5);
        await operations().reports.deliver(id, NOW + step++ * 60_000, true);
      }
      const reportStore = new D1ProgressReportRepository(env.DB);
      const report = await reportStore.settings(OWNER);
      const shared = await createProgressOperations(env.DB).settings(OWNER);
      const state = JSON.parse((await firstJob()).payload);
      expect(state.sourceReportRevision).toBe(-1);
      expect(state.sourceProgressRevision).toBe(-1);
      expect(state.capturedReportRevision).toBe(report.revision);
      expect(state.capturedProgressRevision).toBe(shared.revision);
      const job = await repository.job(id);
      if (!job) throw new Error("Missing report job");
      expect(
        await reportStore.claim(
          job,
          await repository.settings(OWNER),
          report.revision,
          shared.revision,
          "123",
          NOW + step * 60_000,
        ),
      ).toBe(false);
      expect((await repository.job(id))?.attempts).toBe(0);
      expect(transport.send).not.toHaveBeenCalled();
    },
  );
  it.each([2, 3])(
    "resumes legacy version %s without mixing facts or sending twice",
    async (version) => {
      const extra = await new CreateGoalUseCase(planning).execute({
        ownerId: OWNER,
        month: "2026-10",
        title: "Second",
        tracking: { type: "check" },
        cadence: { period: "day" },
        now: NOW,
      });
      const selected = [
        { goalId, included: true },
        { goalId: extra.id, included: true },
      ];
      await save({ goals: selected });
      await operations().reports.schedule(NOW);
      const id = (await firstJob()).id;
      await operations().reports.deliver(id, NOW, true);
      await operations().reports.deliver(id, NOW + 60_000, true);
      const raw = JSON.parse((await firstJob()).payload);
      const progress = createProgressOperations(env.DB);
      const calculation = await progress.prepareOverview({
        ownerId: OWNER,
        period: "week",
        anchor: "2026-10-07",
        today: "2026-10-07",
        now: NOW,
        timeZone: DEFAULT_SETTINGS.timeZone,
        startsOn: "2026-10-06",
        goalIds: selected.map((goal) => goal.goalId),
        includeHistory: false,
      });
      const legacy = {
        ...raw,
        version,
        formedAt: NOW,
        sourceReportRevision: raw.capturedReportRevision,
        sourceProgressRevision: raw.capturedProgressRevision,
        calculation,
        ...(version === 3
          ? { offset: 1, goals: progress.calculateReportBatch(calculation, 0, 1).goals }
          : {}),
      };
      await new D1ProgressReportRepository(env.DB).setSnapshot(
        id,
        (await firstJob()).payload,
        JSON.stringify(legacy),
      );
      await planning.upsertEntry({
        goalId,
        date: "2026-10-07",
        value: 35,
        met: true,
        note: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
      let step = 2;
      while (JSON.parse((await firstJob()).payload).version !== 1) {
        expect(step).toBeLessThan(9);
        await operations().reports.deliver(id, NOW + step++ * 60_000, true);
      }
      const ready = JSON.parse((await firstJob()).payload);
      expect(ready.formedAt).toBe(NOW);
      expect(ready.message.text).toContain("25 страниц за период");
      expect(ready.message.text).not.toContain("60 страниц за период");
      await Promise.all([
        operations().reports.deliver(id, NOW + step * 60_000, true),
        operations().reports.deliver(id, NOW + step * 60_000, true),
      ]);
      expect(transport.send).toHaveBeenCalledTimes(1);
    },
  );
  it("recaptures staged input after a report revision changes before rendering", async () => {
    await save();
    const reports = operations().reports;
    await reports.schedule(NOW);
    const id = (await jobs()).results[0]?.id as string;
    await reports.deliver(id, NOW, true);
    const previous = JSON.parse((await jobs()).results[0]?.payload ?? "[]");
    // Simulate a concurrent revision change while retaining the old payload.
    await env.DB.prepare(
      "UPDATE progress_settings SET starts_on = '2026-10-07', revision = revision + 1 WHERE owner_id = ?",
    )
      .bind(OWNER)
      .run();
    await reports.deliver(id, NOW + 60_000, true);
    const current = JSON.parse((await jobs()).results[0]?.payload ?? "[]");
    expect(current.version).toBe(5);
    expect(current.sourceProgressRevision).toBe(previous.sourceProgressRevision + 1);
    await reports.deliver(id, NOW + 120_000, true);
    expect(JSON.parse((await jobs()).results[0]?.payload ?? "[]").calculation.startsOn).toBe(
      "2026-10-07",
    );
    expect(transport.send).not.toHaveBeenCalled();
  });
  it.each(["report", "timezone", "quiet-hours", "selection"] as const)(
    "rechecks %s before using captured report facts",
    async (change) => {
      await save();
      const reports = operations().reports;
      await reports.schedule(NOW);
      const id = (await jobs()).results[0]?.id as string;
      await reports.deliver(id, NOW, true);
      const writes = {
        report: "UPDATE progress_report_settings SET revision = revision + 1 WHERE owner_id = ?",
        timezone: "UPDATE reminder_settings SET time_zone = 'UTC' WHERE owner_id = ?",
        "quiet-hours": "UPDATE reminder_settings SET quiet_start = '22:00' WHERE owner_id = ?",
        selection: "UPDATE goal_progress_reports SET included = 0 WHERE owner_id = ?",
      };
      await env.DB.prepare(writes[change]).bind(OWNER).run();
      await reports.deliver(id, NOW + 60_000, true);
      const job = (await jobs()).results[0];
      expect(transport.send).not.toHaveBeenCalled();
      if (change === "selection") expect(job?.status).toBe("cancelled");
      else {
        const payload = JSON.parse(job?.payload ?? "[]");
        expect(payload.version).toBe(5);
        expect(payload.formedAt).toBe(NOW + 60_000);
      }
    },
  );
  it("production Cron persists a report before sending on a later tick and reuses only wiring", async () => {
    await save();
    const send = vi.fn(async () => Response.json({ ok: true, result: { message_id: 10 } }));
    vi.stubGlobal("fetch", send);
    const bindings = {
      ...env,
      AUTH_MODE: "disabled",
      APP_ORIGIN: "https://example.com",
      AUTH_SUCCESS_REDIRECT_URL: "https://example.com/",
      BUILD_REVISION: "local",
      TELEGRAM_BOT_MODE: "webhook",
      TELEGRAM_BOT_TOKEN: "123:local-test-only",
      TELEGRAM_BOT_WEBHOOK_SECRET: "local-test-only",
    } as unknown as CloudflareBindings;
    try {
      await runReminders(bindings, NOW);
      expect((await jobs()).results).toHaveLength(0);
      expect(send).not.toHaveBeenCalled();
      await runReminders(bindings, NOW + 60_000);
      const [prepared] = (await jobs()).results;
      expect(prepared?.status).toBe("pending");
      expect(prepared?.payload).toBe("[]");
      expect(send).not.toHaveBeenCalled();
      for (const [step, version] of [5, 6, 8, 4, 1].entries()) {
        await runReminders(bindings, NOW + (step + 2) * 60_000);
        expect(JSON.parse((await jobs()).results[0]?.payload ?? "[]").version).toBe(version);
        expect(send).not.toHaveBeenCalled();
      }
      await runReminders(bindings, NOW + 420_000);
      expect((await jobs()).results[0]?.status).toBe("sent");
      await runReminders(bindings, NOW + 480_000);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("honors report settings changed between preparation and delivery", async () => {
    await save();
    const runner = operations();
    await runner.runReminders.execute({ now: NOW, deferNewReportSnapshot: true });
    expect((await jobs()).results[0]?.status).toBe("pending");
    await save({ enabled: false }, NOW + 30_000);
    await runner.runReminders.execute({ now: NOW + 60_000, deferNewReportSnapshot: true });
    expect(transport.send).not.toHaveBeenCalled();
    expect((await jobs()).results[0]?.status).toBe("cancelled");
  });

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
