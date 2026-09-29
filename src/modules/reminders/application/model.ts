export type Button = { text: string; data: string };
export type OutgoingMessage = { text: string; buttons?: Button[][]; forceReply?: boolean };
export type BotInput = {
  updateId: number;
  chatId: string;
  telegramUserId: string;
  text?: string;
  replyToMessageId?: number;
  callback?: string;
};
