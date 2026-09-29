import type { DeliveryFailureKind } from "../../domain/jobs";
import type { OutgoingMessage } from "../delivery/outgoing-message";
export interface ReminderTransport {
  send(chatId: string, message: OutgoingMessage): Promise<number>;
  edit(chatId: string, messageId: number, message: OutgoingMessage): Promise<void>;
  username(): Promise<string>;
}
export class DeliveryError extends Error {
  constructor(
    readonly kind: DeliveryFailureKind,
    readonly retryAfter = 60,
  ) {
    super("Telegram delivery failed");
  }
}
