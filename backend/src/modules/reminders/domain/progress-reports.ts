import { DateTime } from "luxon";
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
  const start = DateTime.fromMillis(now, { zone }).startOf("day");
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  for (let offset = 0; offset <= 8; offset++) {
    const day = start.plus({ days: offset });
    if (day.weekday !== weekday) continue;
    let candidate = day.set({ hour, minute, second: 0, millisecond: 0 });
    candidate =
      candidate.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis())[0] ?? candidate;
    if (candidate.toFormat("HH:mm") !== time) {
      // Use the first real minute after a missing local time, rather than adding the DST gap.
      for (let i = 0; i < 180; i++) {
        const previous = candidate.minus({ minutes: 1 });
        if (previous.toISODate() !== day.toISODate() || previous.toFormat("HH:mm") < time) break;
        candidate = previous;
      }
    }
    if (candidate.toMillis() > now) return candidate.toMillis();
  }
  throw new Error("Report schedule cannot be resolved");
}
