import { DateTime } from "luxon";
import { ApplicationError } from "../../../../shared/application/application-error";
import type { PlanningOperations } from "../../../planning/public-contracts";
import type {
  ProgressOperations,
  ProgressReportOverview,
} from "../../../progress/public-contracts";
import {
  DELIVERY_ISSUE_WINDOW_MS,
  failedDeliveryChanges,
  isRecentOccurrence,
} from "../../domain/jobs";
import type { ReminderSettings, SettingsInput } from "../../domain/model";
import {
  nextReportOccurrence,
  type ReportInput,
  type ReportSettings,
  type ReportSlot,
  reportWeek,
} from "../../domain/progress-reports";
import { afterQuietHours, localDate } from "../../domain/schedule";
import type { ProgressReportRepository } from "../ports/progress-report-repository";
import type { QueuedReminder, ReminderRepository } from "../ports/reminder-repository";
import { DeliveryError, type ReminderTransport } from "../ports/reminder-transport";
import { makeJob } from "../scheduling/make-job";
import type { PrepareCurrentPlanUseCase } from "../scheduling/prepare-current-plan.use-case";
import { reportMessage } from "./report-message";
import { readReportSnapshot } from "./report-snapshot";

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
export class ProgressReportsUseCases {
  constructor(
    private readonly reports: ProgressReportRepository,
    private readonly reminders: ReminderRepository,
    private readonly planning: PlanningOperations,
    private readonly progress: ProgressOperations,
    private readonly prepare: PrepareCurrentPlanUseCase,
    private readonly transport: ReminderTransport | null,
    private readonly appOrigin: string,
  ) {}

