import { GoalNotFoundError } from "../../domain/errors";
import { validateAnswerDate, validateEntry } from "../../domain/rules";
import type { RecordAnswerInput } from "../../public-contracts";
import type { AnswerRepository } from "../ports/answer-repository";
export class RecordAnswerUseCase {
  constructor(private readonly repository: AnswerRepository) {}

  async execute(input: RecordAnswerInput): Promise<"saved" | "conflict"> {
    const goal = await this.repository.findOwnedActiveGoal(input.goalId, input.ownerId);
    if (!goal) throw new GoalNotFoundError();
    validateAnswerDate(input.date, goal.month, input.now, input.timeZone);
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
