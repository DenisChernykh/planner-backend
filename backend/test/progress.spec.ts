import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src";
import { createPlanningOperations, type GoalTracking } from "../src/modules/planning";
import { CreateGoalUseCase } from "../src/modules/planning/application/goals/create-goal.use-case";
import { UpdateGoalUseCase } from "../src/modules/planning/application/goals/update-goal.use-case";
import { calculateMet } from "../src/modules/planning/domain/rules";
import { D1PlanningRepository } from "../src/modules/planning/infrastructure/d1-planning-repository";
import { createProgressOperations } from "../src/modules/progress";
import { calculateProgress } from "../src/modules/progress/domain/calculate";
import type { ProgressSource } from "../src/modules/progress/domain/model";
import { reportMessage } from "../src/modules/reminders/application/reports/report-message";

const OWNER = "c5e7a036-50a6-4c56-90a1-59b3d212b44a";
const OTHER = "cdbe1eba-d2d5-4db3-b636-1b3237756f1a";
const NOW = Date.parse("2026-10-07T16:00:00Z");
const tracking: GoalTracking = {
  type: "quantity",
  unit: "страниц",
  comparison: "atLeast",
  targetValue: 20,
};
const source = (changes: Partial<ProgressSource> = {}): ProgressSource => ({
  id: "one",
  chainId: "one",
  month: "2026-10",
  title: "Чтение",
  tracking,
  cadence: { period: "day" },
  entries: [],
  ...changes,
});
const entries = (
  values: Record<string, boolean | number | string>,
  rule: GoalTracking = tracking,
) =>
  Object.entries(values).map(([date, value]) => ({ date, value, met: calculateMet(rule, value) }));
const overview = (
  sources: ProgressSource[],
  changes: Partial<Parameters<typeof calculateProgress>[0]> = {},
) =>
  calculateProgress({
    sources,
    period: "week",
    anchor: "2026-10-07",
    today: "2026-10-07",
    startsOn: "2026-10-06",
    asOf: NOW,
    timeZone: "Asia/Yekaterinburg",
    ...changes,
  });

