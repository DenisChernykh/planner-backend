import { sha256Base64Url } from "../../../../platform/crypto/secure-values";
import type { IdentitySessionRepository } from "../ports/identity-session-repository";

export class LogoutUseCase {
  constructor(private readonly repository: IdentitySessionRepository) {}

  async execute({ sessionToken }: { sessionToken: string | undefined }): Promise<void> {
    if (!sessionToken) {
      return;
    }
    await this.repository.revokeSession(await sha256Base64Url(sessionToken));
  }
}
