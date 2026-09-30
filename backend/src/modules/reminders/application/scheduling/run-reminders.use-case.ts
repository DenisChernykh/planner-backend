import { dueGoalReminders, isRecentOccurrence } from "../../domain/jobs";
import { afterQuietHours, localDate, nextOccurrence } from "../../domain/schedule";
import type { DeliverReminderUseCase } from "../delivery/deliver-reminder.use-case";
import type { ReminderRepository } from "../ports/reminder-repository";
import { makeJob } from "./make-job";
import type { PrepareCurrentPlanUseCase } from "./prepare-current-plan.use-case";

export class RunRemindersUseCase {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly botAvailable: boolean,
    private readonly deliver: DeliverReminderUseCase,
    private readonly prepareCurrentPlan: PrepareCurrentPlanUseCase,
  ) {}

  async execute({ now }: { now: number }): Promise<void> {
    if (!this.botAvailable) return;
    await this.repository.recover(now);
    for (const settings of await this.repository.activeSettings()) {
      if ((await this.repository.link(settings.ownerId))?.status !== "active") continue;
      await this.prepareCurrentPlan.execute({ ownerId: settings.ownerId, now });
      const configured = await this.repository.scheduledReminders(
        settings.ownerId,
        localDate(now, settings.timeZone).slice(0, 7),
      );
      for (const item of dueGoalReminders(configured, now)) {
        const previous = item.nextRunAt as number;
        const date = localDate(previous, settings.timeZone);
        const next = nextOccurrence(now, settings.timeZone, item.time, item.weekdays);
        const job = isRecentOccurrence(previous, now)
          ? makeJob(
              settings.ownerId,
              item.goalId,
              date,
              "question",
              `scheduled:${item.goalId}:${date}`,
              now,
              afterQuietHours(now, settings),
            )
          : null;
        await this.repository.advanceGoal({ ...item, nextRunAt: next }, previous, job, settings);
      }
      if (settings.nextEveningAt !== null && settings.nextEveningAt <= now) {
        const previous = settings.nextEveningAt;
        const date = localDate(previous, settings.timeZone);
        const job = isRecentOccurrence(previous, now)
          ? makeJob(
              settings.ownerId,
              null,
              date,
              "digest",
              `evening:${settings.ownerId}:${date}`,
              now,
              afterQuietHours(now, settings),
            )
          : null;
        await this.repository.advanceEvening(
          settings,
          previous,
          nextOccurrence(now, settings.timeZone, settings.eveningTime),
          job,
        );
      }
    }
    for (const job of await this.repository.due(now)) await this.deliver.execute({ job, now });
  }
}