  private async validate(ownerId: string, input: ReportInput) {
    if (
      !/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(input.month) ||
      !TIME.test(input.wednesdayTime) ||
      !TIME.test(input.sundayTime) ||
      (input.startsOn !== null &&
        DateTime.fromISO(input.startsOn, { zone: "UTC" }).toISODate() !== input.startsOn) ||
      new Set(input.goals.map((goal) => goal.goalId)).size !== input.goals.length
    )
      throw new ApplicationError("INVALID_REQUEST", "Проверьте дату и время отчётов.");
    const goals = await this.planning.list(ownerId, input.month);
    if (input.goals.some((selected) => !goals.some((goal) => goal.id === selected.goalId)))
      throw new ApplicationError("NOT_FOUND", "Цель удалена или недоступна.");
    if (input.enabled && !input.goals.some((goal) => goal.included))
      throw new ApplicationError("INVALID_REQUEST", "Выберите хотя бы одну цель для отчёта.");
    if (
      input.enabled &&
      (!this.transport || (await this.reminders.link(ownerId))?.status !== "active")
    )
      throw new ApplicationError("INVALID_REQUEST", "Сначала подключите личный чат Telegram.");
  }
  async get({ ownerId, month, now }: { ownerId: string; month: string; now: number }) {
    await this.prepare.execute({ ownerId, month, now });
    const [settings, selections, shared, general, link, goals, pending, delivery] =
      await Promise.all([
        this.reports.settings(ownerId),
        this.reports.selections(ownerId),
        this.progress.settings(ownerId),
        this.reminders.settings(ownerId),
        this.reminders.link(ownerId),
        this.planning.list(ownerId, month),
        this.reports.upcoming(ownerId, now),
        this.reports.deliveryStatus(ownerId, now - DELIVERY_ISSUE_WINDOW_MS),
      ]);
    const selected = new Set(selections.filter((goal) => goal.included).map((goal) => goal.goalId));
    const activeSelected = (
      await this.planning.progressSources(
        ownerId,
        localDate(now, general.timeZone).slice(0, 7),
        localDate(now, general.timeZone).slice(0, 7),
      )
    ).some((goal) => selected.has(goal.id));
    const state: "disabled" | "disconnected" | "future-start" | "no-goals" | "ready" =
      !settings.enabled
        ? "disabled"
        : !this.transport || link?.status !== "active"
          ? "disconnected"
          : shared.startsOn && shared.startsOn > localDate(now, general.timeZone)
            ? "future-start"
            : !activeSelected
              ? "no-goals"
              : "ready";
    const nextRuns =
      state === "ready"
        ? [
            ...pending.map((job) => ({
              slot: job.slot,
              scheduledAt: nextReportOccurrence(
                DateTime.fromISO(job.reportDate, { zone: general.timeZone })
                  .startOf("day")
                  .toMillis() - 1,
                general.timeZone,
                job.slot === "wed" ? settings.wednesdayTime : settings.sundayTime,
                job.slot === "wed" ? 3 : 7,
              ),
              sendAt: afterQuietHours(Math.max(job.dueAt, now), general),
              reportDate: job.reportDate,
            })),
            ...[
              { slot: "wed" as const, at: settings.nextWednesdayAt },
              { slot: "sun" as const, at: settings.nextSundayAt },
            ].flatMap(({ slot, at }) => {
              if (at === null) return [];
              const scheduledAt =
                at + 86400000 <= now
                  ? nextReportOccurrence(
                      now,
                      general.timeZone,
                      slot === "wed" ? settings.wednesdayTime : settings.sundayTime,
                      slot === "wed" ? 3 : 7,
                    )
                  : at;
              return [
                {
                  slot,
                  scheduledAt,
                  sendAt: afterQuietHours(Math.max(scheduledAt, now), general),
                  reportDate: localDate(scheduledAt, general.timeZone),
                },
              ];
            }),
          ]
            .sort((a, b) => a.sendAt - b.sendAt)
            .slice(0, 2)
        : [];
    return {
      settings,
      delivery,
      startsOn: shared.startsOn,
      timeZone: general.timeZone,
      quietStart: general.quietStart,
      quietEnd: general.quietEnd,
      connection: link?.status ?? "disconnected",
      botAvailable: this.transport !== null,
      state,
      nextRuns,
      goals: goals.map((goal) => ({
        goalId: goal.id,
        title: goal.title,
        included: selected.has(goal.id),
      })),
    };
  }
  async save({ ownerId, input, now }: { ownerId: string; input: ReportInput; now: number }) {
    await this.prepare.execute({ ownerId, month: input.month, now });
    await this.validate(ownerId, input);
    const [current, general] = await Promise.all([
      this.reports.settings(ownerId),
      this.reminders.settings(ownerId),
    ]);
    const scheduleChanged =
      current.enabled !== input.enabled ||
      current.wednesdayTime !== input.wednesdayTime ||
      current.sundayTime !== input.sundayTime;
    const settings: ReportSettings = {
      ...current,
      enabled: input.enabled,
      wednesdayTime: input.wednesdayTime,
      sundayTime: input.sundayTime,
      nextWednesdayAt:
        scheduleChanged || current.nextWednesdayAt === null
          ? nextReportOccurrence(now, general.timeZone, input.wednesdayTime, 3)
          : current.nextWednesdayAt,
      nextSundayAt:
        scheduleChanged || current.nextSundayAt === null
          ? nextReportOccurrence(now, general.timeZone, input.sundayTime, 7)
          : current.nextSundayAt,
    };
    await this.reports.save(settings, input.goals, input.startsOn, scheduleChanged);
    return this.get({ ownerId, month: input.month, now });
  }
  async preview({
    ownerId,
    input,
    slot,
    now,
  }: {
    ownerId: string;
    input: ReportInput;
    slot: ReportSlot;
    now: number;
  }) {
    // Preview is deliberately read-only: no plan preparation, schedule writes or transport calls.
    await this.validate(ownerId, { ...input, enabled: false });
    const general = await this.reminders.settings(ownerId);
    const today = localDate(now, general.timeZone);
    const day = DateTime.fromISO(today, { zone: general.timeZone })
      .startOf("week")
      .plus({ days: slot === "wed" ? 2 : 6 })
      .toISODate() as string;
    const reportDate = day < today ? day : today;
    return this.build(ownerId, input, slot, reportDate, now, general.timeZone);
  }
  private async build(
    ownerId: string,
    input: ReportInput,
    slot: ReportSlot,
    reportDate: string,
    now: number,
    timeZone: string,
    delivery?: { scheduledAt: number; quietDelayed: boolean },
  ) {
    const overview = this.progress.calculateOverview(
      await this.source(ownerId, input, reportDate, now, timeZone, delivery === undefined),
    );
    return this.render(overview, slot, delivery);
  }
  private async source(
    ownerId: string,
    input: ReportInput,
    reportDate: string,
    now: number,
    timeZone: string,
    includeHistory: boolean,
  ) {
    const selections = new Map(
      (await this.reports.selections(ownerId)).map((goal) => [goal.goalId, goal.included]),
    );
    for (const goal of input.goals) selections.set(goal.goalId, goal.included);
    const goalIds = [...selections].filter(([, included]) => included).map(([goalId]) => goalId);
    return this.progress.prepareOverview({
      ownerId,
      now,
      timeZone,
      today: reportDate,
      period: "week",
      anchor: reportDate,
      startsOn: input.startsOn,
      goalIds,
      includeHistory,
    });
  }
  private render<T extends ProgressReportOverview>(
    overview: T,
    slot: ReportSlot,
    delivery?: { scheduledAt: number; quietDelayed: boolean },
  ) {
    if (["no-goals", "future-start", "before-start"].includes(overview.state))
      return { message: null, reason: overview.state, overview };
    return {
      message: reportMessage(overview, slot, this.appOrigin, delivery),
      reason: null,
      overview,
    };
  }
  async reschedule(ownerId: string, now: number, general: SettingsInput) {
    const current = await this.reports.settings(ownerId);
    if (!current.enabled) return;
    await this.reports.reschedule({
      ...current,
      nextWednesdayAt: nextReportOccurrence(now, general.timeZone, current.wednesdayTime, 3),
      nextSundayAt: nextReportOccurrence(now, general.timeZone, current.sundayTime, 7),
    });
  }
  async schedule(now: number, connectedSettings?: ReadonlyMap<string, ReminderSettings>) {
    for (const settings of await this.reports.active(now)) {
      const general = connectedSettings
        ? connectedSettings.get(settings.ownerId)
        : await this.reminders.settings(settings.ownerId);
      if (!general) continue;
      if (!connectedSettings && (await this.reminders.link(settings.ownerId))?.status !== "active")
        continue;
      // RunReminders prepares active reminder/report owners once before scheduling.
      for (const slot of ["wed", "sun"] as const) {
        const previous = slot === "wed" ? settings.nextWednesdayAt : settings.nextSundayAt;
        if (previous === null || previous > now) continue;
        const date = localDate(previous, general.timeZone);
        const monday = reportWeek(date).from;
        const dueAt = afterQuietHours(Math.max(previous, now), general);
        const job = isRecentOccurrence(previous, now)
          ? {
              ...makeJob(
                settings.ownerId,
                null,
                date,
                "weekly-progress",
                `progress:${settings.ownerId}:${monday}:${slot}`,
                now,
                dueAt,
              ),
              expiresAt: previous + 86400000,
            }
          : null;
        const next = nextReportOccurrence(
          now,
          general.timeZone,
          slot === "wed" ? settings.wednesdayTime : settings.sundayTime,
          slot === "wed" ? 3 : 7,
        );
        await this.reports.advance(settings, slot, previous, next, job);
      }
    }
  }
  async deliver(jobId: string, now: number, queued?: QueuedReminder) {
    if (!this.transport) return;
    const job = queued ?? (await this.reminders.job(jobId));
    if (job?.status !== "pending") return;
    const [report, shared, general, link] = await Promise.all([
      queued?.reportState?.report ?? this.reports.settings(job.ownerId),
      queued?.reportState?.progress ?? this.progress.settings(job.ownerId),
      queued?.deliveryState?.settings ?? this.reminders.settings(job.ownerId),
      queued?.deliveryState ? queued.deliveryState.link : this.reminders.link(job.ownerId),
    ]);
    if (
      !report.enabled ||
      link?.status !== "active" ||
      job.expiresAt <= now ||
      (shared.startsOn && shared.startsOn > job.localDate)
    ) {
      await this.reports.cancel(job.id);
      return;
    }
    const dueAt = afterQuietHours(now, general);
    if (dueAt > now) {
      await this.reports.postpone(job.id, dueAt);
      return;
    }
    let snapshot = readReportSnapshot(job.payload);
    let selectionChanged = false;
    if (snapshot) {
      const period = reportWeek(job.localDate);
      // Validate the selection without loading every historical entry again.
      const activeIds = await this.reports.activeGoalIds(
        job.ownerId,
        period.from.slice(0, 7),
        period.to.slice(0, 7),
      );
      selectionChanged = JSON.stringify([...snapshot.goalIds].sort()) !== JSON.stringify(activeIds);
    }
    const rebuild =
      !snapshot ||
      selectionChanged ||
      snapshot.reportRevision !== report.revision ||
      snapshot.progressRevision !== shared.revision ||
      snapshot.timeZone !== general.timeZone ||
      snapshot.quietStart !== general.quietStart ||
      snapshot.quietEnd !== general.quietEnd;
    const slot: ReportSlot = job.eventKey.endsWith(":wed") ? "wed" : "sun";
    const input: ReportInput = {
      month: job.localDate.slice(0, 7),
      enabled: report.enabled,
      wednesdayTime: report.wednesdayTime,
      sundayTime: report.sundayTime,
      startsOn: shared.startsOn,
      goals: [],
    };
    if (rebuild) {
      const delivery = {
        scheduledAt: job.expiresAt - 86400000,
        quietDelayed: afterQuietHours(job.expiresAt - 86400000, general) > job.expiresAt - 86400000,
      };
      const built = await this.build(
        job.ownerId,
        input,
        slot,
        job.localDate,
        now,
        general.timeZone,
        delivery,
      );
      if (!built.message) {
        await this.reports.cancel(job.id);
        return;
      }
      snapshot = {
        version: 1,
        reportRevision: report.revision,
        progressRevision: shared.revision,
        timeZone: general.timeZone,
        quietStart: general.quietStart,
        quietEnd: general.quietEnd,
        reportDate: job.localDate,
        period: built.overview.requested,
        startsOn: shared.startsOn,
        goalIds: built.overview.goals.flatMap((goal) => goal.goalIds),
        formedAt: built.overview.asOf,
        // Blocks are preview/UI data; delivery needs only text, HTML and buttons.
        message: {
          text: built.message.text,
          html: built.message.html,
          buttons: built.message.buttons,
        },
      };
      const payload = JSON.stringify(snapshot);
      if (!(await this.reports.setSnapshot(job.id, job.payload, payload))) return;
      job.payload = payload;
    }
    if (!snapshot) return;
    if (
      !(await this.reports.claim(
        job,
        general,
        snapshot.reportRevision,
        snapshot.progressRevision,
        link.chatId,
        now,
      ))
    ) {
      // Concurrent settings/selection edits invalidate the unsent snapshot. The
      // next alarm rebuilds it; ambiguous or completed sends are never replayed.
      await this.reports.setSnapshot(job.id, job.payload, "[]");
      return;
    }
    try {
      const messageId = await this.transport.send(link.chatId, snapshot.message);
      await this.reminders.updateJob(job.id, {
        status: "sent",
        chatId: link.chatId,
        messageId,
        leaseUntil: null,
      });
    } catch (error) {
      const failure = error instanceof DeliveryError ? error : new DeliveryError("unknown");
      if (failure.kind === "blocked") await this.reminders.block(job.ownerId);
      await this.reminders.updateJob(
        job.id,
        failedDeliveryChanges(
          { ...job, attempts: job.attempts + 1 },
          failure.kind,
          failure.retryAfter,
          now,
        ),
      );
    }
  }
}
