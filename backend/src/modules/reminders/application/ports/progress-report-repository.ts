import type {
  ProgressReportGoal,
  ProgressReportOverview,
  ReportCaptureScope,
} from "../../../progress/public-contracts";
import type { ReminderJob, ReminderSettings } from "../../domain/model";
import type { ReportSelection, ReportSettings, ReportSlot } from "../../domain/progress-reports";
import type { RawPreparation, RenderPreparation } from "../reports/report-snapshot";
import type { ReportPayloadReference } from "./reminder-repository";
export interface ProgressReportRepository {
  selectionState(
    ownerId: string,
    fromMonth: string,
    toMonth: string,
  ): Promise<{ selectedIds: string[]; goalIds: string[] }>;
  captureSnapshot(input: {
    job: Pick<ReminderJob, "id" | "ownerId" | "payload">;
    metadata: Omit<RawPreparation, "calculation">;
    scope: ReportCaptureScope;
    selectedIds: string[];
  }): Promise<boolean>;
  appendCalculation(input: {
    id: string;
    ownerId: string;
    captureId: string;
    previousOffset: number;
    nextOffset: number;
    result: ProgressReportGoal | null;
    done: boolean;
    nextChainId: string | null;
  }): Promise<boolean>;
  finishCalculation(input: {
    id: string;
    ownerId: string;
    captureId: string;
    offset: number;
    metadata: Omit<RenderPreparation, "overview">;
    overview: Omit<ProgressReportOverview, "goals">;
  }): Promise<boolean>;
  settings(ownerId: string): Promise<ReportSettings>;
  active(now: number): Promise<ReportSettings[]>;
  deliveryStatus(
    ownerId: string,
    since: number,
  ): Promise<{ retrying: number; failed: number; unknown: number }>;
  upcoming(
    ownerId: string,
    now: number,
  ): Promise<{ slot: ReportSlot; reportDate: string; dueAt: number }[]>;
  selections(ownerId: string): Promise<ReportSelection[]>;
  activeGoalIds(ownerId: string, fromMonth: string, toMonth: string): Promise<string[]>;
  save(
    settings: ReportSettings,
    selections: ReportSelection[],
    startsOn: string | null,
    scheduleChanged: boolean,
  ): Promise<void>;
  reschedule(settings: ReportSettings): Promise<void>;
  inherit(ownerId: string, carried: { sourceGoalId: string; goalId: string }[]): Promise<void>;
  advance(
    settings: ReportSettings,
    slot: ReportSlot,
    previous: number,
    next: number,
    job: ReminderJob | null,
  ): Promise<void>;
  setSnapshot(
    id: string,
    previous: string,
    payload: string,
    reference?: ReportPayloadReference,
  ): Promise<boolean>;
  postpone(id: string, dueAt: number): Promise<void>;
  cancel(id: string): Promise<void>;
  claim(
    job: ReminderJob,
    settings: ReminderSettings,
    reportRevision: number,
    progressRevision: number,
    chatId: string,
    now: number,
  ): Promise<boolean>;
}
