import { describe, expect, it } from "vitest";

import type { GetApiPlansMonth200GoalsItem } from "@/shared/api";

import { buildFactPayload } from "./fact-inspector-model";

const base = {
  id: "goal",
  ownerId: "owner",
  month: "2026-04",
  title: "Goal",
  description: null,
  cadence: { period: "day" as const },
  deletedAt: null,
  createdAt: 1,
  updatedAt: 1,
  entries: [],
};

describe("fact payloads", () => {
  it.each([
    [{ type: "check" }, "true", { completed: true }],
    [
      { type: "quantity", targetValue: 2, comparison: "atLeast", unit: "л" },
      "2.5",
      { value: 2.5, note: "заметка" },
    ],
    [{ type: "scale", min: 1, max: 5 }, "4", { value: 4 }],
    [{ type: "time", targetStart: "22:00" }, "22:30", { value: "22:30", note: "сон" }],
  ])("maps %o to the API body", (tracking, value, expected) => {
    const goal = { ...base, tracking } as GetApiPlansMonth200GoalsItem;
    const note = "note" in expected ? expected.note : "";
    expect(buildFactPayload(goal, value, note ? ` ${note} ` : "")).toEqual({
      ...expected,
      expectedRevision: null,
      ...("note" in expected ? { note: ` ${expected.note} ` } : {}),
    });
  });
});
