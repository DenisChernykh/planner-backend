import { EntryConflictError } from "../../domain/errors";
import { requireGoal, validateEntryDate } from "../../domain/rules";
import type { PlanningRepository } from "../ports/planning-repository";

export class DeleteGoalEntryUseCase {
  constructor(private readonly repository: PlanningRepository) {}

  async execute({
    ownerId,
    goalId,
    date,
    now,
    timeZone,
    expectedRevision,
  }: {
    ownerId: string;
    goalId: string;
    date: string;
    now: number;
    timeZone?: string;
    expectedRevision: string;
  }): Promise<void> {
    const goal = requireGoal(await this.repository.findOwnedActiveGoal(goalId, ownerId));
    validateEntryDate(date, goal.month, now, timeZone);
    if (!(await this.repository.deleteEntry(goalId, date, expectedRevision)))
      throw new EntryConflictError();
  }
}
