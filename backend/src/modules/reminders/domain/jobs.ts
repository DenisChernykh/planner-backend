import type { GoalReminder, ReminderJob, ReminderSettings, TelegramLink } from "./model";
import { afterQuietHours, isReminderDay } from "./schedule";

const DAY = 86_400_000;
export const DELIVERY_ISSUE_WINDOW_MS = DAY;

export function createReminderJob(input: {
  id: string;
  ownerId: string;
  goalId: string | null;
  date: string;
  kind: ReminderJob["kind"];
  eventKey: string;
  now: number;
  dueAt?: number;
}): ReminderJob {
  return {
    id: input.id,
    eventKey: input.eventKey,
    ownerId: input.ownerId,
    goalId: input.goalId,
    localDate: input.date,
    kind: input.kind,
    status: "pending",
    dueAt: input.dueAt ?? input.now,
    expiresAt: input.now + DAY,
    leaseUntil: null,
    chatId: null,
    messageId: null,
    expectedRevision: null,
    payload: "[]",
    attempts: 0,
    createdAt: input.now,
  };
}

export function isRecentOccurrence(scheduledAt: number, now: number): boolean {
  return now - scheduledAt < DAY;
}

export function dueGoalReminders(reminders: GoalReminder[], now: number): GoalReminder[] {
  return reminders
    .filter((rule) => rule.mode === "scheduled" && rule.nextRunAt !== null && rule.nextRunAt <= now)
    .slice(0, 5);
}

export function needsReminder(
  date: string,
  settings: ReminderSettings,
  rule: GoalReminder | undefined,
  hasEntry: boolean,
): boolean {
  return Boolean(
    rule && rule.mode !== "off" && isReminderDay(date, settings, rule.weekdays) && !hasEntry,
  );
}

export function deliveryDecision(
  job: ReminderJob,
  settings: ReminderSettings,
  link: TelegramLink | null,
  now: number,
  interactive: boolean,
):
  | { action: "cancel" }
  | { action: "postpone"; dueAt: number }
  | { action: "send"; chatId: string } {
  if (link?.status !== "active" || (!interactive && !settings.enabled) || job.expiresAt <= now)
    return { action: "cancel" };
  if (!interactive) {
    const dueAt = afterQuietHours(now, settings);
    if (dueAt > now) return { action: "postpone", dueAt };
  }
  return { action: "send", chatId: link.chatId };
}

export function canAskGoal(
  job: ReminderJob,
  goalMonth: string | undefined,
  hasEntry: boolean,
  rule: GoalReminder | undefined,
  interactive: boolean,
): boolean {
  return (
    goalMonth !== undefined &&
    goalMonth === job.localDate.slice(0, 7) &&
    (interactive || Boolean(rule && rule.mode !== "off")) &&
    (!hasEntry || job.kind === "correction")
  );
}

export type DeliveryFailureKind = "blocked" | "retry" | "unknown" | "permanent";

export function failedDeliveryChanges(
  job: ReminderJob,
  kind: DeliveryFailureKind,
  retryAfter: number,
  now: number,
): Pick<ReminderJob, "status" | "dueAt" | "leaseUntil"> {
  return {
    status:
      kind === "retry" && job.attempts < 4 ? "pending" : kind === "unknown" ? "unknown" : "failed",
    dueAt: now + Math.max(60, retryAfter) * 1000,
    leaseUntil: null,
  };
}

export function canAnswerJob(
  job: ReminderJob | null,
  ownerId: string,
  chatId: string,
  now: number,
): job is ReminderJob {
  return (
    job !== null &&
    job.kind !== "weekly-progress" &&
    job.ownerId === ownerId &&
    job.chatId === chatId &&
    ["sent", "answered"].includes(job.status) &&
    now - job.createdAt <= 7 * DAY
  );
}

export function snoozedUntil(now: number, settings: ReminderSettings): number {
  return afterQuietHours(now + 30 * 60_000, settings);
}
