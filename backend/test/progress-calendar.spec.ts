import { describe, expect, it } from "vitest";
import {
  datesBetween,
  intervalFor,
  previousInterval,
  shiftDate,
  validProgressDate,
} from "../src/modules/progress/domain/calendar";

describe("progress date-only calendar", () => {
  it("validates leap days without accepting JavaScript's date normalization", () => {
    expect(validProgressDate("2024-02-29")).toBe(true);
    for (const date of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-1-01", "invalid"])
      expect(validProgressDate(date)).toBe(false);
  });
  it("keeps calendar days continuous across DST, leap and year boundaries", () => {
    expect(datesBetween("2026-03-28", "2026-03-30")).toEqual([
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
    ]);
    expect(datesBetween("2024-02-28", "2024-03-01")).toEqual([
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
    ]);
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(datesBetween("2026-01-02", "2026-01-01")).toEqual([]);
  });
  it("uses Monday weeks and the actual month length", () => {
    expect(intervalFor("week", "2027-01-03")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
    expect(intervalFor("week", "2027-01-04")).toEqual({ from: "2027-01-04", to: "2027-01-10" });
    expect(intervalFor("month", "2024-02-15")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
  it("compares the same elapsed month days and rejects a shorter previous month", () => {
    const march = intervalFor("month", "2026-03-15");
    expect(previousInterval("month", march, "2026-03-15")).toEqual({
      from: "2026-02-01",
      to: "2026-02-15",
    });
    expect(previousInterval("month", march, "2026-03-31")).toBeNull();
    expect(previousInterval("month", march, "2026-02-28")).toBeNull();
    expect(previousInterval("month", intervalFor("month", "2026-01-15"), "2026-01-15")).toEqual({
      from: "2025-12-01",
      to: "2025-12-15",
    });
  });
});
