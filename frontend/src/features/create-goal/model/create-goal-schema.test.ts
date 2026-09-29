import { describe, expect, it } from "vitest";

import { createGoalDefaultValues, createGoalFormSchema } from "./create-goal-schema";

function parse(overrides: Partial<typeof createGoalDefaultValues> = {}, month = "2026-04") {
  return createGoalFormSchema(month).safeParse({ ...createGoalDefaultValues, ...overrides });
}

describe("createGoalFormSchema", () => {
  it("trims common values and omits blank optional fields", () => {
    const result = parse({ title: "  Тренировка  ", description: "   " });
    expect(result).toMatchObject({
      success: true,
      data: {
        title: "Тренировка",
        tracking: { type: "check" },
        cadence: { period: "day" },
      },
    });
    if (result.success) expect(result.data).not.toHaveProperty("description");
  });

  it("builds a finite quantity payload and trims its unit", () => {
    expect(
      parse({
        title: "Вода",
        trackingType: "quantity",
        comparison: "atLeast",
        targetValue: "2.5",
        unit: "  л  ",
      }),
    ).toMatchObject({
      success: true,
      data: {
        tracking: { type: "quantity", comparison: "atLeast", targetValue: 2.5, unit: "л" },
      },
    });
    expect(
      parse({ title: "Вода", trackingType: "quantity", targetValue: "Infinity" }).success,
    ).toBe(false);
  });

  it("requires an increasing integer scale", () => {
    expect(
      parse({ title: "Энергия", trackingType: "scale", scaleMin: "1", scaleMax: "5" }),
    ).toMatchObject({
      success: true,
      data: { tracking: { type: "scale", min: 1, max: 5 } },
    });
    expect(
      parse({ title: "Энергия", trackingType: "scale", scaleMin: "5", scaleMax: "5" }).success,
    ).toBe(false);
    expect(
      parse({ title: "Энергия", trackingType: "scale", scaleMin: "1.5", scaleMax: "5" }).success,
    ).toBe(false);
  });

  it.each([
    [{}, { type: "time" }],
    [{ targetStart: "08:30" }, { type: "time", targetStart: "08:30" }],
    [{ targetEnd: "18:15" }, { type: "time", targetEnd: "18:15" }],
    [
      { targetStart: "22:00", targetEnd: "06:00" },
      { type: "time", targetStart: "22:00", targetEnd: "06:00" },
    ],
  ])("supports optional time bounds %#", (bounds, tracking) => {
    expect(parse({ title: "Сон", trackingType: "time", ...bounds })).toMatchObject({
      success: true,
      data: { tracking },
    });
  });

  it("validates time and cadence against the selected month", () => {
    expect(parse({ title: "Сон", trackingType: "time", targetStart: "   " })).toMatchObject({
      success: true,
      data: { tracking: { type: "time" } },
    });
    expect(parse({ title: "Сон", trackingType: "time", targetStart: "24:00" }).success).toBe(false);
    expect(parse({ title: "Бег", cadencePeriod: "week", targetOccurrences: "7" }).success).toBe(
      true,
    );
    expect(parse({ title: "Бег", cadencePeriod: "week", targetOccurrences: "8" }).success).toBe(
      false,
    );
    expect(parse({ title: "Бег", cadencePeriod: "month", targetOccurrences: "30" }).success).toBe(
      true,
    );
    expect(parse({ title: "Бег", cadencePeriod: "month", targetOccurrences: "31" }).success).toBe(
      false,
    );
    expect(
      parse({ title: "Бег", cadencePeriod: "month", targetOccurrences: "29" }, "2028-02").success,
    ).toBe(true);
  });
});
