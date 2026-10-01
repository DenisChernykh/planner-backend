import type { AuthenticatedUser } from "../../public-contracts";

export type IntegrationConnection = { createdAt: number; expiresAt: number };

export interface IntegrationTokenRepository {
  connection(ownerId: string, now: number): Promise<IntegrationConnection | null>;
  replace(ownerId: string, tokenHash: string, connection: IntegrationConnection): Promise<void>;
  revoke(ownerId: string): Promise<void>;
  authenticate(tokenHash: string, now: number): Promise<AuthenticatedUser | null>;
}
