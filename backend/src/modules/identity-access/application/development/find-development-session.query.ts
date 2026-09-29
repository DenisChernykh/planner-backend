import { sha256Base64Url } from "../../../../platform/crypto/secure-values";
import type { AuthenticatedUser } from "../../public-contracts";
import type { IdentitySessionRepository } from "../ports/identity-session-repository";
import { DEVELOPMENT_IDENTITY } from "./development-identity";

export class FindDevelopmentSessionQuery {
  constructor(private readonly repository: IdentitySessionRepository) {}

  async execute(input: { now: number; sessionToken: string }): Promise<AuthenticatedUser | null> {
    return this.repository.findUserBySessionForExternalIdentity(
      await sha256Base64Url(input.sessionToken),
      input.now,
      DEVELOPMENT_IDENTITY,
    );
  }
}
