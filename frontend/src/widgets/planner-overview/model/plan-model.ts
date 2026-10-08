import type {
  GetApiPlansMonth200GoalsItem,
  GetApiPlansMonth200GoalsItemEntriesItem,
} from "@/shared/api";
import {
  getPlannerMonthEnd,
  getPlannerMonthStart,
  isPlannerDateInMonth,
} from "@/shared/lib/planner-calendar";

export type PlanGoal = GetApiPlansMonth200GoalsItem;
export type PlanEntry = GetApiPlansMonth200GoalsItemEntriesItem;
export type TrackingType = PlanGoal["tracking"]["type"];
export type CadencePeriod = PlanGoal["cadence"]["period"];

const TRACKING_LABELS = {
  check: "Галочка",
  quantity: "Количество",
  scale: "Шкала",
  time: "Время",
} satisfies Record<TrackingType, string>;

const CADENCE_LABELS = {
  day: "Каждый день",
  week: "За неделю",
  month: "За месяц",
} satisfies Record<CadencePeriod, string>;

const TRACKING_ICON_IDS = {
  check: "check-circle-2",
  quantity: "hash",
  scale: "sliders-horizontal",
  time: "alarm-clock",
} satisfies Record<TrackingType, string>;

export function getGoalIcon(type: TrackingType): string {
  return TRACKING_ICON_IDS[type];
}

export function getTrackingLabel(type: TrackingType): string {
  return TRACKING_LABELS[type];
}

export function getGoalMeta(goal: PlanGoal): string {
  const { tracking, cadence } = goal;
  const frequency =
    cadence.period === "day"
      ? CADENCE_LABELS.day
      : `${cadence.targetOccurrences} раз${cadence.targetOccurrences % 10 >= 2 && cadence.targetOccurrences % 10 <= 4 && (cadence.targetOccurrences % 100 < 12 || cadence.targetOccurrences % 100 > 14) ? "а" : ""} ${cadence.period === "week" ? "в неделю" : "в месяц"}`;
  let condition: string;
  if (tracking.type === "check") condition = "Отметить выполнение";
  else if (tracking.type === "quantity")
    condition = `${{ atLeast: "Не меньше", atMost: "Не больше", equal: "Ровно" }[tracking.comparison]} ${tracking.targetValue}${tracking.unit ? ` ${tracking.unit}` : ""}`;
  else if (tracking.type === "scale") condition = `От ${tracking.min} до ${tracking.max}`;
  else if (tracking.targetStart && tracking.targetEnd)
    condition = `${tracking.targetStart}–${tracking.targetEnd}${tracking.targetStart > tracking.targetEnd ? " (через полночь)" : ""}`;
  else if (tracking.targetStart) condition = `Не раньше ${tracking.targetStart}`;
  else if (tracking.targetEnd) condition = `Не позже ${tracking.targetEnd}`;
  else condition = "Любое время";
  return `${condition} · ${frequency}`;
}

export function formatFactDate(date: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export function getFactAccessibleName(
  goal: PlanGoal,
  date: string,
  today: string,
  month: string,
): string {
  const entry = getEntry(goal, date);
  const value = !entry
    ? "результат не записан"
    : typeof entry.value === "boolean"
      ? entry.value
        ? "отмечено"
        : "не отмечено"
      : formatEntryValue(goal, entry);
  const state = entry ? (entry.met ? "условие выполнено" : "условие не выполнено") : "";
  const action =
    date > today || !date.startsWith(`${month}-`) ? "только просмотр" : "Изменить результат";
  return [goal.title, formatFactDate(date), value, state, action].filter(Boolean).join(", ");
}

export function getEntry(goal: PlanGoal, date: string): PlanEntry | undefined {
  return goal.entries.find((entry) => entry.date === date);
}

export function getAvailableDates(weekDates: string[], month: string, today: string): string[] {
  const monthEnd = getPlannerMonthEnd(month);
  return weekDates.filter(
    (date) =>
      isPlannerDateInMonth(date, month) &&
      date >= getPlannerMonthStart(month) &&
      date <= monthEnd &&
      date <= today,
  );
}

export function getProgress(
  goal: PlanGoal,
  weekDates: string[],
  month: string,
  today: string,
): { value: number; total: number; label: string } {
  const availableDates = getAvailableDates(weekDates, month, today);
  const metEntries = goal.entries.filter((entry) => entry.met && entry.date <= today);
  if (goal.cadence.period === "day") {
    return {
      value: availableDates.filter((date) => getEntry(goal, date)?.met).length,
      total: availableDates.length,
      label: "доступных дней",
    };
  }
  if (goal.cadence.period === "week") {
    return {
      value: metEntries.filter((entry) => weekDates.includes(entry.date)).length,
      total: goal.cadence.targetOccurrences,
      label: "за неделю",
    };
  }
  return { value: metEntries.length, total: goal.cadence.targetOccurrences, label: "за месяц" };
}

export function formatEntryValue(goal: PlanGoal, entry: PlanEntry | undefined): string {
  if (!entry) return "";
  if (goal.tracking.type === "check") {
    if (entry.value === true) return "✓";
    return "—";
  }
  if (goal.tracking.type === "quantity") {
    if (goal.tracking.unit) return `${entry.value} ${goal.tracking.unit}`;
    return String(entry.value);
  }
  return String(entry.value);
}

export function clampProgress(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}
