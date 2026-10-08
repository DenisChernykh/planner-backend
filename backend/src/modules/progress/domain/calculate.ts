import { datesBetween, intervalFor, previousInterval, shiftDate } from "./calendar";
import type {
  Interval,
  ProgressDay,
  ProgressGoal,
  ProgressOverview,
  ProgressSource,
  ProgressTarget,
} from "./model";

const percentage = (value: number, total: number) =>
  total > 0 ? Math.round((value / total) * 100) : null;
const rounded = (value: number) => Math.round(value * 10) / 10;
const signature = (goal: ProgressSource) =>
  JSON.stringify([
    Object.entries(goal.tracking).sort(([left], [right]) => left.localeCompare(right)),
    Object.entries(goal.cadence).sort(([left], [right]) => left.localeCompare(right)),
  ]);
export function isMeasurable(goal: Pick<ProgressSource, "tracking">): boolean {
  return (
    goal.tracking.type !== "scale" &&
    (goal.tracking.type !== "time" || Boolean(goal.tracking.targetStart || goal.tracking.targetEnd))
  );
}
function dayData(
  versions: ProgressSource[],
  period: Interval,
  startsOn: string | null,
  today: string,
): ProgressDay[] {
  return datesBetween(period.from, period.to).map((date) => {
    const goal = versions.find((item) => item.month === date.slice(0, 7));
    const entry = goal?.entries.find((item) => item.date === date);
    return {
      date,
      goalId: goal?.id ?? null,
      state:
        !goal || (startsOn !== null && date < startsOn)
          ? "excluded"
          : date > today
            ? "future"
            : !entry
              ? "missing"
              : !isMeasurable(goal)
                ? "recorded"
                : entry.met
                  ? "met"
                  : "below",
      value:
        !goal || (startsOn !== null && date < startsOn) || date > today
          ? null
          : (entry?.value ?? null),
    };
  });
}
function targetsFor(
  versions: ProgressSource[],
  allVersions: ProgressSource[],
  period: Interval,
  startsOn: string | null,
  today: string,
  knownVersions: ProgressSource[] = allVersions,
): ProgressTarget[] {
  const first = versions[0];
  if (!first) return [];
  const cadence = first.cadence;
  const measurable = isMeasurable(first);
  if (cadence.period === "day") {
    const days = dayData(versions, period, startsOn, today).filter(
      (day) => !["excluded", "future"].includes(day.state),
    );
    if (!days.length) return [];
    const value = days.filter((day) =>
      measurable ? day.state === "met" : day.value !== null,
    ).length;
    return [
      {
        from: days[0]?.date ?? period.from,
        to: days.at(-1)?.date ?? period.to,
        accounted: { from: days[0]?.date ?? period.from, to: days.at(-1)?.date ?? period.to },
        value,
        target: days.length,
        originalTarget: days.length,
        percent: percentage(value, days.length),
        overflow: 0,
        reduced: false,
        missingPlan: false,
        remaining: Math.max(0, days.length - value),
      },
    ];
  }
  const compatible = allVersions.filter(
    (goal) => goal.chainId === first.chainId && signature(goal) === signature(first),
  );
  const intervals = new Map<string, Interval>();
  for (const date of datesBetween(period.from, period.to)) {
    if (!versions.some((goal) => goal.month === date.slice(0, 7))) continue;
    const natural = intervalFor(cadence.period, date);
    intervals.set(natural.from, natural);
  }
  return [...intervals.values()].map((natural) => {
    const fullDays = datesBetween(natural.from, natural.to);
    const included = fullDays.filter(
      (date) =>
        (!startsOn || date >= startsOn) &&
        compatible.some((goal) => goal.month === date.slice(0, 7)),
    );
    const missingPlan =
      cadence.period === "week" &&
      fullDays.some(
        (date) =>
          date > today &&
          (!startsOn || date >= startsOn) &&
          !knownVersions.some(
            (goal) => goal.chainId === first.chainId && goal.month === date.slice(0, 7),
          ),
      );
    const value = dayData(compatible, natural, startsOn, today).filter((day) =>
      measurable ? day.state === "met" : day.value !== null,
    ).length;
    const target =
      included.length === 0 || missingPlan
        ? null
        : Math.ceil((cadence.targetOccurrences * included.length) / fullDays.length);
    return {
      ...natural,
      accounted: included.length
        ? { from: included[0] as string, to: included.at(-1) as string }
        : null,
      value,
      target,
      originalTarget: cadence.targetOccurrences,
      percent: target === null ? null : percentage(value, target),
      overflow: target === null ? 0 : Math.max(0, value - target),
      reduced: target !== null && target < cadence.targetOccurrences,
      missingPlan,
      remaining: target === null ? null : Math.max(0, target - value),
    };
  });
}
function stats(days: ProgressDay[]) {
  const eligible = days.filter((day) => day.state !== "excluded" && day.state !== "future");
  const recorded = eligible.filter((day) => day.value !== null);
  const numbers = recorded.flatMap((day) => (typeof day.value === "number" ? [day.value] : []));
  return {
    eligibleDays: eligible.length,
    records: recorded.length,
    met: eligible.filter((day) => day.state === "met").length,
    missing: eligible.length - recorded.length,
    falseRecords: recorded.filter((day) => day.value === false).length,
    completeness: percentage(recorded.length, eligible.length),
    sum: numbers.length ? numbers.reduce((sum, value) => sum + value, 0) : null,
    average: numbers.length
      ? rounded(numbers.reduce((sum, value) => sum + value, 0) / numbers.length)
      : null,
    minimum: numbers.length ? Math.min(...numbers) : null,
    maximum: numbers.length ? Math.max(...numbers) : null,
    interval: eligible.length
      ? { from: eligible[0]?.date as string, to: eligible.at(-1)?.date as string }
      : null,
  };
}
function streak(days: ProgressDay[], today: string, requested: Interval) {
  let best = 0;
  let run = 0;
  for (const day of days) {
    run = day.state === "met" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  let current: number | null = null;
  if (requested.from <= today && requested.to >= today) {
    current = 0;
    const eligible = days.filter((day) => day.date <= today);
    if (eligible.at(-1)?.date === today && eligible.at(-1)?.state === "missing") eligible.pop();
    for (const day of eligible.reverse()) {
      if (day.state !== "met") break;
      current++;
    }
  }
  return { current, best };
}
export function calculateProgress(input: {
  sources: ProgressSource[];
  knownSources?: ProgressSource[];
  period: "week" | "month";
  anchor: string;
  today: string;
  startsOn: string | null;
  asOf: number;
  timeZone: string;
}): ProgressOverview {
  const { sources, period, today, startsOn } = input;
  const requested = intervalFor(period, input.anchor);
  const previous = previousInterval(period, requested, today);
  const groups = new Map<string, ProgressSource[]>();
  for (const goal of sources) {
    const bounds = intervalFor("month", `${goal.month}-01`);
    if (bounds.to < requested.from || bounds.from > requested.to) continue;
    const key = `${goal.chainId}:${signature(goal)}`;
    groups.set(key, [...(groups.get(key) ?? []), goal]);
  }
  const goals: ProgressGoal[] = [...groups.values()].map((versions) => {
    const first = versions[0] as ProgressSource;
    const days = dayData(versions, requested, startsOn, today);
    const current = stats(days);
    const targets = targetsFor(versions, sources, requested, startsOn, today, input.knownSources);
    const previousSources = sources.filter(
      (goal) => goal.chainId === first.chainId && signature(goal) === signature(first),
    );
    const previousDays = previous ? dayData(previousSources, previous, startsOn, today) : [];
    const currentDates = datesBetween(requested.from, requested.to < today ? requested.to : today);
    const comparable =
      previous !== null &&
      previousDays.length > 0 &&
      previousDays.every((day) => day.state !== "excluded") &&
      currentDates.length > 0 &&
      days.filter((day) => day.date <= today).every((day) => day.state !== "excluded");
    const old = stats(previousDays);
    const daily = first.cadence.period === "day";
    const oldTargets = previous
      ? targetsFor(previousSources, sources, previous, startsOn, previous.to, input.knownSources)
      : [];
    const oldPercent = daily
      ? percentage(isMeasurable(first) ? old.met : old.records, old.eligibleDays)
      : oldTargets.length === 1
        ? (oldTargets[0]?.percent ?? null)
        : null;
    const currentPercent = targets.length === 1 ? (targets[0]?.percent ?? null) : null;
    const currentTarget = targets.length === 1 ? targets[0] : undefined;
    const oldTarget = oldTargets.length === 1 ? oldTargets[0] : undefined;
    const historyPeriod = {
      from: shiftDate(requested.from, -21),
      to: shiftDate(requested.from, -1),
    };
    return {
      id: first.id,
      goalIds: versions.map((goal) => goal.id),
      chainId: first.chainId,
      title: first.title,
      tracking: first.tracking,
      cadence: first.cadence,
      measurable: isMeasurable(first),
      ...current,
      days,
      targets,
      history:
        first.cadence.period === "week"
          ? targetsFor(previousSources, sources, historyPeriod, startsOn, today, input.knownSources)
              .filter((target) => target.accounted !== null && target.to < requested.from)
              .reverse()
          : [],
      comparison: comparable
        ? {
            ...old,
            interval: previous as Interval,
            days: previousDays,
            targets: oldTargets,
            percent: oldPercent,
            deltaPoints:
              isMeasurable(first) &&
              currentPercent !== null &&
              oldPercent !== null &&
              currentTarget?.target &&
              oldTarget?.target
                ? Math.round(
                    100 *
                      (currentTarget.value / currentTarget.target -
                        oldTarget.value / oldTarget.target),
                  )
                : null,
          }
        : null,
      comparisonReason: comparable
        ? null
        : sources.some(
              (goal) =>
                previous &&
                goal.chainId === first.chainId &&
                goal.month >= previous.from.slice(0, 7) &&
                goal.month <= previous.to.slice(0, 7) &&
                signature(goal) !== signature(first),
            )
          ? "different-rules"
          : "insufficient-history",
      streak:
        daily && isMeasurable(first) && current.eligibleDays > 0
          ? streak(days, today, requested)
          : null,
    };
  });
  const eligibleDates = new Set(
    goals.flatMap((goal) =>
      goal.days.filter((day) => !["excluded", "future"].includes(day.state)).map((day) => day.date),
    ),
  );
  const recordedDates = new Set(
    goals.flatMap((goal) => goal.days.filter((day) => day.value !== null).map((day) => day.date)),
  );
  const daily = goals.filter((goal) => goal.cadence.period === "day");
  const dailyRecords = daily.reduce((total, goal) => total + goal.records, 0);
  const dailyDays = daily.reduce((total, goal) => total + goal.eligibleDays, 0);
  const from = [requested.from, startsOn ?? requested.from].sort().at(-1) as string;
  const to = requested.to < today ? requested.to : today;
  return {
    period,
    requested,
    actual: from <= to ? { from, to } : null,
    today,
    asOf: input.asOf,
    timeZone: input.timeZone,
    startsOn,
    partial: requested.to >= today,
    state:
      startsOn && requested.to < startsOn && requested.to < today
        ? "before-start"
        : startsOn && startsOn > today
          ? "future-start"
          : startsOn && requested.to < startsOn
            ? "before-start"
            : !goals.length
              ? "no-goals"
              : !recordedDates.size
                ? "no-entries"
                : "ready",
    summary: {
      met: goals.reduce((total, goal) => total + goal.met, 0),
      dailyRecords,
      dailyDays,
      dailyPercent: percentage(dailyRecords, dailyDays),
      daysWithEntries: recordedDates.size,
      eligibleDays: eligibleDates.size,
    },
    goals,
  };
}
