import type { GetApiPlansMonth200GoalsItem } from "@/shared/api";

const TIME_VALUE_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

type QuickFactGoal = GetApiPlansMonth200GoalsItem;

export function getQuickScaleOptions(goal: QuickFactGoal): number[] | undefined {
  if (goal.tracking.type !== "scale") return undefined;
  const { min, max } = goal.tracking;
  const count = max - min + 1;
  if (count > 10) return undefined;
  return Array.from({ length: count }, (_, index) => min + index);
}

export function isQuickFactValueValid(goal: QuickFactGoal, value: string): boolean {
  if (!value.trim()) return false;
  if (goal.tracking.type === "check") return value === "true" || value === "false";
  if (goal.tracking.type === "quantity") return Number.isFinite(Number(value));
  if (goal.tracking.type === "scale") {
    const numericValue = Number(value);
    return (
      Number.isInteger(numericValue) &&
      numericValue >= goal.tracking.min &&
      numericValue <= goal.tracking.max
    );
  }
  return TIME_VALUE_PATTERN.test(value);
}
