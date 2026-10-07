export type ReminderSettings = {
  ownerId: string;
  enabled: boolean;
  timeZone: string;
  quietStart: string;
  quietEnd: string;
  eveningTime: string;
  nextEveningAt: number | null;
};
export type SettingsInput = Omit<ReminderSettings, "ownerId" | "nextEveningAt">;
export type GoalReminder = {
  goalId: string;
  ownerId: string;
  mode: "off" | "scheduled" | "evening";
  time: string;
  weekdays: number[];
  nextRunAt: number | null;
};
export type GoalReminderInput = Pick<GoalReminder, "mode" | "time" | "weekdays">;
export type TelegramLink = {
  ownerId: string;
  chatId: string;
  telegramUserId: string;
  status: string;
};
export type ReminderJob = {
  id: string;
  eventKey: string;
  ownerId: string;
  goalId: string | null;
  localDate: string;
  kind: "question" | "input" | "correction" | "digest" | "weekly-progress";
  status: "pending" | "sending" | "sent" | "answered" | "cancelled" | "unknown" | "failed";
  dueAt: number;
  expiresAt: number;
  leaseUntil: number | null;
  chatId: string | null;
  messageId: number | null;
  expectedRevision: string | null;
  payload: string;
  attempts: number;
  createdAt: number;
};
export const DEFAULT_SETTINGS: SettingsInput = {
  enabled: false,
  timeZone: "Asia/Yekaterinburg",
  quietStart: "23:00",
  quietEnd: "08:00",
  eveningTime: "21:00",
};
