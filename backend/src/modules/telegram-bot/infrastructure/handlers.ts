import type { Bot } from "grammy";
import type { ReminderBotActions } from "../../reminders/public-contracts";
import { messageOptions } from "./reminder-transport";

export function registerTelegramBotHandlers(bot: Bot, actions?: ReminderBotActions): void {
  if (!actions) {
    bot.command("start", async (context) => {
      await context.reply("Bot is ready.");
    });
    return;
  }
  bot.on(["message:text", "callback_query:data"], async (context) => {
    if (context.chat?.type !== "private" || !context.from) {
      if (context.callbackQuery)
        await context.answerCallbackQuery({ text: "Откройте личный чат с ботом." });
      return;
    }
    if (context.callbackQuery) await context.answerCallbackQuery();
    const response = await actions.receive(
      {
        updateId: context.update.update_id,
        chatId: String(context.chat.id),
        telegramUserId: String(context.from.id),
        text: context.message?.text,
        replyToMessageId: context.message?.reply_to_message?.message_id,
        callback: context.callbackQuery?.data,
      },
      Date.now(),
    );
    if (response.text) await context.reply(response.text, messageOptions(response));
  });
}
