import { dueGoalReminders, isRecentOccurrence } from "../../domain/jobs";
import { afterQuietHours, localDate, nextOccurrence } from "../../domain/schedule";
import type { DeliverReminderUseCase } from "../delivery/deliver-reminder.use-case";
import type { ReminderRepository } from "../ports/reminder-repository";
import type { ProgressReportsUseCases } from "../reports/progress-reports";
import { makeJob } from "./make-job";
import type { PrepareCurrentPlanUseCase } from "./prepare-current-plan.use-case";

export class RunRemindersUseCase {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly botAvailable: boolean,
    private readonly deliver: DeliverReminderUseCase,
    private readonly prepareCurrentPlan: PrepareCurrentPlanUseCase,
    private readonly reports?: ProgressReportsUseCases,
  ) {}

  async execute({
    now,
    deferNewReportSnapshot = false,
    deferNewDelivery = false,
  }: {
    now: number;
    deferNewReportSnapshot?: boolean;
    deferNewDelivery?: boolean;
  }): Promise<void> {
    if (!this.botAvailable) return;
    const queued = await this.repository.recoverAndDue(now);
    if (queued.length) {
      // Finish persisted work before spending CPU on another scheduling pass.
      await this.deliverQueued(queued, now, deferNewReportSnapshot);
      return;
    }
    const states = await this.repository.schedulingState();
    if (deferNewDelivery) {
      // Keep a new plan's copy and rule inheritance in separate invocations, and
      // prepare all owners before draining one owner's simultaneous due rules.
      for (const state of states) {
        const month = localDate(now, state.settings.timeZone).slice(0, 7);
        const missingPlan = !state.preparedMonths.includes(month);
        if (!missingPlan && !state.inheritanceMonths.some((item) => item <= month)) continue;
        await this.prepareCurrentPlan.execute({
          ownerId: state.settings.ownerId,
          now,
          deferInheritance: missingPlan,
        });
        return;
      }
    }
    for (const state of states) {
      const { settings } = state;
      const month = localDate(now, settings.timeZone).slice(0, 7);
      const prepare =
        !state.preparedMonths.includes(month) ||
        state.inheritanceMonths.some((inheritedMonth) => inheritedMonth <= month);
      if (prepare) {
        await this.prepareCurrentPlan.execute({ ownerId: settings.ownerId, now });
        if (deferNewDelivery) return;
      }
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
        // Persist one schedule transition per Cron invocation. Delivery on the next
        // tick rechecks current settings/facts; it never trusts a cached eligibility.
        if (deferNewDelivery) return;
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
        if (deferNewDelivery) return;
      }
    }
    await this.reports?.schedule(now, deferNewDelivery ? 1 : Infinity);
    if (deferNewDelivery) return;
    await this.deliverQueued(await this.repository.due(now), now, deferNewReportSnapshot);
  }

  private async deliverQueued(
    jobs: Awaited<ReturnType<ReminderRepository["due"]>>,
    now: number,
    deferNewReportSnapshot: boolean,
  ) {
    for (const job of jobs) {
      if (job.kind === "weekly-progress")
        await this.reports?.deliver(job.id, now, deferNewReportSnapshot);
      else await this.deliver.execute({ job, now });
    }
  }
}