describe("progress calculations", () => {
  it.each(["2026-10-27", "2026-11-04", null])(
    "keeps compact batched report output across changed month definitions and start %s",
    (startsOn) => {
      const rules: GoalTracking[] = [
        { type: "check" },
        tracking,
        { type: "scale", min: 1, max: 10 },
        { type: "time", targetEnd: "09:00" },
      ];
      const sources: ProgressSource[] = [];
      for (let index = 0; index < 8; index++)
        for (const month of ["2026-10", "2026-11"]) {
          const rule = rules[index % 4] as GoalTracking;
          const value = rule.type === "check" ? true : rule.type === "time" ? "08:00" : 5;
          sources.push(
            source({
              id: `${index}:${month}`,
              chainId: `chain:${index}`,
              month,
              title: `Goal ${index}`,
              tracking:
                month === "2026-11" && index === 1 ? { ...tracking, targetValue: 30 } : rule,
              cadence:
                index % 3 === 0
                  ? { period: "day" }
                  : { period: index % 3 === 1 ? "week" : "month", targetOccurrences: 4 },
              entries: entries({ [`${month}-${month === "2026-10" ? "27" : "01"}`]: value }, rule),
            }),
          );
        }
      const input = {
        sources,
        knownSources: sources.map(({ chainId, month }) => ({ chainId, month })),
        period: "week" as const,
        anchor: "2026-11-01",
        today: "2026-11-01",
        startsOn,
        asOf: NOW,
        timeZone: "Asia/Yekaterinburg",
        includeHistory: false,
      };
      const progress = createProgressOperations(env.DB);
      const goals = [];
      let offset = 0;
      for (let step = 0; step < 4; step++) {
        const batch = progress.calculateReportBatch(JSON.parse(JSON.stringify(input)), offset, 4);
        expect(batch.goals.length).toBeLessThanOrEqual(4);
        goals.push(...JSON.parse(JSON.stringify(batch.goals)));
        offset = batch.nextOffset;
        if (batch.done) break;
      }
      const compact = progress.completeOverview(input, goals);
      const full = calculateProgress(input);
      expect(compact.summary).toEqual(full.summary);
      expect(compact.goals.map((goal) => goal.goalIds)).toEqual(
        full.goals.map((goal) => goal.goalIds),
      );
      expect(reportMessage(compact, "sun", "https://example.com")).toEqual(
        reportMessage(full, "sun", "https://example.com"),
      );
    },
  );
  it("omits unused report history without changing totals, targets or comparisons", () => {
    const sources = [
      source({
        cadence: { period: "week", targetOccurrences: 4 },
        entries: entries({
          "2026-10-06": 25,
          "2026-10-14": 25,
          "2026-10-20": 25,
          "2026-10-27": 25,
        }),
      }),
    ];
    const query = { anchor: "2026-10-28", today: "2026-10-28", startsOn: null };
    const full = overview(sources, query);
    expect(full.goals[0]?.history.length).toBeGreaterThan(0);
    expect(overview(sources, { ...query, includeHistory: false })).toEqual({
      ...full,
      goals: full.goals.map((goal) => ({ ...goal, history: [] })),
    });
  });
  it("includes the start date and excludes earlier entries without converting missing values to zero", () => {
    const result = overview([
      source({ entries: entries({ "2026-10-05": 100, "2026-10-06": 25, "2026-10-07": 30 }) }),
    ]);
    expect(result.goals[0]).toMatchObject({
      eligibleDays: 2,
      records: 2,
      met: 2,
      sum: 55,
      average: 27.5,
      comparison: null,
    });
    expect(result.goals[0]?.targets[0]).toMatchObject({ value: 2, target: 2, percent: 100 });
    expect(result.goals[0]?.days.map((day) => day.state)).toEqual([
      "excluded",
      "met",
      "met",
      "future",
      "future",
      "future",
      "future",
    ]);
  });
  it("distinguishes 4 successes, a recorded failure and one missing day", () => {
    const result = overview(
      [
        source({
          tracking: { type: "check" },
          entries: entries(
            {
              "2026-10-06": true,
              "2026-10-07": true,
              "2026-10-08": false,
              "2026-10-09": true,
              "2026-10-10": true,
            },
            { type: "check" },
          ),
        }),
      ],
      { today: "2026-10-11" },
    );
    expect(result.summary).toMatchObject({
      met: 4,
      dailyRecords: 5,
      dailyDays: 6,
      dailyPercent: 83,
    });
    expect(result.goals[0]).toMatchObject({ records: 5, missing: 1, completeness: 83 });
    expect(result.goals[0]?.targets[0]?.percent).toBe(67);
  });
  it("keeps a zero in the numeric average and supports atMost and equality rules", () => {
    for (const comparison of ["atMost", "equal"] as const) {
      const rule: GoalTracking = { type: "quantity", comparison, targetValue: 0 };
      const goal = overview([
        source({ tracking: rule, entries: entries({ "2026-10-06": 0, "2026-10-07": 4 }, rule) }),
      ]).goals[0];
      expect(goal).toMatchObject({ records: 2, met: 1, average: 2, sum: 4 });
    }
  });
  it("counts scales and unbounded time as observations, without adding successful completions", () => {
    const scale: GoalTracking = { type: "scale", min: 1, max: 5 };
    const result = overview([
      source({ tracking: scale, entries: entries({ "2026-10-06": 1, "2026-10-07": 5 }, scale) }),
      source({
        id: "time",
        chainId: "time",
        tracking: { type: "time" },
        entries: entries({ "2026-10-06": "23:50", "2026-10-07": "00:10" }, { type: "time" }),
      }),
    ]);
    expect(result.summary.met).toBe(0);
    expect(result.goals[0]).toMatchObject({ average: 3, records: 2, measurable: false });
    expect(result.goals[1]).toMatchObject({ average: null, records: 2, measurable: false });
  });
  it("uses planning's time rule for an interval across midnight", () => {
    const rule: GoalTracking = { type: "time", targetStart: "23:00", targetEnd: "01:00" };
    expect(
      overview([
        source({
          tracking: rule,
          entries: entries({ "2026-10-06": "23:50", "2026-10-07": "00:10" }, rule),
        }),
      ]).goals[0]?.met,
    ).toBe(2);
  });
  it("reduces a monthly plan once, while retaining the original target", () => {
    const result = overview([source({ cadence: { period: "month", targetOccurrences: 20 } })], {
      period: "month",
    });
    expect(result.goals[0]?.targets[0]).toMatchObject({
      originalTarget: 20,
      target: 17,
      reduced: true,
      accounted: { from: "2026-10-06", to: "2026-10-31" },
    });
  });
  it("retains a weekly plan in midweek and reports overflow without losing the numerator", () => {
    const result = overview(
      [
        source({
          cadence: { period: "week", targetOccurrences: 3 },
          entries: entries({
            "2026-10-06": 20,
            "2026-10-07": 20,
            "2026-10-08": 20,
            "2026-10-09": 20,
          }),
        }),
      ],
      { today: "2026-10-09" },
    );
    expect(result.goals[0]?.targets[0]).toMatchObject({
      value: 4,
      target: 3,
      percent: 133,
      overflow: 1,
    });
  });
  it("has no percentage or zero statistics for a future start and a period before the start", () => {
    expect(overview([source()], { startsOn: "2026-10-12" })).toMatchObject({
      state: "future-start",
      actual: null,
    });
    expect(overview([source()], { anchor: "2026-09-14", startsOn: "2026-10-06" })).toMatchObject({
      state: "before-start",
      actual: null,
    });
    expect(overview([source()], { startsOn: "2026-10-12" }).goals[0]?.targets).toEqual([]);
  });
  it("restores earlier history when the start is cleared", () => {
    expect(
      overview([source({ entries: entries({ "2026-10-05": 100 }) })], { startsOn: null }).goals[0]
        ?.sum,
    ).toBe(100);
  });
  it("distinguishes an explicitly unselected future version from an unprepared month", () => {
    const september = source({
      id: "sep",
      chainId: "chain",
      month: "2026-09",
      cadence: { period: "week", targetOccurrences: 3 },
    });
    const october = source({
      id: "oct",
      chainId: "chain",
      cadence: { period: "week", targetOccurrences: 3 },
    });
    expect(
      overview([september], {
        anchor: "2026-09-30",
        today: "2026-09-30",
        startsOn: null,
        knownSources: [september, october],
      }).goals[0]?.targets[0],
    ).toMatchObject({
      target: 2,
      missingPlan: false,
      accounted: { from: "2026-09-28", to: "2026-09-30" },
    });
  });
  it("merges compatible carried versions across months and rounds once", () => {
    const goals = [
      source({
        id: "sep",
        chainId: "root",
        month: "2026-09",
        cadence: { period: "week", targetOccurrences: 3 },
        entries: entries({ "2026-09-30": 20 }),
      }),
      source({
        id: "oct",
        chainId: "root",
        cadence: { period: "week", targetOccurrences: 3 },
        entries: entries({ "2026-10-01": 20 }),
      }),
    ];
    const result = overview(goals, { anchor: "2026-10-01", startsOn: null });
    expect(result.goals).toHaveLength(1);
    expect(result.goals[0]?.targets[0]).toMatchObject({ value: 2, target: 3 });
    expect(
      overview([...goals, source({ id: "same-title", chainId: "another" })], {
        anchor: "2026-10-01",
        startsOn: null,
      }).goals,
    ).toHaveLength(2);
    expect(
      overview(
        [
          goals[0] as ProgressSource,
          { ...(goals[1] as ProgressSource), cadence: { period: "week", targetOccurrences: 4 } },
        ],
        { anchor: "2026-10-01", startsOn: null },
      ).goals,
    ).toHaveLength(2);
  });
  it("does not invent a reduced plan when the future adjacent month is missing", () => {
    const result = overview(
      [source({ month: "2026-09", cadence: { period: "week", targetOccurrences: 3 } })],
      { anchor: "2026-09-30", today: "2026-09-30", startsOn: null },
    );
    expect(result.goals[0]?.targets[0]).toMatchObject({
      target: null,
      percent: null,
      missingPlan: true,
      originalTarget: 3,
    });
  });
  it("compares the same elapsed weekdays and suppresses a shorter previous month", () => {
    const result = overview(
      [
        source({
          entries: entries({
            "2026-10-12": 20,
            "2026-10-13": 10,
            "2026-10-14": 20,
            "2026-10-19": 24,
            "2026-10-20": 30,
            "2026-10-21": 25,
          }),
        }),
      ],
      { anchor: "2026-10-21", today: "2026-10-21" },
    );
    expect(result.goals[0]?.comparison).toMatchObject({
      interval: { from: "2026-10-12", to: "2026-10-14" },
      met: 2,
      deltaPoints: 33,
    });
    expect(
      overview([source()], {
        anchor: "2026-10-31",
        today: "2026-10-31",
        period: "month",
        startsOn: null,
      }).goals[0]?.comparison,
    ).toBeNull();
  });
  it("ends a confirmed streak on an empty past day, allowing today's unrecorded day", () => {
    const result = overview(
      [source({ entries: entries({ "2026-10-06": 20, "2026-10-07": 20 }) })],
      { today: "2026-10-08" },
    );
    expect(result.goals[0]?.streak).toEqual({ best: 2, current: 2 });
    expect(
      overview([source({ entries: entries({ "2026-10-06": 20 }) })], { today: "2026-10-08" })
        .goals[0]?.streak?.current,
    ).toBe(0);
    expect(
      overview([source({ entries: entries({ "2026-10-06": 20, "2026-10-07": 0 }) })]).goals[0]
        ?.streak?.current,
    ).toBe(0);
  });
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
  for (const id of [OWNER, OTHER])
    await env.DB.prepare("INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)")
      .bind(id, NOW, NOW)
      .run();
});

