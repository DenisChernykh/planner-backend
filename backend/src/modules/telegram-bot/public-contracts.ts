import type { WebhookTelegramBotRuntimeConfig } from "../../platform/config/runtime-config";
export type TelegramWebhookRequestContext = {
  readonly path: string;
  readonly requestId: string;
  readonly updateId?: number;
};

export const TELEGRAM_BOT_FAILURE_CATEGORIES = {
  handler: "handler_failure",
  initialization: "initialization_failure",
} as const;

// grammY retries some Bot API failures indefinitely. Keep initialization
// bounded below webhookCallback's ten-second request deadline.
export const TELEGRAM_BOT_INITIALIZATION_TIMEOUT_MS = 5_000;

export type TelegramBotFailureCategory =
  (typeof TELEGRAM_BOT_FAILURE_CATEGORIES)[keyof typeof TELEGRAM_BOT_FAILURE_CATEGORIES];

export type TelegramWebhookHandler = (
  request: Request,
  context?: TelegramWebhookRequestContext,
) => Response | Promise<Response>;

export type TelegramBotHandlerConfig = Pick<WebhookTelegramBotRuntimeConfig, "telegramBotToken"> & {
  actions?: import("../reminders/public-contracts").ReminderBotActions;
};

export class TelegramWebhookFailure extends Error {
  readonly category: TelegramBotFailureCategory;

  constructor(category: TelegramBotFailureCategory) {
    super("Telegram webhook processing failed.");
    this.name = "TelegramWebhookFailure";
    this.category = category;
  }
}
