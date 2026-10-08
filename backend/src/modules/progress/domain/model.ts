export type Tracking =
  | { type: "check" }
  | {
      type: "quantity";
      unit?: string;
      targetValue: number;
      comparison: "atLeast" | "atMost" | "equal";
    }
  | { type: "scale"; min: number; max: number }
  | { type: "time"; targetStart?: string; targetEnd?: string };
export type Cadence = { period: "day" } | { period: "week" | "month"; targetOccurrences: number };
export type ProgressSource = {
  id: string;
  chainId: string;
  month: string;
  title: string;
  tracking: Tracking;
  cadence: Cadence;
  entries: { date: string; value: boolean | number | string; met: boolean }[];
};
export type Interval = { from: string; to: string };
export type ProgressDay = {
  date: string;
  goalId: string | null;
  state: "met" | "below" | "recorded" | "missing" | "excluded" | "future";
  value: boolean | number | string | null;
};
export type ProgressTarget = Interval & {
  accounted: Interval | null;
  value: number;
  target: number | null;
  originalTarget: number;
  percent: number | null;
  overflow: number;
  reduced: boolean;
  missingPlan: boolean;
  remaining: number | null;
};
export type ProgressGoal = {
  id: string;
  goalIds: string[];
  chainId: string;
  title: string;
  tracking: Tracking;
  cadence: Cadence;
  interval: Interval | null;
  measurable: boolean;
  eligibleDays: number;
  records: number;
  met: number;
  missing: number;
  falseRecords: number;
  completeness: number | null;
  sum: number | null;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  days: ProgressDay[];
  targets: ProgressTarget[];
  history: ProgressTarget[];
  comparison: {
    interval: Interval;
    eligibleDays: number;
    missing: number;
    records: number;
    met: number;
    sum: number | null;
    average: number | null;
    minimum: number | null;
    maximum: number | null;
    days: ProgressDay[];
    targets: ProgressTarget[];
    percent: number | null;
    deltaPoints: number | null;
  } | null;
  comparisonReason: "insufficient-history" | "different-rules" | null;
  streak: { current: number | null; best: number } | null;
};
export type ProgressOverview = {
  period: "week" | "month";
  requested: Interval;
  actual: Interval | null;
  today: string;
  asOf: number;
  timeZone: string;
  startsOn: string | null;
  partial: boolean;
  state: "ready" | "no-goals" | "no-entries" | "before-start" | "future-start";
  summary: {
    met: number;
    dailyRecords: number;
    dailyDays: number;
    dailyPercent: number | null;
    daysWithEntries: number;
    eligibleDays: number;
  };
  goals: ProgressGoal[];
};
