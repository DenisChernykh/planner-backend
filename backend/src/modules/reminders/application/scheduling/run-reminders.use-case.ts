import { dueGoalReminders, isRecentOccurrence } from "../../domain/jobs";
import { afterQuietHours, localDate, nextOccurrence } from "../../domain/schedule";
import type { DeliverReminderUseCase } from "../delivery/deliver-reminder.use-case";
import type { ReminderRepository } from "../ports/reminder-repository";
import type { ProgressReportsUseCases } from "../reports/progress-reports";
import { makeJob } from "./make-job";
import type { PrepareCurrentPlanUseCase } from "./prepare-current-plan.use-case";

// Leave room below the Free plan's external subrequest limit. A report is
// always calculated whole; only separate deliveries can continue in another alarm.
export const DELIVERIES_PER_ALARM = 20;

export class RunRemindersUseCase {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly botAvailable: boolean,
    private readonly deliver: Pick<DeliverReminderUseCase, "execute">,
    private readonly prepareCurrentPlan: Pick<PrepareCurrentPlanUseCase, "execute">,
    private readonly reports?: Pick<ProgressReportsUseCases, "schedule" | "deliver">,
  ) {}

  async execute({
    now,
    clock = () => now,
  }: {
    now: number;
    clock?: () => number;
  }): Promise<boolean> {
    if (!this.botAvailable) return false;
    const states = await this.repository.schedulingState();
    for (const state of states) {
      const { settings } = state;
      const month = localDate(now, settings.timeZone).slice(0, 7);
      const prepare =
        !state.preparedMonths.includes(month) ||
        state.inheritanceMonths.some((inheritedMonth) => inheritedMonth <= month);
      if (prepare)
        await this.prepareCurrentPlan.execute({ ownerId: settings.ownerId, now, settings });
      if (!settings.enabled) continue;
      const goalDue = prepare || (state.nextGoalRuns[month] ?? Infinity) <= now;
      const eveningDue = settings.nextEveningAt !== null && settings.nextEveningAt <= now;
      if (!goalDue && !eveningDue) continue;
      const configured = await this.repository.scheduledReminders(settings.ownerId, month, now);
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
    if (states.some((state) => state.nextReportAt !== null && state.nextReportAt <= now))
      await this.reports?.schedule(
        now,
        new Map(states.map((state) => [state.settings.ownerId, state.settings])),
      );
    for (let count = 0; count < DELIVERIES_PER_ALARM; count++) {
      // Network calls can cross quiet-hour/expiry boundaries. Each next delivery
      // reads current time and fresh D1 eligibility, never a cached batch snapshot.
      const at = clock();
      const [job] = await this.repository.recoverAndDue(at);
      if (!job) return false;
      if (job.kind === "weekly-progress") await this.reports?.deliver(job.id, at, job);
      else await this.deliver.execute({ job, now: at, state: job.deliveryState });
    }
    return (await this.repository.due(clock())).length > 0;
  }
}
