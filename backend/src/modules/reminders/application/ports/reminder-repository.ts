import type { GoalRecord } from "../../../planning/public-contracts";
import type { ProgressSettings } from "../../../progress/public-contracts";
import type { GoalReminder, ReminderJob, ReminderSettings, TelegramLink } from "../../domain/model";
import type { ReportSettings } from "../../domain/progress-reports";
export type ReminderSchedulingState = {
  settings: ReminderSettings;
  preparedMonths: string[];
  inheritanceMonths: string[];
  nextGoalRuns: Record<string, number>;
  nextReportAt: number | null;
};
export type ReminderDeliveryState = {
  settings: ReminderSettings;
  link: TelegramLink | null;
  reminder: GoalReminder | null;
  question: (Pick<GoalRecord, "month" | "title" | "tracking"> & { hasEntry: boolean }) | null;
};
export type QueuedReminder = ReminderJob & {
  deliveryState?: ReminderDeliveryState;
  reportState?: { report: ReportSettings; progress: ProgressSettings };
};
export interface ReminderRepository {
  settings(ownerId: string): Promise<ReminderSettings>;
  deliveryState(
    ownerId: string,
    goalId: string | null,
    date: string,
  ): Promise<ReminderDeliveryState>;
  saveSettings(
    settings: ReminderSettings,
    reminders: GoalReminder[],
    previous?: ReminderSettings,
  ): Promise<boolean>;
  schedulingState(): Promise<ReminderSchedulingState[]>;
  reminders(ownerId: string): Promise<GoalReminder[]>;
  inheritanceState(
    ownerId: string,
    month: string,
    limit?: number,
  ): Promise<{
    carried: { sourceGoalId: string; goalId: string; hasReminder: boolean }[];
    sources: GoalReminder[];
  }>;
  digestCandidates(
    ownerId: string,
    date: string,
  ): Promise<
    {
      id: string;
      title: string;
      reminder: GoalReminder;
      hasEntry: boolean;
    }[]
  >;
  reminder(ownerId: string, goalId: string): Promise<GoalReminder | null>;
  saveReminder(reminder: GoalReminder, settings?: ReminderSettings): Promise<boolean>;
  inheritReminders(
    items: { source: GoalReminder; target: GoalReminder }[],
    timeZone: string,
  ): Promise<void>;
  scheduledReminders(ownerId: string, month: string, now: number): Promise<GoalReminder[]>;
  link(ownerId: string): Promise<TelegramLink | null>;
  linkForChat(chatId: string, userId: string): Promise<TelegramLink | null>;
  createLinkToken(ownerId: string, hash: string, expiresAt: number): Promise<void>;
  hasLinkToken(hash: string, now: number): Promise<boolean>;
  consumeLinkToken(hash: string, chatId: string, userId: string, now: number): Promise<boolean>;
  disconnect(ownerId: string): Promise<void>;
  block(ownerId: string): Promise<void>;
  enqueue(job: ReminderJob): Promise<ReminderJob>;
  advanceGoal(
    reminder: GoalReminder,
    previous: number,
    job: ReminderJob | null,
    settings: ReminderSettings,
  ): Promise<void>;
  advanceEvening(
    settings: ReminderSettings,
    previous: number,
    next: number,
    job: ReminderJob | null,
  ): Promise<void>;
  due(now: number): Promise<ReminderJob[]>;
  recoverAndDue(now: number): Promise<QueuedReminder[]>;
  job(id: string): Promise<ReminderJob | null>;
  replyJob(chatId: string, messageId: number): Promise<ReminderJob | null>;
  claim(
    job: ReminderJob,
    now: number,
    state: ReminderDeliveryState,
    interactive: boolean,
  ): Promise<boolean>;
  updateJob(id: string, changes: Partial<ReminderJob>): Promise<void>;
  recover(now: number): Promise<void>;
  deliveryIssues(ownerId: string, since: number): Promise<number>;
}
