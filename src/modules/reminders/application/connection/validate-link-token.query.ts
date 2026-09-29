import type { LinkTokenCodec } from "../ports/link-token-codec";
import type { ReminderRepository } from "../ports/reminder-repository";

export class ValidateLinkTokenQuery {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly tokens: LinkTokenCodec,
  ) {}

  async execute({ token, now }: { token: string; now: number }): Promise<boolean> {
    return (
      /^[A-Za-z0-9_-]{32}$/u.test(token) &&
      (await this.repository.hasLinkToken(await this.tokens.hash(token), now))
    );
  }
}
