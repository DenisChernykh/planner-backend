import { randomBase64Url, sha256Base64Url } from "../../../../platform/crypto/secure-values";
import type { IdentitySessionRepository } from "../ports/identity-session-repository";
import type { TelegramOidcClient } from "../ports/telegram-oidc-client";
import type { AuthenticationResult } from "../sessions/model";
import { SESSION_TTL_MS } from "../sessions/session-policy";
import type { LoginFlow } from "./model";

export class CompleteTelegramLoginUseCase {
  constructor(
    private readonly oidcClient: TelegramOidcClient,
    private readonly repository: IdentitySessionRepository,
  ) {}

  async execute(input: {
    code: string;
    flow: LoginFlow;
    now: number;
    redirectUri: string;
  }): Promise<AuthenticationResult> {
    const profile = await this.oidcClient.exchangeCode({
      code: input.code,
      codeVerifier: input.flow.codeVerifier,
      nonce: input.flow.nonce,
      now: input.now,
      redirectUri: input.redirectUri,
    });
    const sessionToken = randomBase64Url(32);
    const user = await this.repository.authenticateExternalIdentity(profile, {
      tokenHash: await sha256Base64Url(sessionToken),
      createdAt: input.now,
      expiresAt: input.now + SESSION_TTL_MS,
    });

    return { sessionToken, user };
  }
}
