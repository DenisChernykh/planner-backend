import type { ReminderJob, ReminderSettings } from "../../domain/model";
import type { ReportSelection, ReportSettings, ReportSlot } from "../../domain/progress-reports";
export interface ProgressReportRepository {
  settings(ownerId: string): Promise<ReportSettings>;
  active(): Promise<ReportSettings[]>;
  upcoming(
    ownerId: string,
    now: number,
  ): Promise<{ slot: ReportSlot; reportDate: string; dueAt: number }[]>;
  selections(ownerId: string): Promise<ReportSelection[]>;
  save(
    settings: ReportSettings,
    selections: ReportSelection[],
    startsOn: string | null,
    scheduleChanged: boolean,
  ): Promise<void>;
  reschedule(settings: ReportSettings): Promise<void>;
  inherit(ownerId: string, carried: { sourceGoalId: string; goalId: string }[]): Promise<void>;
  advance(
    settings: ReportSettings,
    slot: ReportSlot,
    previous: number,
    next: number,
    job: ReminderJob | null,
  ): Promise<void>;
  setSnapshot(id: string, previous: string, payload: string): Promise<boolean>;
  postpone(id: string, dueAt: number): Promise<void>;
  cancel(id: string): Promise<void>;
  claim(
    job: ReminderJob,
    settings: ReminderSettings,
    reportRevision: number,
    progressRevision: number,
    chatId: string,
    now: number,
  ): Promise<boolean>;
}
