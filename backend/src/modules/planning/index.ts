import { AdjustGoalEntryUseCase } from "./application/entries/adjust-goal-entry.use-case";
import { DeleteGoalEntryUseCase } from "./application/entries/delete-goal-entry.use-case";
import { GetEntrySnapshotQuery } from "./application/entries/get-entry-snapshot.query";
import { RecordAnswerUseCase } from "./application/entries/record-answer.use-case";
import { UpsertGoalEntryUseCase } from "./application/entries/upsert-goal-entry.use-case";
import { CreateGoalUseCase } from "./application/goals/create-goal.use-case";
import { DeleteGoalUseCase } from "./application/goals/delete-goal.use-case";
import { FindGoalQuery } from "./application/goals/find-goal.query";
import { ReorderGoalsUseCase } from "./application/goals/reorder-goals.use-case";
import { RestoreGoalUseCase } from "./application/goals/restore-goal.use-case";
import { UpdateGoalUseCase } from "./application/goals/update-goal.use-case";
import { EnsureCurrentPlanUseCase } from "./application/plans/ensure-current-plan.use-case";
import { GetPlanQuery } from "./application/plans/get-plan.query";
import { ListPlanQuery } from "./application/plans/list-plan.query";
import { ListTrashQuery } from "./application/plans/list-trash.query";
import { SearchPlanningQuery } from "./application/plans/search-planning.query";
import { plannerToday } from "./domain/rules";
import { D1PlanningRepository } from "./infrastructure/d1-planning-repository";
import { createPlanningHttp } from "./presentation/http";
import type { PlanningOperations } from "./public-contracts";

export function createPlanningUseCases(database: D1Database) {
  const repository = new D1PlanningRepository(database);
  const listPlan = new ListPlanQuery(repository);
  return {
    adjustEntry: new AdjustGoalEntryUseCase(repository),
    listPlan,
    search: new SearchPlanningQuery(repository),
    ensureCurrentPlan: new EnsureCurrentPlanUseCase(repository),
    getPlan: new GetPlanQuery(listPlan),
    findGoal: new FindGoalQuery(repository),
    getEntrySnapshot: new GetEntrySnapshotQuery(repository),
    recordAnswer: new RecordAnswerUseCase(repository),
    createGoal: new CreateGoalUseCase(repository),
    deleteGoal: new DeleteGoalUseCase(repository),
    deleteEntry: new DeleteGoalEntryUseCase(repository),
    listTrash: new ListTrashQuery(repository),
    reorderGoals: new ReorderGoalsUseCase(repository),
    restoreGoal: new RestoreGoalUseCase(repository),
    updateGoal: new UpdateGoalUseCase(repository),
    upsertEntry: new UpsertGoalEntryUseCase(repository),
  };
}

export function createPlanningModule(
  options: {
    getTimeZone?: (database: D1Database, ownerId: string) => Promise<string>;
    prepareCurrentPlan?: (
      database: D1Database,
      input: { ownerId: string; month: string; now: number },
    ) => Promise<void>;
  } = {},
) {
  const getTimeZone = options.getTimeZone ?? (async () => "Asia/Yekaterinburg");
  return {
    operations: createPlanningOperations,
    router: createPlanningHttp({
      getTimeZone,
      createUseCases: createPlanningUseCases,
      prepareCurrentPlan:
        options.prepareCurrentPlan ??
        (async (database, input) => {
          const timeZone = await getTimeZone(database, input.ownerId);
          const useCases = createPlanningUseCases(database);
          if (input.month === plannerToday(input.now, timeZone).slice(0, 7))
            await useCases.ensureCurrentPlan.execute({ ...input, timeZone });
        }),
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
} from "./domain/model";

export function createPlanningOperations(database: D1Database): PlanningOperations {
  const useCases = createPlanningUseCases(database);
  return {
    ensureCurrentPlan: (input) => useCases.ensureCurrentPlan.execute(input),
    list: (ownerId, month) => useCases.listPlan.execute({ ownerId, month }),
    goal: (ownerId, goalId) => useCases.findGoal.execute({ ownerId, goalId }),
    entry: (ownerId, goalId, date) => useCases.getEntrySnapshot.execute({ ownerId, goalId, date }),
    recordAnswer: (input) => useCases.recordAnswer.execute(input),
  };
}

export { PlanningError } from "./domain/errors";
