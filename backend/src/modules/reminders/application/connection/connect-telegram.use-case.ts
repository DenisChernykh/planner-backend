import { ApplicationError } from "../../../../shared/application/application-error";
import type { LinkTokenCodec } from "../ports/link-token-codec";
import type { ReminderRepository } from "../ports/reminder-repository";
import type { ReminderTransport } from "../ports/reminder-transport";

export class ConnectTelegramUseCase {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly transport: ReminderTransport | null,
    private readonly tokens: LinkTokenCodec,
  ) {}

  async execute({ ownerId, now }: { ownerId: string; now: number }) {
    if (!this.transport)
      throw new ApplicationError("DEPENDENCY_UNAVAILABLE", "Telegram-бот пока не включён.");
    const username = await this.transport.username();
    const token = this.tokens.random();
    await this.repository.createLinkToken(
      ownerId,
      await this.tokens.hash(token),
      now + 10 * 60_000,
    );
    return { url: `https://t.me/${username}?start=${token}`, expiresAt: now + 10 * 60_000 };
  }
}
