import { D1PlanningRepository } from "./infrastructure/d1-planning-repository";
import { createPlanningHttp } from "./presentation/http";

export function createPlanningModule() {
  return {
    router: createPlanningHttp({
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
