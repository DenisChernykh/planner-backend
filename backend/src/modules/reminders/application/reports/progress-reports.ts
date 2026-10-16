import { DateTime } from "luxon";
import { ApplicationError } from "../../../../shared/application/application-error";
import type { PlanningOperations } from "../../../planning/public-contracts";
import type { ProgressOperations } from "../../../progress/public-contracts";
import {
  DELIVERY_ISSUE_WINDOW_MS,
  failedDeliveryChanges,
  isRecentOccurrence,
} from "../../domain/jobs";
import type { SettingsInput } from "../../domain/model";
import {
  nextReportOccurrence,
  type ReportInput,
  type ReportSettings,
  type ReportSlot,
} from "../../domain/progress-reports";
import { afterQuietHours, localDate } from "../../domain/schedule";
import type { OutgoingMessage } from "../delivery/outgoing-message";
import type { ProgressReportRepository } from "../ports/progress-report-repository";
import type { ReminderRepository } from "../ports/reminder-repository";
import { DeliveryError, type ReminderTransport } from "../ports/reminder-transport";
import { makeJob } from "../scheduling/make-job";
import type { PrepareCurrentPlanUseCase } from "../scheduling/prepare-current-plan.use-case";
import { reportMessage } from "./report-message";

type Snapshot = {
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
    const selections = new Map(
      (await this.reports.selections(ownerId)).map((goal) => [goal.goalId, goal.included]),
    );
    for (const goal of input.goals) selections.set(goal.goalId, goal.included);
    const goalIds = [...selections].filter(([, included]) => included).map(([goalId]) => goalId);
    const overview = await this.progress.overview({
      ownerId,
      now,
      timeZone,
      today: reportDate,
      period: "week",
      anchor: reportDate,
      startsOn: input.startsOn,
      goalIds,
    });
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
  async schedule(now: number, limit = Infinity) {
    let advanced = 0;
    for (const settings of await this.reports.active(now)) {
      const general = await this.reminders.settings(settings.ownerId);
      if ((await this.reminders.link(settings.ownerId))?.status !== "active") continue;
      // RunReminders prepares active reminder/report owners once before scheduling.
      for (const slot of ["wed", "sun"] as const) {
        const previous = slot === "wed" ? settings.nextWednesdayAt : settings.nextSundayAt;
        if (previous === null || previous > now) continue;
        const date = localDate(previous, general.timeZone);
        const monday = DateTime.fromISO(date, { zone: general.timeZone })
          .startOf("week")
          .toISODate();
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
        if (++advanced >= limit) return;
      }
    }
  }
  async deliver(jobId: string, now: number, deferNewSnapshot = false) {
    if (!this.transport) return;
    const job = await this.reminders.job(jobId);
    if (job?.status !== "pending") return;
    const [report, shared, general, link] = await Promise.all([
      this.reports.settings(job.ownerId),
      this.progress.settings(job.ownerId),
      this.reminders.settings(job.ownerId),
      this.reminders.link(job.ownerId),
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
    let snapshot = job.payload === "[]" ? null : (JSON.parse(job.payload) as Snapshot);
    let selectionChanged = false;
    if (snapshot) {
      const period = DateTime.fromISO(job.localDate, { zone: general.timeZone }).startOf("week");
      const [selections, sources] = await Promise.all([
        this.reports.selections(job.ownerId),
        this.planning.progressSources(
          job.ownerId,
          period.toFormat("yyyy-MM"),
          period.plus({ days: 6 }).toFormat("yyyy-MM"),
        ),
      ]);
      const selected = new Set(
        selections.filter((goal) => goal.included).map((goal) => goal.goalId),
      );
      const activeIds = sources
        .filter((goal) => selected.has(goal.id))
        .map((goal) => goal.id)
        .sort();
      selectionChanged = JSON.stringify([...snapshot.goalIds].sort()) !== JSON.stringify(activeIds);
    }
    if (
      !snapshot ||
      selectionChanged ||
      snapshot.reportRevision !== report.revision ||
      snapshot.progressRevision !== shared.revision ||
      snapshot.timeZone !== general.timeZone ||
      snapshot.quietStart !== general.quietStart ||
      snapshot.quietEnd !== general.quietEnd
    ) {
      const slot: ReportSlot = job.eventKey.endsWith(":wed") ? "wed" : "sun";
      const built = await this.build(
        job.ownerId,
        {
          month: job.localDate.slice(0, 7),
          enabled: report.enabled,
          wednesdayTime: report.wednesdayTime,
          sundayTime: report.sundayTime,
          startsOn: shared.startsOn,
          goals: [],
        },
        slot,
        job.localDate,
        now,
        general.timeZone,
        {
          scheduledAt: job.expiresAt - 86400000,
          quietDelayed:
            afterQuietHours(job.expiresAt - 86400000, general) > job.expiresAt - 86400000,
        },
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
        formedAt: now,
        message: built.message,
      };
      const payload = JSON.stringify(snapshot);
      if (!(await this.reports.setSnapshot(job.id, job.payload, payload))) return;
      job.payload = payload;
      // Production Cron persists preparation before claiming/sending on its next tick.
      if (deferNewSnapshot) return;
    }
    if (
      !(await this.reports.claim(
        job,
        general,
        snapshot.reportRevision,
        snapshot.progressRevision,
        link.chatId,
        now,
      ))
    )
      return;
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
