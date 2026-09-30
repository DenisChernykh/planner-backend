import type { GoalRecord } from "../../domain/model";

export type CarriedGoal = { sourceGoalId: string; goalId: string };
export type MonthRolloverState = {
  initialized: boolean;
  sourceMonth: string | null;
  goals: { goal: GoalRecord; revision: string; sortOrder: number }[];
};
export type MonthRolloverCommit = {
  ownerId: string;
  month: string;
  operationId: string;
  sourceMonth: string | null;
  now: number;
  goals: { sourceGoalId: string; revision: string; sortOrder: number; goal: GoalRecord }[];
};
export interface MonthRolloverRepository {
  rolloverState(ownerId: string, month: string): Promise<MonthRolloverState>;
  commitRollover(input: MonthRolloverCommit): Promise<boolean>;
  // Oldest first, through this month, to recover incomplete reminder inheritance chains.
  carriedGoals(ownerId: string, month: string): Promise<CarriedGoal[]>;
}
