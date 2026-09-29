import type { LoginFlow } from "../telegram-login/model";
export interface LoginFlowCodec {
  open(value: string): Promise<LoginFlow>;
  seal(flow: LoginFlow): Promise<string>;
}
