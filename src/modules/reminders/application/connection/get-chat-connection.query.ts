import type { ReminderRepository } from "../ports/reminder-repository";

export class GetChatConnectionQuery {
  constructor(private readonly repository: ReminderRepository) {}

  execute({ chatId, telegramUserId }: { chatId: string; telegramUserId: string }) {
    return this.repository.linkForChat(chatId, telegramUserId);
  }
}
