import { DateTime, IANAZone } from "luxon";
import {
  GoalReminderInvalidError,
  ReminderScheduleInvalidError,
  ReminderSettingsInvalidError,
} from "./errors";
import { DEFAULT_SETTINGS, type GoalReminderInput, type SettingsInput } from "./model";

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
function createFormatter(zone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}
// Initialize the default calendar during module startup, outside a Cron invocation.
const formatters = new Map([
  [DEFAULT_SETTINGS.timeZone, createFormatter(DEFAULT_SETTINGS.timeZone)],
]);
// Luxon's separate IANA formatter is also needed when the first due rule arrives.
// Construct it at module startup, rather than on that delivery's CPU budget.
DateTime.fromMillis(0, { zone: DEFAULT_SETTINGS.timeZone });
const occurrences = new Map<string, { at: number; weekday: number }>();
const dayOffsets = new Map<string, number | null>();
const utcDayOffsets = new Map<string, number | null>();
const minuteParts = new Map<string, { minute: number; parts: Record<string, string> }>();
function formattedParts(now: number, zone: string) {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = createFormatter(zone);
    // Cache derived calendar machinery only, with a bounded isolate footprint.
    if (formatters.size >= 32) formatters.clear();
    formatters.set(zone, formatter);
  }
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(now))
    if (part.type !== "literal") parts[part.type] = part.value;
  return parts;
}
function formattedOffset(at: number, zone: string): number {
  const parts = formattedParts(at, zone);
  return (
    Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`) -
    Math.floor(at / 60_000) * 60_000
  );
}
function localParts(now: number, zone: string) {
  const minute = Math.floor(now / 60_000);
  const cached = minuteParts.get(zone);
  if (cached?.minute === minute) return cached.parts;
  let parts: Record<string, string>;
  if (now < Date.UTC(2000, 0, 1)) parts = formattedParts(now, zone);
  else {
    const utcDay = Math.floor(now / 86_400_000);
    const key = `${zone}:${utcDay}`;
    let offset = utcDayOffsets.get(key);
    if (offset === undefined) {
      // As in local-time resolution below, transition-adjacent days retain Intl.
      // Cache a derived timezone offset, never a user's schedule or a clock value.
      const noon = utcDay * 86_400_000 + 12 * 3_600_000;
      const before = formattedOffset(noon - 36 * 3_600_000, zone);
      const after = formattedOffset(noon + 36 * 3_600_000, zone);
      offset = before === after ? before : null;
      if (utcDayOffsets.size >= 256) utcDayOffsets.clear();
      utcDayOffsets.set(key, offset);
    }
    if (offset === null) parts = formattedParts(now, zone);
    else {
      const local = new Date(now + offset).toISOString();
      parts = {
        year: local.slice(0, 4),
        month: local.slice(5, 7),
        day: local.slice(8, 10),
        hour: local.slice(11, 13),
        minute: local.slice(14, 16),
      };
    }
  }
  if (minuteParts.size >= 32) minuteParts.clear();
  minuteParts.set(zone, { minute, parts });
  return parts;
}
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
  const parts = localParts(now, zone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function localTime(now: number, zone: string): string {
  const parts = localParts(now, zone);
  return `${parts.hour}:${parts.minute}`;
}
function resolveTime(date: string, time: string, zone: string): number {
  // Historical IANA offsets can include seconds; retain Luxon's exact resolution.
  if (date < "2000-01-01") return atTime(DateTime.fromISO(date, { zone }), time).toMillis();
  const key = `${zone}:${date}`;
  let offset = dayOffsets.get(key);
  if (offset === undefined) {
    const noon = Date.parse(`${date}T12:00:00Z`);
    const before = formattedOffset(noon - 36 * 3_600_000, zone);
    const after = formattedOffset(noon + 36 * 3_600_000, zone);
    offset = before === after ? before : null;
    if (dayOffsets.size >= 256) dayOffsets.clear();
    dayOffsets.set(key, offset);
  }
  if (offset !== null) {
    const candidate = Date.parse(`${date}T${time}:00Z`) - offset;
    // Use the inexpensive stable-offset path only when the round trip agrees.
    // Transition days retain Luxon's gap/fold policy below.
    if (localDate(candidate, zone) === date && localTime(candidate, zone) === time)
      return candidate;
  }
  return atTime(DateTime.fromISO(date, { zone }), time).toMillis();
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
  // Select calendar days before asking Luxon to resolve an actual local time.
  // In particular, a weekly rule must not resolve eight discarded local times.
  const start = Date.parse(`${localDate(now, zone)}T00:00:00Z`);
  for (let offset = 0; offset <= 8; offset++) {
    const date = new Date(start + offset * 86_400_000);
    if (!weekdays.includes(date.getUTCDay() || 7)) continue;
    const key = `${zone}:${date.toISOString().slice(0, 10)}:${time}`;
    let occurrence = occurrences.get(key);
    if (occurrence === undefined) {
      const at = resolveTime(date.toISOString().slice(0, 10), time, zone);
      const weekday = new Date(`${localDate(at, zone)}T00:00:00Z`).getUTCDay() || 7;
      occurrence = { at, weekday };
      // Cache only a deterministic local-time resolution, never a user's next run.
      if (occurrences.size >= 256) occurrences.clear();
      occurrences.set(key, occurrence);
    }
    if (weekdays.includes(occurrence.weekday) && occurrence.at > now) return occurrence.at;
  }
  throw new ReminderScheduleInvalidError();
}
export function afterQuietHours(now: number, settings: SettingsInput): number {
  if (settings.quietStart === settings.quietEnd) return now;
  const parts = localParts(now, settings.timeZone);
  const time = `${parts.hour}:${parts.minute}`;
  const { quietStart: start, quietEnd: end } = settings;
  const quiet = start < end ? time >= start && time < end : time >= start || time < end;
  if (!quiet) return now;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const day =
    start > end && time >= start
      ? new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
      : date;
  return resolveTime(day, end, settings.timeZone);
}
export function isReminderDay(date: string, settings: SettingsInput, weekdays: number[]): boolean {
  return weekdays.includes(DateTime.fromISO(date, { zone: settings.timeZone }).weekday);
}

// Carry today's schedule, including an occurrence due before the first tick, without replaying older days.
export function startOfReminderDay(now: number, zone: string): number {
  return resolveTime(localDate(now, zone), "00:00", zone);
}
