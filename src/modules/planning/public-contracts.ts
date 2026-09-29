import type { GoalEntry, GoalEntryInput, GoalRecord, GoalResource } from "./application/model";

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
  list(ownerId: string, month: string): Promise<GoalResource[]>;
  goal(ownerId: string, goalId: string): Promise<GoalRecord | null>;
  entry(ownerId: string, goalId: string, date: string): Promise<EntrySnapshot | null>;
  recordAnswer(input: RecordAnswerInput): Promise<"saved" | "conflict">;
}
