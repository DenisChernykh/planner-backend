import { DateTime } from "luxon";
import { localTime, nextOccurrence } from "./schedule";

export function reportWeek(date: string): { from: string; to: string } {
  const at = new Date(`${date}T00:00:00Z`);
  const monday = at.getTime() - ((at.getUTCDay() + 6) % 7) * 86_400_000;
  return {
    from: new Date(monday).toISOString().slice(0, 10),
    to: new Date(monday + 6 * 86_400_000).toISOString().slice(0, 10),
  };
}
export type ReportSlot = "wed" | "sun";
export type ReportSettings = {
  ownerId: string;
  enabled: boolean;
  wednesdayTime: string;
  sundayTime: string;
  nextWednesdayAt: number | null;
  nextSundayAt: number | null;
  revision: number;
};
export type ReportSelection = { goalId: string; included: boolean };
export type ReportInput = {
  month: string;
  enabled: boolean;
  wednesdayTime: string;
  sundayTime: string;
  startsOn: string | null;
  goals: ReportSelection[];
};
export function nextReportOccurrence(
  now: number,
  zone: string,
  time: string,
  weekday: number,
): number {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  let searchAfter = now;
  for (let attempt = 0; attempt < 2; attempt++) {
    const resolved = nextOccurrence(searchAfter, zone, time, [weekday]);
    if (localTime(resolved, zone) === time) return resolved;
    let candidate = DateTime.fromMillis(resolved, { zone });
    if (candidate.hour !== hour || candidate.minute !== minute) {
      // Use the first real minute after a missing local time, rather than adding the DST gap.
      for (let i = 0; i < 180; i++) {
        const previous = DateTime.fromMillis(candidate.toMillis() - 60_000, { zone });
        if (
          previous.toISODate() !== candidate.toISODate() ||
          previous.hour * 60 + previous.minute < hour * 60 + minute
        )
          break;
        candidate = previous;
      }
    }
    if (candidate.toMillis() > now) return candidate.toMillis();
    // The first real minute of today's gap may already have passed, even though
    // ordinary reminders still have a later gap-shifted occurrence today.
    searchAfter = resolved;
  }
  throw new Error("Report schedule cannot be resolved");
}
