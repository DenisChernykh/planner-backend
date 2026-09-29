import { RecordAnswer } from "./application/record-answer";
import { ListPlan } from "./application/use-cases";
import { D1PlanningRepository } from "./infrastructure/d1-planning-repository";
import { createPlanningHttp } from "./presentation/http";
import type { PlanningOperations } from "./public-contracts";

export function createPlanningModule(
  options: { getTimeZone?: (database: D1Database, ownerId: string) => Promise<string> } = {},
) {
  return {
    operations: createPlanningOperations,
    router: createPlanningHttp({
      getTimeZone: options.getTimeZone ?? (async () => "Asia/Yekaterinburg"),
      createRepository: (database) => new D1PlanningRepository(database),
    }),
  };
}

export type {
  CheckTracking,
  DailyCadence,
  GoalCadence,
  GoalCreateInput,
  GoalEntry,
  GoalEntryInput,
  GoalPatchInput,
  GoalRecord,
  GoalResource,
  GoalTracking,
  QuantityTracking,
  RepeatingCadence,
  ScaleTracking,
  TimeTracking,
} from "./application/model";

export function createPlanningOperations(database: D1Database): PlanningOperations {
  const repository = new D1PlanningRepository(database);
  return {
    list: (ownerId, month) => new ListPlan(repository).execute(ownerId, month),
    goal: (ownerId, goalId) => repository.findOwnedActiveGoal(goalId, ownerId),
    entry: (ownerId, goalId, date) => repository.entrySnapshot(ownerId, goalId, date),
    recordAnswer: (input) => new RecordAnswer(repository).execute(input),
  };
}

export { PlanningError } from "./application/errors";
