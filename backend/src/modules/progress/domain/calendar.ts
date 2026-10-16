import type { Interval } from "./model";

const DAY = 86_400_000;
const midnight = (date: string) => Date.parse(`${date}T00:00:00Z`);
const isoDate = (millis: number) => new Date(millis).toISOString().slice(0, -14);

// These values are calendar dates, not instants in the account's timezone.
// UTC arithmetic avoids constructing thousands of Luxon objects per report.
export function validProgressDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const millis = midnight(value);
  return Number.isFinite(millis) && isoDate(millis) === value;
}
export function shiftDate(date: string, days: number): string {
  return isoDate(midnight(date) + days * DAY);
}
export function intervalFor(period: "week" | "month", anchor: string): Interval {
  const date = new Date(midnight(anchor));
  if (period === "week") {
    const monday = date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY;
    return { from: isoDate(monday), to: isoDate(monday + 6 * DAY) };
  }
  date.setUTCDate(1);
  const from = isoDate(date.getTime());
  date.setUTCMonth(date.getUTCMonth() + 1);
  return { from, to: isoDate(date.getTime() - DAY) };
}
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let at = midnight(from), end = midnight(to); at <= end; at += DAY) dates.push(isoDate(at));
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
  const previous = new Date(midnight(requested.from));
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const from = isoDate(previous.getTime());
  const lastDay = Number(to.slice(8));
  if (lastDay > Number(intervalFor("month", from).to.slice(8))) return null;
  previous.setUTCDate(lastDay);
  return {
    from,
    to: isoDate(previous.getTime()),
  };
}
