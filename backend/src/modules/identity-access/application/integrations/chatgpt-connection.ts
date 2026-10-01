import { randomBase64Url, sha256Base64Url } from "../../../../platform/crypto/secure-values";
import { ApplicationError } from "../../../../shared/application/application-error";
import type { IntegrationTokenRepository } from "../ports/integration-token-repository";

export class ChatGptConnection {
  constructor(private readonly repository: IntegrationTokenRepository) {}

  connection(ownerId: string, now: number) {
    return this.repository.connection(ownerId, now);
  }

  async issue(ownerId: string, now: number) {
    const token = `ritm_${randomBase64Url(32)}`;
    const expiresAt = now + 365 * 24 * 60 * 60 * 1000;
    await this.repository.replace(ownerId, await sha256Base64Url(token), {
      createdAt: now,
      expiresAt,
    });
    return { token, expiresAt };
  }

  revoke(ownerId: string) {
    return this.repository.revoke(ownerId);
  }

  async authenticate(token: string, now: number) {
    if (!/^ritm_[A-Za-z0-9_-]{43}$/u.test(token)) {
      throw new ApplicationError("UNAUTHENTICATED", "A valid integration key is required.");
    }
    const user = await this.repository.authenticate(await sha256Base64Url(token), now);
    if (!user)
      throw new ApplicationError(
        "UNAUTHENTICATED",
        "The integration key has expired or was revoked.",
      );
    return user;
  }
}
