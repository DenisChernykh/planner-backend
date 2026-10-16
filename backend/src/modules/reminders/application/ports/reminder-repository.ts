import type { GoalReminder, ReminderJob, ReminderSettings, TelegramLink } from "../../domain/model";
export type ReminderSchedulingState = {
  settings: ReminderSettings;
  preparedMonths: string[];
  inheritanceMonths: string[];
  nextGoalRuns: Record<string, number>;
};
export type ReminderDeliveryState = {
  settings: ReminderSettings;
  link: TelegramLink | null;
  reminder: GoalReminder | null;
};
export interface ReminderRepository {
  settings(ownerId: string): Promise<ReminderSettings>;
  deliveryState(ownerId: string, goalId: string | null): Promise<ReminderDeliveryState>;
  saveSettings(
    settings: ReminderSettings,
    reminders: GoalReminder[],
    previous?: ReminderSettings,
  ): Promise<boolean>;
  schedulingState(): Promise<ReminderSchedulingState[]>;
  reminders(ownerId: string): Promise<GoalReminder[]>;
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
  recoverAndDue(now: number): Promise<ReminderJob[]>;
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
