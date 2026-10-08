import type {
  GoalEntry,
  GoalEntryInput,
  GoalOrderCadence,
  GoalPatchInput,
  GoalRecord,
} from "../../domain/model";
import type { ProgressPlanningSource } from "../../public-contracts";

export type GoalUpdate = GoalPatchInput & {
  updatedAt: number;
};

export type StoredEntry = GoalEntry & { goalId: string };
export type EntryWrite = Omit<StoredEntry, "revision">;

export interface PlanningRepository {
  progressSources(
    ownerId: string,
    fromMonth: string,
    toMonth: string,
  ): Promise<ProgressPlanningSource[]>;
  createGoal(goal: GoalRecord): Promise<GoalRecord>;
  findOwnedActiveGoal(goalId: string, ownerId: string): Promise<GoalRecord | null>;
  listGoals(ownerId: string, month: string, includeDeleted: boolean): Promise<GoalRecord[]>;
  reorderGoals(
    ownerId: string,
    month: string,
    cadence: GoalOrderCadence,
    goalIds: string[],
  ): Promise<boolean>;
  updateOwnedGoal(goalId: string, ownerId: string, changes: GoalUpdate): Promise<GoalRecord | null>;
  softDeleteOwnedGoal(goalId: string, ownerId: string, deletedAt: number): Promise<boolean>;
  restoreOwnedGoal(goalId: string, ownerId: string, updatedAt: number): Promise<boolean>;
  listEntries(goalId: string): Promise<StoredEntry[]>;
  listEntriesForPlan(
    ownerId: string,
    month: string,
    includeDeleted: boolean,
  ): Promise<StoredEntry[]>;
  upsertEntry(entry: EntryWrite, expectedRevision?: string | null): Promise<StoredEntry>;
  deleteEntry(goalId: string, date: string, expectedRevision: string): Promise<boolean>;
}

export type { GoalEntryInput };
