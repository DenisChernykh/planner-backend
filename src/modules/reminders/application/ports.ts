import type {
  GoalReminder,
  OutgoingMessage,
  ReminderJob,
  ReminderSettings,
  TelegramLink,
} from "./model";

export interface ReminderRepository {
  settings(ownerId: string): Promise<ReminderSettings>;
  saveSettings(settings: ReminderSettings, reminders: GoalReminder[]): Promise<void>;
  activeSettings(): Promise<ReminderSettings[]>;
  reminders(ownerId: string): Promise<GoalReminder[]>;
  saveReminder(reminder: GoalReminder): Promise<void>;
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
  job(id: string): Promise<ReminderJob | null>;
  replyJob(chatId: string, messageId: number): Promise<ReminderJob | null>;
  claim(id: string, now: number): Promise<boolean>;
  updateJob(id: string, changes: Partial<ReminderJob>): Promise<void>;
  recover(now: number): Promise<void>;
  deliveryIssues(ownerId: string): Promise<number>;
}
export interface ReminderTransport {
  send(chatId: string, message: OutgoingMessage): Promise<number>;
  edit(chatId: string, messageId: number, message: OutgoingMessage): Promise<void>;
  username(): Promise<string>;
}
export class DeliveryError extends Error {
  constructor(
    readonly kind: "blocked" | "retry" | "unknown" | "permanent",
    readonly retryAfter = 60,
  ) {
    super("Telegram delivery failed");
  }
}
export interface LinkTokenCodec {
  random(): string;
  hash(token: string): Promise<string>;
}
