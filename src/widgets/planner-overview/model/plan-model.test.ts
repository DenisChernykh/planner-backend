import { describe, expect, it } from "vitest";
import type { PlanGoal } from "./plan-model";
import { getAvailableDates, getProgress } from "./plan-model";

function goal(cadence: PlanGoal["cadence"], entries: PlanGoal["entries"]): PlanGoal {
  return {
    id: "goal",
    ownerId: "owner",
    month: "2026-04",
    title: "Goal",
    description: null,
    tracking: { type: "check" },
    cadence,
    deletedAt: null,
    createdAt: 1,
    updatedAt: 1,
    entries,
  };
}

const entry = (date: string, met: boolean): PlanGoal["entries"][number] => ({
  date,
  value: met,
  met,
  note: null,
  createdAt: 1,
  updatedAt: 1,
});

describe("plan progress", () => {
  it("counts only available days for daily goals", () => {
    const dates = ["2026-04-13", "2026-04-14", "2026-04-15", "2026-05-01"];
    expect(getAvailableDates(dates, "2026-04", "2026-04-14")).toEqual(["2026-04-13", "2026-04-14"]);
    expect(
      getProgress(
        goal({ period: "day" }, [entry("2026-04-13", true), entry("2026-04-15", true)]),
        dates,
        "2026-04",
        "2026-04-14",
      ),
    ).toMatchObject({ value: 1, total: 2 });
  });

  it("uses met for weekly and monthly progress", () => {
    const entries = [
      entry("2026-04-13", true),
      entry("2026-04-14", false),
      entry("2026-04-20", true),
    ];
    expect(
      getProgress(
        goal({ period: "week", targetOccurrences: 2 }, entries),
        [
          "2026-04-13",
          "2026-04-14",
          "2026-04-15",
          "2026-04-16",
          "2026-04-17",
          "2026-04-18",
          "2026-04-19",
        ],
        "2026-04",
        "2026-04-30",
      ),
    ).toMatchObject({ value: 1, total: 2 });
    expect(
      getProgress(
        goal({ period: "month", targetOccurrences: 3 }, entries),
        [],
        "2026-04",
        "2026-04-30",
      ),
    ).toMatchObject({ value: 2, total: 3 });
  });
});
