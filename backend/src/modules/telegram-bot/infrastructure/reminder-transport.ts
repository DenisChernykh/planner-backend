import type { InlineKeyboardMarkup } from "grammy/types";
import type { OutgoingMessage, ReminderTransport } from "../../reminders/public-contracts";
import { DeliveryError } from "../../reminders/public-contracts";

function inlineOptions(message: OutgoingMessage) {
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: (message.buttons ?? []).map((row) =>
      row.map((button) =>
        button.url !== undefined
          ? { text: button.text, url: button.url }
          : { text: button.text, callback_data: button.data },
      ),
    ),
  };
  return { reply_markup: keyboard, ...(message.html ? { parse_mode: "HTML" as const } : {}) };
}
export function messageOptions(message: OutgoingMessage) {
  return message.forceReply
    ? { reply_markup: { force_reply: true as const, selective: true } }
    : inlineOptions(message);
}
export function createReminderTransport(token: string): ReminderTransport {
  // Three small JSON methods do not need the webhook client's middleware,
  // multipart machinery or error objects containing token-bearing request URLs.
  async function call(method: string, body: object = {}): Promise<unknown> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        result?: unknown;
        error_code?: number;
        parameters?: { retry_after?: number };
      };
      if (response.ok && data?.ok === true && data.result !== undefined) return data.result;
      if (data?.ok === false) {
        if (data.error_code === 403) throw new DeliveryError("blocked");
        if (data.error_code === 429) {
          const retry = data.parameters?.retry_after;
          throw new DeliveryError(
            "retry",
            typeof retry === "number" && Number.isFinite(retry) ? retry : 60,
          );
        }
        if (typeof data.error_code === "number" && data.error_code >= 400 && data.error_code < 500)
          throw new DeliveryError("permanent");
      }
      throw new DeliveryError("unknown");
    } catch (error) {
      // A timeout, disconnect or unreadable response may follow an accepted send.
      // Preserve uncertainty instead of retrying and creating duplicate questions.
      throw error instanceof DeliveryError ? error : new DeliveryError("unknown");
    }
  }
  return {
    async send(chatId, message) {
      const result = (await call("sendMessage", {
        chat_id: chatId,
        text: message.html ?? message.text,
        ...messageOptions(message),
      })) as { message_id?: number } | null;
      if (!Number.isSafeInteger(result?.message_id) || (result?.message_id ?? 0) <= 0)
        throw new DeliveryError("unknown");
      return result?.message_id as number;
    },
    async edit(chatId, messageId, message) {
      await call("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: message.html ?? message.text,
        ...inlineOptions(message),
      });
    },
    async username() {
      const result = (await call("getMe")) as { username?: string } | null;
      if (typeof result?.username !== "string" || !result.username)
        throw new DeliveryError("unknown");
      return result.username;
    },
  };
}
