export type Button = { text: string } & (
  | { data: string; url?: never }
  | { url: string; data?: never }
);
export type OutgoingMessage = { text: string; buttons?: Button[][]; forceReply?: boolean };
