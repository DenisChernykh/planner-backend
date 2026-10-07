import { Api, GrammyError, InlineKeyboard } from "grammy";
import type { OutgoingMessage, ReminderTransport } from "../../reminders/public-contracts";
import { DeliveryError } from "../../reminders/public-contracts";

function inlineOptions(message: OutgoingMessage) {
  const keyboard = new InlineKeyboard();
  for (const row of message.buttons ?? []) {
    for (const button of row) {
      if (button.url !== undefined) keyboard.url(button.text, button.url);
      else keyboard.text(button.text, button.data);
    }
    keyboard.row();
  }
  return { reply_markup: keyboard };
}
export function messageOptions(message: OutgoingMessage) {
  return message.forceReply
    ? { reply_markup: { force_reply: true as const, selective: true } }
    : inlineOptions(message);
}
export function createReminderTransport(token: string): ReminderTransport {
  const api = new Api(token, { timeoutSeconds: 5 });
  function failure(error: unknown): never {
    if (error instanceof GrammyError) {
      if (error.error_code === 403) throw new DeliveryError("blocked");
      if (error.error_code === 429)
        throw new DeliveryError("retry", error.parameters.retry_after ?? 60);
      if (error.error_code >= 500) throw new DeliveryError("unknown");
      throw new DeliveryError("permanent");
    }
    throw new DeliveryError("unknown");
  }
  return {
    async send(chatId, message) {
      try {
        return (await api.sendMessage(chatId, message.text, messageOptions(message))).message_id;
      } catch (error) {
        return failure(error);
      }
    },
    async edit(chatId, messageId, message) {
      try {
        await api.editMessageText(chatId, messageId, message.text, inlineOptions(message));
      } catch (error) {
        failure(error);
      }
    },
    async username() {
      try {
        return (await api.getMe()).username;
      } catch (error) {
        return failure(error);
      }
    },
  };
}
