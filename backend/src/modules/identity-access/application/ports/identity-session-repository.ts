import type { AuthenticatedUser } from "../../public-contracts";
import type { ExternalIdentityProfile, SessionToCreate } from "../sessions/model";
export interface IdentitySessionRepository {
  authenticateExternalIdentity(
    profile: ExternalIdentityProfile,
    session: SessionToCreate,
  ): Promise<AuthenticatedUser>;
  findUserBySession(tokenHash: string, now: number): Promise<AuthenticatedUser | null>;
  findUserBySessionForExternalIdentity(
    tokenHash: string,
    now: number,
    identity: Pick<ExternalIdentityProfile, "issuer" | "subject">,
  ): Promise<AuthenticatedUser | null>;
  revokeSession(tokenHash: string): Promise<void>;
}
