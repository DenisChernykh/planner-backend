import { DateTime } from "luxon";
import type { Interval } from "./model";

export function validProgressDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    DateTime.fromISO(value, { zone: "UTC" }).toISODate() === value
  );
}
export function shiftDate(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: "UTC" }).plus({ days }).toISODate() as string;
}
export function intervalFor(period: "week" | "month", anchor: string): Interval {
  const date = DateTime.fromISO(anchor, { zone: "UTC" });
  return {
    from: date.startOf(period).toISODate() as string,
    to: date.endOf(period).toISODate() as string,
  };
}
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}
export function previousInterval(
  period: "week" | "month",
  requested: Interval,
  today: string,
): Interval | null {
  const to = requested.to < today ? requested.to : today;
  if (to < requested.from) return null;
  if (period === "week") return { from: shiftDate(requested.from, -7), to: shiftDate(to, -7) };
  const previous = DateTime.fromISO(requested.from, { zone: "UTC" }).minus({ months: 1 });
  const lastDay = Number(to.slice(8));
  if (lastDay > (previous.daysInMonth ?? 0)) return null;
  return {
    from: previous.toISODate() as string,
    to: previous.set({ day: lastDay }).toISODate() as string,
  };
}
