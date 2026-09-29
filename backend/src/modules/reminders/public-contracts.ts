export type { OutgoingMessage } from "./application/delivery/outgoing-message";
export type { ReminderTransport } from "./application/ports/reminder-transport";
export { DeliveryError } from "./application/ports/reminder-transport";
export type { BotInput } from "./presentation/bot-input";
export interface ReminderBotActions {
  receive(
    input: import("./presentation/bot-input").BotInput,
    now: number,
  ): Promise<import("./application/delivery/outgoing-message").OutgoingMessage>;
}
