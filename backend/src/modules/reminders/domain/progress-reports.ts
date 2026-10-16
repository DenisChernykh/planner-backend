import { DateTime } from "luxon";
import { nextOccurrence } from "./schedule";
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
