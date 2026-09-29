import type {
  GoalEntry,
  GoalEntryInput,
  GoalOrderCadence,
  GoalPatchInput,
  GoalRecord,
} from "../../domain/model";

export type GoalUpdate = GoalPatchInput & {
  updatedAt: number;
};

export type StoredEntry = GoalEntry & { goalId: string };

export interface PlanningRepository {
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
  upsertEntry(entry: StoredEntry): Promise<StoredEntry>;
  deleteEntry(goalId: string, date: string): Promise<boolean>;
}

export type { GoalEntryInput };
