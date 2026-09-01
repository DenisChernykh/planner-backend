import { describe, expect, it } from "vitest";

import {
  formatPlannerMonth,
  getCurrentPlannerMonth,
  getPlannerMonthDays,
  isPlannerMonth,
} from "./planner-month";

describe("planner month helpers", () => {
  it("uses the planner timezone for the root redirect", () => {
    expect(getCurrentPlannerMonth(new Date("2026-08-31T21:30:00.000Z"))).toBe("2026-09");
  });

  it("validates, formats and measures a month", () => {
    expect(isPlannerMonth("2026-02")).toBe(true);
    expect(isPlannerMonth("2026-13")).toBe(false);
    expect(formatPlannerMonth("2026-04")).toBe("Апрель 2026");
    expect(getPlannerMonthDays("2028-02")).toBe(29);
  });
});
