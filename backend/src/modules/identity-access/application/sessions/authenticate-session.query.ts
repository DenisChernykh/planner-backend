import { sha256Base64Url } from "../../../../platform/crypto/secure-values";
import { ApplicationError } from "../../../../shared/application/application-error";
import type { AuthenticatedUser } from "../../public-contracts";
import type { IdentitySessionRepository } from "../ports/identity-session-repository";

export class AuthenticateSessionQuery {
  constructor(private readonly repository: IdentitySessionRepository) {}

  async execute(input: { now: number; sessionToken: string }): Promise<AuthenticatedUser> {
    const user = await this.repository.findUserBySession(
      await sha256Base64Url(input.sessionToken),
      input.now,
    );
    if (!user) {
      throw new ApplicationError("UNAUTHENTICATED", "A valid session is required.");
    }
    return user;
  }
}
