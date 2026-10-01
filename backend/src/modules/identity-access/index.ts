import type { TelegramRuntimeConfig } from "../../platform/config/runtime-config";
import { FindDevelopmentSessionQuery } from "./application/development/find-development-session.query";
import { StartDevelopmentSessionUseCase } from "./application/development/start-development-session.use-case";
import { ChatGptConnection } from "./application/integrations/chatgpt-connection";
import type { TelegramOidcClient } from "./application/ports/telegram-oidc-client";
import { AuthenticateSessionQuery } from "./application/sessions/authenticate-session.query";
import { LogoutUseCase } from "./application/sessions/logout.use-case";
import { CompleteTelegramLoginUseCase } from "./application/telegram-login/complete-telegram-login.use-case";
import { StartTelegramLoginUseCase } from "./application/telegram-login/start-telegram-login.use-case";
import { ValidateTelegramLoginFlowQuery } from "./application/telegram-login/validate-telegram-login-flow.query";
import { AesGcmLoginFlowCodec } from "./infrastructure/aes-gcm-login-flow-codec";
import { D1IdentitySessionRepository } from "./infrastructure/d1-identity-session-repository";
import { D1IntegrationTokenRepository } from "./infrastructure/d1-integration-token-repository";
import { TelegramOidcHttpClient } from "./infrastructure/telegram-oidc-client";
import { createIdentityHttp } from "./presentation/http";

export type IdentityAccessModuleOptions = {
  createTelegramOidcClient?: (config: TelegramRuntimeConfig) => TelegramOidcClient;
};

export function createSessionUseCases(database: D1Database) {
  const repository = new D1IdentitySessionRepository(database);
  return {
    findDevelopmentSession: new FindDevelopmentSessionQuery(repository),
    startDevelopmentSession: new StartDevelopmentSessionUseCase(repository),
    authenticateSession: new AuthenticateSessionQuery(repository),
    logout: new LogoutUseCase(repository),
  };
}

export function createIdentityAccessModule(options: IdentityAccessModuleOptions = {}) {
  const createOidcClient =
    options.createTelegramOidcClient ??
    ((config: TelegramRuntimeConfig) =>
      new TelegramOidcHttpClient(config.telegramClientId, config.telegramClientSecret));
  return createIdentityHttp({
    createChatGptConnection: (database) =>
      new ChatGptConnection(new D1IntegrationTokenRepository(database)),
    createSessions: createSessionUseCases,
    createStartLogin: (config) =>
      new StartTelegramLoginUseCase(
        createOidcClient(config),
        new AesGcmLoginFlowCodec(config.authFlowSecret),
      ),
    createValidateLogin: (config) =>
      new ValidateTelegramLoginFlowQuery(new AesGcmLoginFlowCodec(config.authFlowSecret)),
    createCompleteLogin: (config, database) =>
      new CompleteTelegramLoginUseCase(
        createOidcClient(config),
        new D1IdentitySessionRepository(database),
      ),
  });
}

export type { TelegramOidcClient } from "./application/ports/telegram-oidc-client";
