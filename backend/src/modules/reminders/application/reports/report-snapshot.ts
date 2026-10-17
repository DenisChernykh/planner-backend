import type { OutgoingMessage } from "../delivery/outgoing-message";

export type ReportSnapshot = {
  version: 1;
  reportRevision: number;
  progressRevision: number;
  timeZone: string;
  quietStart: string;
  quietEnd: string;
  reportDate: string;
  period: { from: string; to: string };
  startsOn: string | null;
  goalIds: string[];
  formedAt: number;
  message: OutgoingMessage;
};

export function readReportSnapshot(payload: string): ReportSnapshot | null {
  const value = JSON.parse(payload) as { version?: number } | null;
  // Versions 2–8 were unsent preparation checkpoints from the old Cron.
  // Rebuild those once from current owner-scoped facts. Ready version 1 keeps
  // its frozen message across retries and the migration.
  return value?.version === 1 ? (value as ReportSnapshot) : null;
}
