export type { BotInput, OutgoingMessage } from "./application/model";
export type { ReminderTransport } from "./application/ports";
export { DeliveryError } from "./application/ports";
export interface ReminderBotActions {
  receive(
    input: import("./application/model").BotInput,
    now: number,
  ): Promise<import("./application/model").OutgoingMessage>;
}
