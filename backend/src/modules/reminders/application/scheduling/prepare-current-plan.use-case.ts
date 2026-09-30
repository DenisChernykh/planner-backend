import type { PlanningOperations } from "../../../planning/public-contracts";
import { localDate, nextOccurrence, startOfReminderDay } from "../../domain/schedule";
import type { ReminderRepository } from "../ports/reminder-repository";

export class PrepareCurrentPlanUseCase {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly planning: PlanningOperations,
  ) {}

  async execute({
    ownerId,
    now,
    month,
  }: {
    ownerId: string;
    now: number;
    month?: string;
  }): Promise<void> {
    const settings = await this.repository.settings(ownerId);
    const currentMonth = localDate(now, settings.timeZone).slice(0, 7);
    if (month !== undefined && month !== currentMonth) return;
    const plan = await this.planning.ensureCurrentPlan({
      ownerId,
      now,
      timeZone: settings.timeZone,
    });
    if (plan.carriedGoals.length === 0) return;
    const reminders = new Map(
      (await this.repository.reminders(ownerId)).map((rule) => [rule.goalId, rule]),
    );
    for (const { sourceGoalId, goalId } of plan.carriedGoals) {
      const source = reminders.get(sourceGoalId);
      if (!source || reminders.has(goalId)) continue;
      const target = {
        ...source,
        goalId,
        nextRunAt:
          source.mode === "scheduled"
            ? nextOccurrence(
                startOfReminderDay(now, settings.timeZone) - 1,
                settings.timeZone,
                source.time,
                source.weekdays,
              )
            : null,
      };
      if (await this.repository.inheritReminder(source, target, settings.timeZone))
        reminders.set(goalId, target);
    }
  }
}
