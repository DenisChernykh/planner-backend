import type {
  ProgressCalculationInput,
  ProgressReportGoal,
  ProgressReportOverview,
} from "../../../progress/public-contracts";
import type { OutgoingMessage } from "../delivery/outgoing-message";

export type Snapshot = {
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
// Negative revisions make older Workers rebuild this payload after a rollback;
// an unfinished preparation must never be treated as a sendable version-1 snapshot.
export type Preparation = Omit<Snapshot, "version" | "message" | "period" | "startsOn"> & {
  version: 2;
  reportRevision: -1;
  progressRevision: -1;
  sourceReportRevision: number;
  sourceProgressRevision: number;
  calculation: ProgressCalculationInput;
};

export type SelectionPreparation = Omit<Preparation, "version" | "calculation"> & {
  version: 5;
  selectedIds: string[];
};
export type CalculationPreparation = Omit<Preparation, "version"> & {
  version: 3;
  offset: number;
  goals: ProgressReportGoal[];
};
export type RenderPreparation = Omit<Preparation, "version" | "calculation"> & {
  version: 4;
  overview: ProgressReportOverview;
};
export type ReportSnapshot =
  | Snapshot
  | Preparation
  | SelectionPreparation
  | CalculationPreparation
  | RenderPreparation;

export function preparationMetadata(snapshot: Exclude<ReportSnapshot, Snapshot>) {
  const {
    reportRevision,
    progressRevision,
    sourceReportRevision,
    sourceProgressRevision,
    timeZone,
    quietStart,
    quietEnd,
    reportDate,
    goalIds,
    formedAt,
  } = snapshot;
  return {
    reportRevision,
    progressRevision,
    sourceReportRevision,
    sourceProgressRevision,
    timeZone,
    quietStart,
    quietEnd,
    reportDate,
    goalIds,
    formedAt,
  };
}
