import type { GoalResource, PlanningOperations } from "../../../planning/public-contracts";
import { needsReminder } from "../../domain/jobs";
import type { ReminderSettings } from "../../domain/model";
import type { ReminderRepository } from "../ports/reminder-repository";

export class FindMissingGoalsQuery {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly planning: PlanningOperations,
  ) {}

  async execute({
    ownerId,
    date,
  }: {
    ownerId: string;
    date: string;
    settings: ReminderSettings;
  }): Promise<GoalResource[]> {
    const goals = await this.planning.listForDate(ownerId, date);
    // The persisted local date already identifies the calendar day, including DST days.
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
    const configured = new Map(
      (await this.repository.reminders(ownerId)).map((item) => [item.goalId, item]),
    );
    return goals.filter((goal) =>
      needsReminder(
        weekday,
        configured.get(goal.id),
        goal.entries.some((entry) => entry.date === date),
      ),
    );
  }
}
