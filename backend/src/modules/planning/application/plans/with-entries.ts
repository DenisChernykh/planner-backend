import type { GoalEntry, GoalRecord, GoalResource } from "../../domain/model";
import type { PlanningRepository } from "../ports/planning-repository";
export async function withEntries(
  repository: PlanningRepository,
  ownerId: string,
  month: string,
  includeDeleted: boolean,
  goals: GoalRecord[],
  date?: string,
): Promise<GoalResource[]> {
  const entriesByGoal = new Map<string, GoalEntry[]>();
  for (const entry of await repository.listEntriesForPlan(ownerId, month, includeDeleted, date)) {
    const entries = entriesByGoal.get(entry.goalId) ?? [];
    entries.push(entry);
    entriesByGoal.set(entry.goalId, entries);
  }

  return goals.map((goal) => ({ ...goal, entries: entriesByGoal.get(goal.id) ?? [] }));
}
