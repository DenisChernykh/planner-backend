import { z } from "@hono/zod-openapi";

export const progressDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
export const progressSettingsSchema = z
  .object({ startsOn: progressDate.nullable(), revision: z.number().int() })
  .openapi("ProgressSettings");
const interval = z.object({ from: progressDate, to: progressDate });
const numeric = z.number().nullable();
const tracking = z.discriminatedUnion("type", [
  z.object({ type: z.literal("check") }),
  z.object({
    type: z.literal("quantity"),
    unit: z.string().optional(),
    targetValue: z.number(),
    comparison: z.enum(["atLeast", "atMost", "equal"]),
  }),
  z.object({ type: z.literal("scale"), min: z.number(), max: z.number() }),
  z.object({
    type: z.literal("time"),
    targetStart: z.string().optional(),
    targetEnd: z.string().optional(),
  }),
]);
const cadence = z.union([
  z.object({ period: z.literal("day") }),
  z.object({ period: z.enum(["week", "month"]), targetOccurrences: z.number() }),
]);
export const progressTargetSchema = interval
  .extend({
    accounted: interval.nullable(),
    value: z.number(),
    target: numeric,
    originalTarget: z.number(),
    percent: numeric,
    overflow: z.number(),
    reduced: z.boolean(),
    missingPlan: z.boolean(),
  })
  .openapi("ProgressTarget");
export const progressGoalSchema = z
  .object({
    id: z.string(),
    goalIds: z.array(z.string()),
    chainId: z.string(),
    title: z.string(),
    tracking,
    cadence,
    interval: interval.nullable(),
    measurable: z.boolean(),
    eligibleDays: z.number(),
    records: z.number(),
    met: z.number(),
    missing: z.number(),
    completeness: numeric,
    sum: numeric,
    average: numeric,
    minimum: numeric,
    maximum: numeric,
    days: z.array(
      z.object({
        date: progressDate,
        goalId: z.string().nullable(),
        state: z.enum(["met", "below", "recorded", "missing", "excluded", "future"]),
        value: z.union([z.boolean(), z.number(), z.string()]).nullable(),
      }),
    ),
    targets: z.array(progressTargetSchema),
    comparison: z
      .object({
        interval,
        records: z.number(),
        met: z.number(),
        sum: numeric,
        average: numeric,
        percent: numeric,
        deltaPoints: numeric,
      })
      .nullable(),
    comparisonReason: z.enum(["insufficient-history", "different-rules"]).nullable(),
    streak: z.object({ current: numeric, best: z.number() }).nullable(),
  })
  .openapi("ProgressGoal");
export const progressOverviewSchema = z
  .object({
    period: z.enum(["week", "month"]),
    requested: interval,
    actual: interval.nullable(),
    today: progressDate,
    asOf: z.number(),
    timeZone: z.string(),
    startsOn: progressDate.nullable(),
    partial: z.boolean(),
    state: z.enum(["ready", "no-goals", "no-entries", "before-start", "future-start"]),
    summary: z.object({
      met: z.number(),
      dailyRecords: z.number(),
      dailyDays: z.number(),
      dailyPercent: numeric,
      daysWithEntries: z.number(),
      eligibleDays: z.number(),
    }),
    goals: z.array(progressGoalSchema),
  })
  .openapi("ProgressOverview");
