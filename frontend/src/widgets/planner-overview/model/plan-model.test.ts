import { describe, expect, it } from "vitest";
import type { PlanGoal } from "./plan-model";
import { formatEntryValue, getAvailableDates, getProgress } from "./plan-model";

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
  revision: "test-revision",
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

describe("fact value formatting", () => {
  it("keeps stored values for quantity, scale, and time facts", () => {
    const quantityGoal = {
      ...goal({ period: "day" }, []),
      tracking: {
        type: "quantity" as const,
        targetValue: 5_000,
        comparison: "atLeast" as const,
        unit: "шаг",
      },
    };
    const scaleGoal = {
      ...goal({ period: "day" }, []),
      tracking: { type: "scale" as const, min: 1, max: 10 },
    };
    const timeGoal = {
      ...goal({ period: "day" }, []),
      tracking: { type: "time" as const, targetEnd: "09:00" },
    };

    expect(formatEntryValue(quantityGoal, { ...entry("2026-04-13", true), value: 5_163 })).toBe(
      "5163 шаг",
    );
    expect(formatEntryValue(scaleGoal, { ...entry("2026-04-13", false), value: 4 })).toBe("4");
    expect(formatEntryValue(timeGoal, { ...entry("2026-04-13", true), value: "08:45" })).toBe(
      "08:45",
    );
  });
});
