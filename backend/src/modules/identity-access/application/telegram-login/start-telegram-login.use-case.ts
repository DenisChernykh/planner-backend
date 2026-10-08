import { randomBase64Url, sha256Base64Url } from "../../../../platform/crypto/secure-values";
import type { LoginFlowCodec } from "../ports/login-flow-codec";
import type { TelegramOidcClient } from "../ports/telegram-oidc-client";
import type { LoginFlow } from "./model";

export class StartTelegramLoginUseCase {
  constructor(
    private readonly oidcClient: TelegramOidcClient,
    private readonly flowCodec: LoginFlowCodec,
  ) {}

  async execute(input: {
    clientId: string;
    now: number;
    redirectUri: string;
    returnTo?: string;
  }): Promise<{
    authorizationUrl: string;
    flowCookie: string;
  }> {
    const codeVerifier = randomBase64Url(32);
    const flow: LoginFlow = {
      version: 1,
      issuer: "https://oauth.telegram.org",
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      ...(input.returnTo ? { returnTo: input.returnTo } : {}),
      state: randomBase64Url(32),
      nonce: randomBase64Url(32),
      codeVerifier,
      issuedAt: input.now,
    };

    const [codeChallenge, flowCookie] = await Promise.all([
      sha256Base64Url(codeVerifier),
      this.flowCodec.seal(flow),
    ]);

    return {
      authorizationUrl: this.oidcClient.buildAuthorizationUrl({
        codeChallenge,
        nonce: flow.nonce,
        redirectUri: input.redirectUri,
        state: flow.state,
      }),
      flowCookie,
    };
  }
}
