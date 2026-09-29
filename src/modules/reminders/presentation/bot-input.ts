export type BotInput = {
  updateId: number;
  chatId: string;
  telegramUserId: string;
  text?: string;
  replyToMessageId?: number;
  callback?: string;
};
