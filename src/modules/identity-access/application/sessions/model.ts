import type { AuthenticatedUser } from "../../public-contracts";

export type ExternalIdentityProfile = {
  issuer: string;
  subject: string;
  displayName: string | null;
  username: string | null;
  photoUrl: string | null;
};

export type SessionToCreate = {
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
};

export type AuthenticationResult = {
  sessionToken: string;
  user: AuthenticatedUser;
};
