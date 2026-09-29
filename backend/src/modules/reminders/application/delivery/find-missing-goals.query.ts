import type { GoalResource } from "../../../planning";
import type { PlanningOperations } from "../../../planning/public-contracts";
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
    settings,
  }: {
    ownerId: string;
    date: string;
    settings: ReminderSettings;
  }): Promise<GoalResource[]> {
    const goals = await this.planning.list(ownerId, date.slice(0, 7));
    const configured = new Map(
      (await this.repository.reminders(ownerId)).map((item) => [item.goalId, item]),
    );
    return goals.filter((goal) =>
      needsReminder(
        date,
        settings,
        configured.get(goal.id),
        goal.entries.some((entry) => entry.date === date),
      ),
    );
  }
}
