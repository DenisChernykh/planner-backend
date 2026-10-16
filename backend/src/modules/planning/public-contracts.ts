import type {
  GoalCadence,
  GoalEntry,
  GoalEntryInput,
  GoalRecord,
  GoalResource,
  GoalTracking,
} from "./domain/model";

export { PlanningError } from "./domain/errors";
export type * from "./domain/model";
export { calculateMet, isScaleValueValid } from "./domain/rules";

export type ProgressPlanningSource = {
  id: string;
  chainId: string;
  month: string;
  title: string;
  tracking: GoalTracking;
  cadence: GoalCadence;
  entries: Pick<GoalEntry, "date" | "value" | "met">[];
};

export type EntrySnapshot = { entry: GoalEntry; revision: string };
export type RecordAnswerInput = {
  ownerId: string;
  goalId: string;
  date: string;
  value: GoalEntryInput;
  expectedRevision: string | null;
  operationId: string;
  now: number;
  timeZone: string;
};
export interface PlanningOperations {
  progressSources(
    ownerId: string,
    fromMonth: string,
    toMonth: string,
    entryGoalIds?: string[],
  ): Promise<ProgressPlanningSource[]>;
  ensureCurrentPlan(input: {
    ownerId: string;
    now: number;
    timeZone: string;
    includeCarriedGoals?: boolean;
  }): Promise<{ month: string; carriedGoals: { sourceGoalId: string; goalId: string }[] }>;
  list(ownerId: string, month: string): Promise<GoalResource[]>;
  listForDate(ownerId: string, date: string): Promise<GoalResource[]>;
  goal(ownerId: string, goalId: string): Promise<GoalRecord | null>;
  entry(ownerId: string, goalId: string, date: string): Promise<EntrySnapshot | null>;
  recordAnswer(input: RecordAnswerInput): Promise<"saved" | "conflict">;
}
