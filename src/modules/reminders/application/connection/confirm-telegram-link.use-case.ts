import type { LinkTokenCodec } from "../ports/link-token-codec";
import type { ReminderRepository } from "../ports/reminder-repository";

export class ConfirmTelegramLinkUseCase {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly tokens: LinkTokenCodec,
  ) {}

  async execute({
    token,
    chatId,
    telegramUserId,
    now,
  }: {
    token: string;
    chatId: string;
    telegramUserId: string;
    now: number;
  }): Promise<boolean> {
    return (
      /^[A-Za-z0-9_-]{32}$/u.test(token) &&
      (await this.repository.consumeLinkToken(
        await this.tokens.hash(token),
        chatId,
        telegramUserId,
        now,
      ))
    );
  }
}
