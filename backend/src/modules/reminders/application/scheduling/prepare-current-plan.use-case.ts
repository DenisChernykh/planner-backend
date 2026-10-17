import type { PlanningOperations } from "../../../planning/public-contracts";
import type { ReminderSettings } from "../../domain/model";
import { localDate, nextOccurrence, startOfReminderDay } from "../../domain/schedule";
import type { ProgressReportRepository } from "../ports/progress-report-repository";
import type { ReminderRepository } from "../ports/reminder-repository";

export class PrepareCurrentPlanUseCase {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly planning: PlanningOperations,
    private readonly reports?: ProgressReportRepository,
  ) {}

  async execute({
    ownerId,
    now,
    month,
    settings: schedulingSettings,
  }: {
    ownerId: string;
    now: number;
    month?: string;
    settings?: ReminderSettings;
  }): Promise<void> {
    const settings = schedulingSettings ?? (await this.repository.settings(ownerId));
    const currentMonth = localDate(now, settings.timeZone).slice(0, 7);
    if (month !== undefined && month !== currentMonth) return;
    await this.planning.ensureCurrentPlan({
      ownerId,
      now,
      timeZone: settings.timeZone,
      includeCarriedGoals: false,
    });
    const state = await this.repository.inheritanceState(ownerId, currentMonth);
    if (state.carried.length === 0) return;
    await this.reports?.inherit(ownerId, state.carried);
    const reminders = new Map(state.sources.map((rule) => [rule.goalId, rule]));
    const inheritance = [];
    let dayStart: number | undefined;
    const nextRuns = new Map<string, number>();
    for (const { sourceGoalId, goalId, hasReminder } of state.carried) {
      const source = reminders.get(sourceGoalId);
      if (!source || hasReminder) continue;
      let nextRunAt = null;
      if (source.mode === "scheduled") {
        dayStart ??= startOfReminderDay(now, settings.timeZone) - 1;
        const calendar = `${source.time}:${source.weekdays.join(",")}`;
        nextRunAt =
          nextRuns.get(calendar) ??
          nextOccurrence(dayStart, settings.timeZone, source.time, source.weekdays);
        nextRuns.set(calendar, nextRunAt);
      }
      const target = {
        ...source,
        goalId,
        nextRunAt,
      };
      inheritance.push({ source, target });
      reminders.set(goalId, target);
    }
    await this.repository.inheritReminders(inheritance, settings.timeZone);
  }
}
