import type {
  ProgressCalculationInput,
  ProgressReportCalculationInput,
  ProgressReportGoal,
  ProgressReportOverview,
  ProgressReportTotals,
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
  captureId?: string;
  offset?: number;
  overview: ProgressReportOverview;
};
// These new raw/cursor payloads intentionally expose invalid source revisions
// to d3fdc6c, so rollback rebuilds instead of trying to calculate raw entries.
export type RawPreparation = Omit<
  Preparation,
  "version" | "calculation" | "sourceReportRevision" | "sourceProgressRevision"
> & {
  version: 6;
  sourceReportRevision: -1;
  sourceProgressRevision: -1;
  captureId?: string;
  nextChainId?: string | null;
  capturedReportRevision: number;
  capturedProgressRevision: number;
  calculation: ProgressReportCalculationInput;
};
export type RawCalculation = Omit<RawPreparation, "version"> & {
  version: 7;
  offset: number;
  goals: ProgressReportGoal[];
};
export type CalculatedGoals = Omit<RawPreparation, "version" | "calculation"> & {
  version: 8;
  offset?: number;
  calculation: Omit<ProgressCalculationInput, "sources" | "knownSources">;
} & (
    | { goals: ProgressReportGoal[]; totals?: never }
    | { totals: ProgressReportTotals; goals?: never }
  );
export type ReportSnapshot =
  | Snapshot
  | Preparation
  | SelectionPreparation
  | CalculationPreparation
  | RenderPreparation
  | RawPreparation
  | RawCalculation
  | CalculatedGoals;

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

export function capturedRevisions(snapshot: Exclude<ReportSnapshot, Snapshot>) {
  return snapshot.version === 6 || snapshot.version === 7 || snapshot.version === 8
    ? { report: snapshot.capturedReportRevision, progress: snapshot.capturedProgressRevision }
    : { report: snapshot.sourceReportRevision, progress: snapshot.sourceProgressRevision };
}
