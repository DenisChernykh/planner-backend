import { randomBase64Url, sha256Base64Url } from "../../../../platform/crypto/secure-values";
import type { IdentitySessionRepository } from "../ports/identity-session-repository";
import type { AuthenticationResult } from "../sessions/model";
import { SESSION_TTL_MS } from "../sessions/session-policy";
import { DEVELOPMENT_IDENTITY } from "./development-identity";

export class StartDevelopmentSessionUseCase {
  constructor(private readonly repository: IdentitySessionRepository) {}

  async execute({ now }: { now: number }): Promise<AuthenticationResult> {
    const sessionToken = randomBase64Url(32);
    const user = await this.repository.authenticateExternalIdentity(DEVELOPMENT_IDENTITY, {
      tokenHash: await sha256Base64Url(sessionToken),
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });
    return { sessionToken, user };
  }
}
