import type { GoalRecord } from "./model";
import { daysInMonth, validateGoalCreation } from "./rules";

export function carryGoalToMonth(
  source: GoalRecord,
  month: string,
  id: string,
  now: number,
): GoalRecord {
  const days = daysInMonth(month);
  const cadence =
    source.cadence.period === "month"
      ? { ...source.cadence, targetOccurrences: Math.min(source.cadence.targetOccurrences, days) }
      : source.cadence;
  const definition = validateGoalCreation(
    {
      title: source.title,
      ...(source.description === null ? {} : { description: source.description }),
      tracking: source.tracking,
      cadence,
    },
    month,
  );
  return {
    ...definition,
    id,
    ownerId: source.ownerId,
    month,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
