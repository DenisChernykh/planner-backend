import type { EntrySnapshot, RecordAnswerInput } from "../public-contracts";
import { EntryDateFutureError, EntryDateInvalidError, GoalNotFoundError } from "./errors";
import type { GoalRecord } from "./model";
import type { StoredEntry } from "./ports";
import { plannerToday, validateEntry } from "./use-cases";

export interface AnswerRepository {
  findOwnedActiveGoal(goalId: string, ownerId: string): Promise<GoalRecord | null>;
  entrySnapshot(ownerId: string, goalId: string, date: string): Promise<EntrySnapshot | null>;
  recordAnswer(
    input: RecordAnswerInput,
    entry: StoredEntry,
    goalUpdatedAt: number,
  ): Promise<"saved" | "conflict">;
}

export class RecordAnswer {
  constructor(private readonly repository: AnswerRepository) {}

  async execute(input: RecordAnswerInput): Promise<"saved" | "conflict"> {
    const goal = await this.repository.findOwnedActiveGoal(input.goalId, input.ownerId);
    if (!goal) throw new GoalNotFoundError();
    const parsed = new Date(`${input.date}T12:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(input.date) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== input.date ||
      !input.date.startsWith(`${goal.month}-`)
    ) {
      throw new EntryDateInvalidError();
    }
    if (input.date > plannerToday(input.now, input.timeZone)) throw new EntryDateFutureError();
    const existing = await this.repository.entrySnapshot(input.ownerId, input.goalId, input.date);
    // Telegram changes the value only. Preserve the website note when correcting.
    const checked = validateEntry(goal.tracking, {
      ...input.value,
      note: existing?.entry.note ?? undefined,
    });
    return this.repository.recordAnswer(
      input,
      {
        goalId: goal.id,
        date: input.date,
        ...checked,
        createdAt: existing?.entry.createdAt ?? input.now,
        updatedAt: input.now,
      },
      goal.updatedAt,
    );
  }
}
