import type { GoalEntry, GoalEntryInput } from "../../domain/model";
import { requireGoal, validateEntry, validateEntryDate } from "../../domain/rules";
import type { PlanningRepository, StoredEntry } from "../ports/planning-repository";

export class UpsertGoalEntryUseCase {
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
