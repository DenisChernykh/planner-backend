import type { PlanningOperations } from "../../../planning/public-contracts";
import type { ReminderRepository } from "../ports/reminder-repository";

export class GetGoalRemindersQuery {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly planning: PlanningOperations,
  ) {}

  async execute({ ownerId, month }: { ownerId: string; month: string }) {
    const goals = await this.planning.list(ownerId, month);
    const settings = new Map(
      (await this.repository.reminders(ownerId)).map((item) => [item.goalId, item]),
    );
    return goals.map((goal) => {
      const item = settings.get(goal.id);
      return {
        goalId: goal.id,
        title: goal.title,
        mode: item?.mode ?? ("off" as const),
        time: item?.time ?? "09:00",
        weekdays: item?.weekdays ?? [1, 2, 3, 4, 5, 6, 7],
        nextRunAt: item?.nextRunAt ?? null,
      };
    });
  }
}
