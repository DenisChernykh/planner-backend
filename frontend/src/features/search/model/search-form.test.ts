import { beforeEach, describe, expect, it } from "vitest";
import type { SearchGoal, SearchResult } from "@/shared/api";
import {
  initialSearchForm,
  searchFormError,
  searchParameters,
  updateSearchForm,
} from "./search-form";
import { readSearchHistory, rememberSearch, writeSearchHistory } from "./search-history";
import { resultDestination } from "./search-presentation";

const water: SearchGoal = {
  id: "water",
  title: "Вода",
  month: "2026-09",
  description: null,
  tracking: { type: "quantity", unit: "мл", comparison: "atLeast", targetValue: 1500 },
  cadence: { period: "day" },
  deletedAt: null,
};
describe("search conditions", () => {
  it("clears incompatible conditions for missing entries and automatically selects entries", () => {
    const form = updateSearchForm(
      {
        ...initialSearchForm,
        goalId: water.id,
        met: "unmet",
        note: "present",
        comparison: "lt",
        value: "1200",
      },
      { presence: "missing" },
      [water],
    );
    expect(form).toMatchObject({
      kind: "entries",
      goalId: "water",
      presence: "missing",
      met: "any",
      note: "any",
      comparison: "any",
      value: "",
    });
    expect(searchParameters(form)).not.toHaveProperty("value");
  });
  it("never reuses a numeric comparison for another goal or incompatible tracking type", () => {
    const form = {
      ...initialSearchForm,
      goalId: water.id,
      comparison: "lt" as const,
      value: "1200",
    };
    expect(updateSearchForm(form, { goalId: "pages" }, [water])).toMatchObject({
      comparison: "any",
      value: "",
    });
    expect(updateSearchForm(form, { tracking: "time" }, [water])).toMatchObject({
      goalId: "",
      comparison: "any",
    });
  });
  it("accepts zero and decimal commas, and blocks malformed dates and reversed ranges", () => {
    const form = {
      ...initialSearchForm,
      goalId: water.id,
      comparison: "between" as const,
      value: "0",
      valueTo: "1,5",
    };
    expect(searchFormError(form, [water])).toBeNull();
    expect(searchParameters(form)).toMatchObject({ value: "0", valueTo: "1.5" });
    expect(searchFormError({ ...form, value: "2" }, [water])).toContain("Верхняя граница");
    expect(
      searchFormError(
        { ...initialSearchForm, scope: "range", from: "2026-02-30", to: "2026-03-01" },
        [],
      ),
    ).not.toBeNull();
  });
  it("opens deleted results in the trash without a restore action", () => {
    const result: SearchResult = {
      id: "entry:water:2026-09-25",
      kind: "entry",
      goal: { ...water, deletedAt: 1 },
      date: "2026-09-25",
      entry: null,
      match: null,
    };
    expect(resultDestination(result)).toBe("/plans/2026-09/trash?goal=water&date=2026-09-25");
  });
});
describe("recent searches", () => {
  beforeEach(() => localStorage.clear());
  it("keeps complete conditions per account, deduplicates and rejects invalid stored data", () => {
    const form = {
      ...initialSearchForm,
      q: " колено ",
      scope: "month" as const,
      from: "2026-09-01",
      to: "2026-09-30",
    };
    const history = rememberSearch(rememberSearch([], form), form);
    expect(history).toHaveLength(1);
    expect(history[0]?.q).toBe("колено");
    writeSearchHistory("first", history);
    expect(readSearchHistory("first")).toEqual(history);
    expect(readSearchHistory("second")).toEqual([]);
    localStorage.setItem("planner.search.v1.first", '[{"q":"invalid"}]');
    expect(readSearchHistory("first")).toEqual([]);
    expect(rememberSearch([], initialSearchForm)).toEqual([]);
  });
});
