import type { HandleReminderReplyUseCase } from "../application/answers/handle-reminder-reply.use-case";
import type { ConfirmTelegramLinkUseCase } from "../application/connection/confirm-telegram-link.use-case";
import type { DisconnectTelegramUseCase } from "../application/connection/disconnect-telegram.use-case";
import type { GetChatConnectionQuery } from "../application/connection/get-chat-connection.query";
import type { ValidateLinkTokenQuery } from "../application/connection/validate-link-token.query";
import type { OutgoingMessage } from "../application/delivery/outgoing-message";
import type { BotInput } from "./bot-input";

export class ReminderBotController {
  constructor(
    private readonly validateLink: ValidateLinkTokenQuery,
    private readonly confirmLink: ConfirmTelegramLinkUseCase,
    private readonly connection: GetChatConnectionQuery,
    private readonly disconnect: DisconnectTelegramUseCase,
    private readonly reply: HandleReminderReplyUseCase,
  ) {}
  async receive(input: BotInput, now: number): Promise<OutgoingMessage> {
    const text = input.text?.trim();
    if (text?.startsWith("/start ")) {
      const token = text.slice(7);
      if (!(await this.validateLink.execute({ token, now }))) {
        return {
          text: "Ссылка истекла или уже использована. Создайте новую в настройках Planner.",
        };
      }
      return {
        text: "Подключить этот личный чат к Planner? Подтверждайте только ссылку, которую создали сами в настройках.",
        buttons: [[{ text: "Подключить", data: `link:${token}` }]],
      };
    }
    if (input.callback?.startsWith("link:")) {
      const token = input.callback.slice(5);
      const linked = await this.confirmLink.execute({
        token,
        chatId: input.chatId,
        telegramUserId: input.telegramUserId,
        now,
      });
      return {
        text: linked
          ? "Telegram подключён. Включите напоминания и выберите цели в настройках Planner."
          : "Ссылка истекла или уже использована. Создайте новую в Planner.",
      };
    }
    const link = await this.connection.execute({
      chatId: input.chatId,
      telegramUserId: input.telegramUserId,
    });
    if (!link) return { text: "Откройте «Напоминания» в Planner и подключите Telegram." };
    if (text === "/stop") {
      await this.disconnect.execute({ ownerId: link.ownerId });
      return { text: "Напоминания отключены, чат отвязан." };
    }
    if (text === "/start" || text === "/help")
      return {
        text: "Отвечайте на вопрос бота или используйте кнопки под ним. Настройки — в Planner. /stop — отключить напоминания.",
      };
    const parts = input.callback?.split(":");
    return this.reply.execute({
      ownerId: link.ownerId,
      chatId: input.chatId,
      jobId: parts?.[1],
      replyToMessageId: input.replyToMessageId,
      action: parts?.[0],
      value: parts?.[0] === "value" || parts?.[0] === "pick" ? parts?.[2] : text,
      updateId: input.updateId,
      now,
    });
  }
}
