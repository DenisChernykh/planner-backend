export type Button = { text: string } & (
  | { data: string; url?: never }
  | { url: string; data?: never }
);
export type MessageBlock = {
  id?: string;
  kind: "header" | "goal" | "notice";
  title?: string;
  icon?: "check" | "quantity" | "scale" | "time";
  lines: { id?: string; text: string; bold?: boolean }[];
};
export type OutgoingMessage = {
  text: string;
  html?: string;
  blocks?: MessageBlock[];
  buttons?: Button[][];
  forceReply?: boolean;
};
