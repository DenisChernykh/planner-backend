import { describe, expect, it } from "vitest";

import {
  addPlannerDays,
  addPlannerMonth,
  clampPlannerDate,
  clampPlannerWeekStart,
  getPlannerMonthEnd,
  getPlannerMonthWeekBounds,
  getPlannerWeekDates,
  getPlannerWeekStart,
} from "./planner-calendar";

describe("planner calendar", () => {
  it("uses Monday weeks and the real month end", () => {
    expect(getPlannerWeekStart("2026-04-15")).toBe("2026-04-13");
    expect(getPlannerWeekDates("2026-04-27")).toEqual([
      "2026-04-27",
      "2026-04-28",
      "2026-04-29",
      "2026-04-30",
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
    ]);
    expect(getPlannerMonthEnd("2026-04")).toBe("2026-04-30");
  });

  it("clamps server today to a requested month", () => {
    expect(clampPlannerDate("2026-09-01", "2026-09-01", "2026-04")).toBe("2026-04-30");
    expect(clampPlannerDate("2026-09-01", "2026-09-01", "2026-11")).toBe("2026-11-01");
    expect(clampPlannerDate("2026-04-20", "2026-04-15", "2026-04")).toBe("2026-04-15");
  });

  it("limits week navigation to weeks intersecting the month", () => {
    expect(getPlannerMonthWeekBounds("2026-04")).toEqual({
      first: "2026-03-30",
      last: "2026-04-27",
    });
    expect(clampPlannerWeekStart("2026-03-23", "2026-04")).toBe("2026-03-30");
    expect(clampPlannerWeekStart("2026-05-04", "2026-04")).toBe("2026-04-27");
  });

  it("keeps date-only arithmetic correct across leap days and year boundaries", () => {
    expect(addPlannerDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(getPlannerMonthEnd("2024-02")).toBe("2024-02-29");
    expect(addPlannerDays("2024-12-31", 1)).toBe("2025-01-01");
    expect(addPlannerMonth("2024-12", 1)).toBe("2025-01");
  });
});
