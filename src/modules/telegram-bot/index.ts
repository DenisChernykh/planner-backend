import { createTelegramWebhookHandler } from "./infrastructure/webhook-handler";
import { createTelegramBotHttp } from "./presentation/http";
import type { TelegramBotHandlerConfig, TelegramWebhookHandler } from "./public-contracts";

export { createReminderTransport } from "./infrastructure/reminder-transport";
export { TELEGRAM_WEBHOOK_SECURITY_SCHEME } from "./presentation/http";
export {
  TELEGRAM_BOT_FAILURE_CATEGORIES,
  TELEGRAM_BOT_INITIALIZATION_TIMEOUT_MS,
  type TelegramBotFailureCategory,
  type TelegramBotHandlerConfig,
  TelegramWebhookFailure,
  type TelegramWebhookHandler,
  type TelegramWebhookRequestContext,
} from "./public-contracts";
export type TelegramBotModuleOptions = {
  createActions?: (
    env: CloudflareBindings,
  ) => import("../reminders/public-contracts").ReminderBotActions;
  createWebhookHandler?: (config: TelegramBotHandlerConfig) => TelegramWebhookHandler;
};

export function createTelegramBotModule(options: TelegramBotModuleOptions = {}) {
  return {
    router: createTelegramBotHttp({
      createActions: options.createActions,
      createWebhookHandler: options.createWebhookHandler ?? createTelegramWebhookHandler,
    }),
  };
}
