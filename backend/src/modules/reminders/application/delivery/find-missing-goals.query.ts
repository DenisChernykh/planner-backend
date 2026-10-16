import { needsReminder } from "../../domain/jobs";
import type { ReminderSettings } from "../../domain/model";
import type { ReminderRepository } from "../ports/reminder-repository";

export class FindMissingGoalsQuery {
  constructor(private readonly repository: ReminderRepository) {}

  async execute({
    ownerId,
    date,
  }: {
    ownerId: string;
    date: string;
    settings: ReminderSettings;
  }): Promise<{ id: string; title: string }[]> {
    const goals = await this.repository.digestCandidates(ownerId, date);
    // The persisted local date already identifies the calendar day, including DST days.
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
    return goals.filter((goal) => needsReminder(weekday, goal.reminder, goal.hasEntry));
  }
}
