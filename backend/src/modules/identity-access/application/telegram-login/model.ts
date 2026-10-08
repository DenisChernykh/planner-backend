export type LoginFlow = {
  version: 1;
  issuer: "https://oauth.telegram.org";
  clientId: string;
  redirectUri: string;
  returnTo?: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  issuedAt: number;
};
