import { readFileSync } from "node:fs";
import { calculateMet } from "../../backend/src/modules/planning/domain/rules.ts";
import { calculateProgress } from "../../backend/src/modules/progress/domain/calculate.ts";
import type { ProgressSource, Tracking } from "../../backend/src/modules/progress/domain/model.ts";
import { reportMessage } from "../../backend/src/modules/reminders/application/reports/report-message.ts";

const sample = JSON.parse(
  readFileSync(
    new URL("../../frontend/docs/design/progress/sample-data.json", import.meta.url),
    "utf8",
  ),
);
const tracking: Tracking[] = [
  { type: "quantity", comparison: "atLeast", targetValue: 20, unit: "страниц" },
  { type: "quantity", comparison: "atLeast", targetValue: 2, unit: "л" },
  { type: "time", targetEnd: "23:30" },
  { type: "scale", min: 1, max: 5 },
  { type: "check" },
];
export const sources: ProgressSource[] = sample.goals.map(
  (
    goal: { id: string; title: string; records: Record<string, boolean | number | string> },
    i: number,
  ) => ({
    id: goal.id,
    chainId: goal.id,
    month: "2026-10",
    title: goal.title,
    tracking: tracking[i],
    cadence: i === 4 ? { period: "week", targetOccurrences: 3 } : { period: "day" },
    entries: Object.entries(goal.records).map(([date, value]) => ({
      date,
      value,
      met: calculateMet(tracking[i], value),
    })),
  }),
);
export const overview = (supplied = sources, period: "week" | "month" = "week", options: { today?: string; anchor?: string; startsOn?: string | null } = {}) =>
  calculateProgress({
    sources: supplied,
    period,
    anchor: options.anchor ?? options.today ?? "2026-10-21",
    today: options.today ?? "2026-10-21",
    startsOn: options.startsOn === undefined ? "2026-10-06" : options.startsOn,
    asOf: Date.parse(`${options.today ?? "2026-10-21"}T16:00:00Z`),
    timeZone: "Asia/Yekaterinburg",
  });
export const unboundedSource: ProgressSource = {
  id: "unbounded",
  chainId: "unbounded",
  month: "2026-10",
  title: "Время без условия",
  tracking: { type: "time" },
  cadence: { period: "day" },
  entries: [
    { date: "2026-10-19", value: "23:50", met: true },
    { date: "2026-10-20", value: "00:10", met: true },
  ],
};
export const detailedSources = [...sources, unboundedSource];
export const fixtures = {
  expanded: overview(),
  month: overview(sources, "month"),
  empty: overview(sources.map((s) => ({ ...s, entries: [] }))),
  report: reportMessage(overview(sources.filter((_, i) => [0, 1, 4].includes(i))), "wed", "http://127.0.0.1:5188"),
  reportState: {
    settings: {
      ownerId: "synthetic-audit-owner",
      enabled: false,
      wednesdayTime: "21:00",
      sundayTime: "21:00",
      nextWednesdayAt: null,
      nextSundayAt: null,
      revision: 0,
    },
    delivery: { retrying: 0, failed: 0, unknown: 0 },
    startsOn: "2026-10-06",
    timeZone: "Asia/Yekaterinburg",
    quietStart: "23:00",
    quietEnd: "08:00",
    connection: "active",
    botAvailable: true,
    state: "disabled",
    nextRuns: [],
    goals: sources.map((g, i) => ({
      goalId: g.id,
      title: g.title,
      included: [0, 1, 4].includes(i),
    })),
  },
};