describe("progress D1 and API", () => {
  it("loads only selected fact histories while retaining owner-scoped neighbouring definitions", async () => {
    const repository = new D1PlanningRepository(env.DB);
    const create = (ownerId: string, title: string) =>
      new CreateGoalUseCase(repository).execute({
        ownerId,
        title,
        month: "2026-10",
        tracking,
        cadence: { period: "day" },
        now: NOW,
      });
    const selected = await create(OWNER, "Selected");
    const excluded = await create(OWNER, "Excluded");
    const foreign = await create(OTHER, "Private");
    for (const goal of [selected, excluded, foreign])
      await repository.upsertEntry({
        goalId: goal.id,
        date: "2026-10-06",
        value: 25,
        met: true,
        note: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
    const result = await createPlanningOperations(env.DB).progressSources(
      OWNER,
      "2026-10",
      "2026-11",
      [selected.id, foreign.id],
    );
    expect(result.map((goal) => goal.id)).toEqual([selected.id, excluded.id]);
    expect(result[0]?.entries).toEqual([{ date: "2026-10-06", value: 25, met: true }]);
    expect(result[1]?.entries).toEqual([]);
    const none = await repository.progressSources(OWNER, "2026-10", "2026-11", []);
    expect(none).toHaveLength(2);
    expect(none.every((goal) => goal.entries.length === 0)).toBe(true);
    expect(
      (await repository.progressSources(OWNER, "2026-10", "2026-11")).every(
        (goal) => goal.entries.length === 1,
      ),
    ).toBe(true);
  });
  it("defaults to all history, rejects nonexistent dates and preserves the previous setting", async () => {
    const progress = createProgressOperations(env.DB);
    expect(await progress.settings(OWNER)).toEqual({ startsOn: null, revision: 0 });
    await progress.saveSettings(OWNER, "2026-10-06");
    await expect(progress.saveSettings(OWNER, "2026-02-30")).rejects.toThrow();
    expect(await progress.settings(OWNER)).toMatchObject({ startsOn: "2026-10-06" });
    expect(await progress.settings(OTHER)).toMatchObject({ startsOn: null });
  });
  it("recalculates stored criteria atomically while preserving values and notes", async () => {
    const repository = new D1PlanningRepository(env.DB);
    const goal = await new CreateGoalUseCase(repository).execute({
      ownerId: OWNER,
      month: "2026-10",
      title: "Read",
      tracking,
      cadence: { period: "day" },
      now: NOW,
    });
    await repository.upsertEntry({
      goalId: goal.id,
      date: "2026-10-06",
      value: 25,
      met: true,
      note: "keep",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await new UpdateGoalUseCase(repository).execute({
      ownerId: OWNER,
      goalId: goal.id,
      tracking: { ...tracking, targetValue: 30 },
      now: NOW + 1,
    });
    expect(await repository.listEntries(goal.id)).toMatchObject([
      { value: 25, met: false, note: "keep", date: "2026-10-06" },
    ]);
    expect(
      (await createPlanningOperations(env.DB).progressSources(OWNER, "2026-10", "2026-10"))[0]
        ?.entries[0]?.met,
    ).toBe(false);
  });
  it("does not disclose another owner's goal or create an unprepared future month", async () => {
    const goal = await new CreateGoalUseCase(new D1PlanningRepository(env.DB)).execute({
      ownerId: OTHER,
      month: "2026-10",
      title: "Private",
      tracking,
      cadence: { period: "day" },
      now: NOW,
    });
    const progress = createProgressOperations(env.DB);
    await expect(
      progress.overview({
        ownerId: OWNER,
        goalId: goal.id,
        now: NOW,
        today: "2026-10-07",
        timeZone: "UTC",
        period: "week",
        anchor: "2026-10-07",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await progress.overview({
      ownerId: OWNER,
      now: NOW,
      today: "2026-10-07",
      timeZone: "UTC",
      period: "week",
      anchor: "2026-11-01",
    });
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM plan_month_rollovers").first("count"),
    ).toBe(0);
  });
  it("keeps a concurrent fact and threshold edit consistent without losing its note", async () => {
    const repository = new D1PlanningRepository(env.DB);
    const goal = await new CreateGoalUseCase(repository).execute({
      ownerId: OWNER,
      month: "2026-10",
      title: "Race",
      tracking,
      cadence: { period: "day" },
      now: NOW,
    });
    await Promise.all([
      new UpdateGoalUseCase(repository).execute({
        ownerId: OWNER,
        goalId: goal.id,
        tracking: { ...tracking, targetValue: 30 },
        now: NOW + 1,
      }),
      repository.upsertEntry({
        goalId: goal.id,
        date: "2026-10-06",
        value: 25,
        met: true,
        note: "preserved",
        createdAt: NOW,
        updatedAt: NOW + 1,
      }),
    ]);
    expect(await repository.listEntries(goal.id)).toMatchObject([
      { value: 25, met: false, note: "preserved" },
    ]);
  });
  it("uses authenticated owner and trusted Origin for settings and validates the OpenAPI query", async () => {
    const bindings = {
      ...env,
      AUTH_MODE: "development",
      APP_ORIGIN: "http://localhost:8787",
      AUTH_SUCCESS_REDIRECT_URL: "http://localhost:8787/",
      TELEGRAM_BOT_MODE: "disabled",
      BUILD_REVISION: "local",
    } as unknown as CloudflareBindings;
    const app = createApp();
    const invalid = await app.request(
      "http://localhost:8787/api/progress?period=week&anchor=2026-02-30",
      {},
      bindings,
    );
    expect(invalid.status).toBe(400);
    const response = await app.request(
      "http://localhost:8787/api/progress/settings",
      {
        method: "PUT",
        headers: { Origin: "https://elsewhere.example", "Content-Type": "application/json" },
        body: JSON.stringify({ startsOn: null }),
      },
      bindings,
    );
    expect(response.status).toBe(403);
    for (const [body, contentType, status] of [
      ["{", "application/json", 400],
      ["{}", "text/plain", 415],
      ["x".repeat(5000), "application/json", 413],
    ] as const) {
      const result = await app.request(
        "http://localhost:8787/api/progress/settings",
        {
          method: "PUT",
          headers: { Origin: "http://localhost:8787", "Content-Type": contentType },
          body,
        },
        bindings,
      );
      expect(result.status).toBe(status);
      expect(result.headers.get("Content-Type")).toContain("application/problem+json");
    }
    vi.restoreAllMocks();
  });
});
