export type Button = { text: string; data: string };
export type OutgoingMessage = { text: string; buttons?: Button[][]; forceReply?: boolean };
