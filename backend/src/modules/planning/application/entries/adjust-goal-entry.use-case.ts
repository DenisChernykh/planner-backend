import { EntryConflictError, EntryValueInvalidError } from "../../domain/errors";
import type { GoalEntry } from "../../domain/model";
import { requireGoal, validateEntry, validateEntryDate } from "../../domain/rules";
import type { AnswerRepository } from "../ports/answer-repository";

export class AdjustGoalEntryUseCase {
  constructor(private readonly repository: AnswerRepository) {}

  async execute(input: {
    ownerId: string;
    goalId: string;
    date: string;
    delta: number;
    operationId: string;
    now: number;
    timeZone: string;
  }): Promise<GoalEntry> {
    const goal = requireGoal(
      await this.repository.findOwnedActiveGoal(input.goalId, input.ownerId),
    );
    validateEntryDate(input.date, goal.month, input.now, input.timeZone);
    if (goal.tracking.type !== "quantity" || !Number.isFinite(input.delta))
      throw new EntryValueInvalidError();
    const snapshot = await this.repository.entrySnapshot(input.ownerId, input.goalId, input.date);
    const current = snapshot?.entry.value ?? 0;
    if (typeof current !== "number") throw new EntryValueInvalidError();
    const checked = validateEntry(goal.tracking, {
      value: current + input.delta,
      note: snapshot?.entry.note ?? undefined,
    });
    // Scope the receipt to the account, goal and date. The D1 receipt and write
    // commit together. Keep the receipt for the goal's lifetime so an old
    // operation cannot add the quantity again after routine cleanup.
    const operationId = `chatgpt:${input.ownerId}:${input.goalId}:${input.date}:${input.operationId}`;
    const result = await this.repository.recordAnswer(
      {
        ...input,
        operationId,
        value: { value: current + input.delta },
        expectedRevision: snapshot?.revision ?? null,
      },
      {
        ...checked,
        goalId: goal.id,
        date: input.date,
        createdAt: snapshot?.entry.createdAt ?? input.now,
        updatedAt: input.now,
      },
      goal.updatedAt,
      "goal",
    );
    const saved = await this.repository.entrySnapshot(input.ownerId, input.goalId, input.date);
    if (result === "conflict" || !saved) throw new EntryConflictError();
    return saved.entry;
  }
}
