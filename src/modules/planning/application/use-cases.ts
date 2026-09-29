import {
  EntryNotFoundError,
  GoalCadenceInvalidError,
  GoalNotFoundError,
  GoalOrderMismatchError,
} from "../domain/errors";
import type {
  GoalCreateInput,
  GoalEntry,
  GoalEntryInput,
  GoalOrderCadence,
  GoalPatchInput,
  GoalRecord,
  GoalResource,
} from "../domain/model";
import {
  requireGoal,
  validateEntry,
  validateEntryDate,
  validateGoalChanges,
  validateGoalCreation,
  validateGoalOrder,
  validMonth,
} from "../domain/rules";
import type { PlanningRepository, StoredEntry } from "./ports";

async function withEntries(
  repository: PlanningRepository,
  ownerId: string,
  month: string,
  includeDeleted: boolean,
  goals: GoalRecord[],
): Promise<GoalResource[]> {
  const entriesByGoal = new Map<string, GoalEntry[]>();
  for (const entry of await repository.listEntriesForPlan(ownerId, month, includeDeleted)) {
    const entries = entriesByGoal.get(entry.goalId) ?? [];
    entries.push(entry);
    entriesByGoal.set(entry.goalId, entries);
  }

  return goals.map((goal) => ({ ...goal, entries: entriesByGoal.get(goal.id) ?? [] }));
}

export class CreateGoal {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(
    input: GoalCreateInput & { month: string; now: number; ownerId: string },
  ): Promise<GoalRecord> {
    const definition = validateGoalCreation(input, input.month);
    return this.repository.createGoal({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      month: input.month,
      ...definition,
      deletedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }
}

export class ListPlan {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(ownerId: string, month: string): Promise<GoalResource[]> {
    if (!validMonth(month)) throw new GoalCadenceInvalidError();
    return withEntries(
      this.repository,
      ownerId,
      month,
      false,
      await this.repository.listGoals(ownerId, month, false),
    );
  }
}

export class ListTrash {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(ownerId: string, month: string): Promise<GoalResource[]> {
    if (!validMonth(month)) throw new GoalCadenceInvalidError();
    return withEntries(
      this.repository,
      ownerId,
      month,
      true,
      await this.repository.listGoals(ownerId, month, true),
    );
  }
}

export class ReorderGoals {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(input: {
    ownerId: string;
    month: string;
    cadence: GoalOrderCadence;
    goalIds: string[];
  }): Promise<void> {
    validateGoalOrder(input.month, input.cadence, input.goalIds);
    if (
      !(await this.repository.reorderGoals(
        input.ownerId,
        input.month,
        input.cadence,
        input.goalIds,
      ))
    ) {
      throw new GoalOrderMismatchError();
    }
  }
}

export class UpdateGoal {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(
    input: GoalPatchInput & { goalId: string; now: number; ownerId: string },
  ): Promise<GoalRecord> {
    const goal = requireGoal(
      await this.repository.findOwnedActiveGoal(input.goalId, input.ownerId),
    );
    const changes = { updatedAt: input.now, ...validateGoalChanges(goal, input) };
    const updated = await this.repository.updateOwnedGoal(input.goalId, input.ownerId, changes);
    return requireGoal(updated);
  }
}

export class DeleteGoal {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(ownerId: string, goalId: string, now: number): Promise<void> {
    if (!(await this.repository.softDeleteOwnedGoal(goalId, ownerId, now))) {
      throw new GoalNotFoundError();
    }
  }
}

export class RestoreGoal {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(ownerId: string, goalId: string, now: number): Promise<void> {
    if (!(await this.repository.restoreOwnedGoal(goalId, ownerId, now))) {
      throw new GoalNotFoundError();
    }
  }
}

export class UpsertGoalEntry {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(input: {
    date: string;
    goalId: string;
    now: number;
    ownerId: string;
    value: GoalEntryInput;
    timeZone?: string;
  }): Promise<GoalEntry> {
    const goal = requireGoal(
      await this.repository.findOwnedActiveGoal(input.goalId, input.ownerId),
    );
    validateEntryDate(input.date, goal.month, input.now, input.timeZone);
    const checked = validateEntry(goal.tracking, input.value);
    const stored: StoredEntry = {
      goalId: input.goalId,
      date: input.date,
      value: checked.value,
      met: checked.met,
      note: checked.note,
      createdAt: input.now,
      updatedAt: input.now,
    };
    const existing = (await this.repository.listEntries(input.goalId)).find(
      (entry) => entry.date === input.date,
    );
    if (existing) stored.createdAt = existing.createdAt;
    const result = await this.repository.upsertEntry(stored);
    return result;
  }
}

export class DeleteGoalEntry {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(
    ownerId: string,
    goalId: string,
    date: string,
    now: number,
    timeZone?: string,
  ): Promise<void> {
    const goal = requireGoal(await this.repository.findOwnedActiveGoal(goalId, ownerId));
    validateEntryDate(date, goal.month, now, timeZone);
    if (!(await this.repository.deleteEntry(goalId, date))) throw new EntryNotFoundError();
  }
}
