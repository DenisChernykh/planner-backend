import { ApplicationError } from "../../../../shared/application/application-error";
import type { PlanningOperations } from "../../../planning/public-contracts";
import type { GoalReminderInput } from "../../domain/model";
import { nextOccurrence, validateReminder } from "../../domain/schedule";
import type { ReminderRepository } from "../ports/reminder-repository";

export class SaveGoalReminderUseCase {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly planning: PlanningOperations,
  ) {}

  async execute({
    ownerId,
    goalId,
    input,
    now,
  }: {
    ownerId: string;
    goalId: string;
    input: GoalReminderInput;
    now: number;
  }) {
    validateReminder(input);
    if (!(await this.planning.goal(ownerId, goalId)))
      throw new ApplicationError("NOT_FOUND", "Вопрос или цель больше недоступны.");
    const settings = await this.repository.settings(ownerId);
    const reminder = {
      ...input,
      ownerId,
      goalId,
      nextRunAt:
        input.mode === "scheduled"
          ? nextOccurrence(now, settings.timeZone, input.time, input.weekdays)
          : null,
    };
    await this.repository.saveReminder(reminder);
    return reminder;
  }
}
