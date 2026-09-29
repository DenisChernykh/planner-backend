import { DateTime, IANAZone } from "luxon";
import {
  GoalReminderInvalidError,
  ReminderScheduleInvalidError,
  ReminderSettingsInvalidError,
} from "./errors";
import type { GoalReminderInput, SettingsInput } from "./model";

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
export function validateSettings(value: SettingsInput): void {
  if (
    !IANAZone.isValidZone(value.timeZone) ||
    !TIME.test(value.quietStart) ||
    !TIME.test(value.quietEnd) ||
    !TIME.test(value.eveningTime)
  ) {
    throw new ReminderSettingsInvalidError();
  }
}
export function validateReminder(value: GoalReminderInput): void {
  if (
    !["off", "scheduled", "evening"].includes(value.mode) ||
    !TIME.test(value.time) ||
    value.weekdays.length < 1 ||
    value.weekdays.length > 7 ||
    new Set(value.weekdays).size !== value.weekdays.length ||
    value.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
  ) {
    throw new GoalReminderInvalidError();
  }
}
export function localDate(now: number, zone: string): string {
  return DateTime.fromMillis(now, { zone }).toFormat("yyyy-MM-dd");
}
function atTime(day: DateTime, time: string): DateTime {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const result = day.set({ hour, minute, second: 0, millisecond: 0 });
  // At a fall-back transition, use the first occurrence. Luxon moves a missing
  // spring-forward time forward by the gap (02:30 -> 03:30).
  return result.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis())[0] ?? result;
}
export function nextOccurrence(
  now: number,
  zone: string,
  time: string,
  weekdays = [1, 2, 3, 4, 5, 6, 7],
): number {
  const start = DateTime.fromMillis(now, { zone }).startOf("day");
  for (let offset = 0; offset <= 8; offset++) {
    const day = start.plus({ days: offset });
    const candidate = atTime(day, time);
    if (weekdays.includes(day.weekday) && candidate.toMillis() > now) return candidate.toMillis();
  }
  throw new ReminderScheduleInvalidError();
}
export function afterQuietHours(now: number, settings: SettingsInput): number {
  if (settings.quietStart === settings.quietEnd) return now;
  const local = DateTime.fromMillis(now, { zone: settings.timeZone });
  const time = local.toFormat("HH:mm");
  const { quietStart: start, quietEnd: end } = settings;
  const quiet = start < end ? time >= start && time < end : time >= start || time < end;
  if (!quiet) return now;
  const day = start > end && time >= start ? local.plus({ days: 1 }) : local;
  return atTime(day, end).toMillis();
}
export function isReminderDay(date: string, settings: SettingsInput, weekdays: number[]): boolean {
  return weekdays.includes(DateTime.fromISO(date, { zone: settings.timeZone }).weekday);
}
