import type { ExternalIdentityProfile } from "../sessions/model";
export interface TelegramOidcClient {
  buildAuthorizationUrl(input: {
    codeChallenge: string;
    nonce: string;
    redirectUri: string;
    state: string;
  }): string;
  exchangeCode(input: {
    code: string;
    codeVerifier: string;
    nonce: string;
    now: number;
    redirectUri: string;
  }): Promise<ExternalIdentityProfile>;
}
