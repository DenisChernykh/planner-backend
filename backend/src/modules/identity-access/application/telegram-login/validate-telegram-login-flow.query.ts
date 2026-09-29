import { timingSafeEqualStrings } from "../../../../platform/crypto/secure-values";
import { ApplicationError } from "../../../../shared/application/application-error";
import type { LoginFlowCodec } from "../ports/login-flow-codec";
import { LOGIN_FLOW_TTL_MS } from "./login-flow-policy";
import type { LoginFlow } from "./model";

export class ValidateTelegramLoginFlowQuery {
  constructor(private readonly flowCodec: LoginFlowCodec) {}

  async execute(input: {
    clientId: string;
    flowCookie: string;
    now: number;
    redirectUri: string;
    state: string;
  }): Promise<LoginFlow> {
    const flow = await this.flowCodec.open(input.flowCookie);
    const age = input.now - flow.issuedAt;
    if (age < 0 || age > LOGIN_FLOW_TTL_MS) {
      throw new ApplicationError("INVALID_REQUEST", "The Telegram login flow has expired.");
    }
    if (!(await timingSafeEqualStrings(flow.state, input.state))) {
      throw new ApplicationError("INVALID_REQUEST", "The Telegram login state is invalid.");
    }
    if (
      flow.issuer !== "https://oauth.telegram.org" ||
      flow.clientId !== input.clientId ||
      flow.redirectUri !== input.redirectUri
    ) {
      throw new ApplicationError("INVALID_REQUEST", "The Telegram login flow is invalid.");
    }
    return flow;
  }
}
