import type { ProgressReportRepository } from "../application/ports/progress-report-repository";
import type { ReminderJob, ReminderSettings } from "../domain/model";
import type { ReportSelection, ReportSettings, ReportSlot } from "../domain/progress-reports";

type Row = {
  owner_id: string;
  enabled: number;
  wednesday_time: string;
  sunday_time: string;
  next_wednesday_at: number | null;
  next_sunday_at: number | null;
  revision: number;
};
const map = (row: Row): ReportSettings => ({
  ownerId: row.owner_id,
  enabled: Boolean(row.enabled),
  wednesdayTime: row.wednesday_time,
  sundayTime: row.sunday_time,
  nextWednesdayAt: row.next_wednesday_at,
  nextSundayAt: row.next_sunday_at,
  revision: row.revision,
});
export class D1ProgressReportRepository implements ProgressReportRepository {
  constructor(private readonly database: D1Database) {}
  async settings(ownerId: string): Promise<ReportSettings> {
    const row = await this.database
      .prepare("SELECT * FROM progress_report_settings WHERE owner_id = ?")
      .bind(ownerId)
      .first<Row>();
    return row
      ? map(row)
      : {
          ownerId,
          enabled: false,
          wednesdayTime: "21:00",
          sundayTime: "21:00",
          nextWednesdayAt: null,
          nextSundayAt: null,
          revision: 0,
        };
  }
  async active() {
    return (
      await this.database
        .prepare("SELECT * FROM progress_report_settings WHERE enabled = 1")
        .all<Row>()
    ).results.map(map);
  }
  async selections(ownerId: string): Promise<ReportSelection[]> {
    const rows = await this.database
      .prepare("SELECT goal_id, included FROM goal_progress_reports WHERE owner_id = ?")
      .bind(ownerId)
      .all<{ goal_id: string; included: number }>();
    return rows.results.map((row) => ({ goalId: row.goal_id, included: Boolean(row.included) }));
  }
  async upcoming(ownerId: string, now: number) {
    const rows = await this.database
      .prepare(
        "SELECT event_key, local_date, due_at FROM reminder_jobs WHERE owner_id = ? AND kind = 'weekly-progress' AND status = 'pending' AND expires_at > ? ORDER BY due_at LIMIT 2",
      )
      .bind(ownerId, now)
      .all<{ event_key: string; local_date: string; due_at: number }>();
    return rows.results.map((row) => ({
      slot: row.event_key.endsWith(":wed") ? ("wed" as const) : ("sun" as const),
      reportDate: row.local_date,
      dueAt: row.due_at,
    }));
  }
  async save(
    settings: ReportSettings,
    selections: ReportSelection[],
    startsOn: string | null,
    scheduleChanged: boolean,
  ) {
    const { ownerId } = settings;
    await this.database.batch([
      this.database
        .prepare(`INSERT INTO progress_report_settings (owner_id, enabled, wednesday_time, sunday_time, next_wednesday_at, next_sunday_at, revision)
        VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(owner_id) DO UPDATE SET enabled = excluded.enabled, wednesday_time = excluded.wednesday_time,
        sunday_time = excluded.sunday_time, next_wednesday_at = excluded.next_wednesday_at, next_sunday_at = excluded.next_sunday_at, revision = revision + 1`)
        .bind(
          ownerId,
          Number(settings.enabled),
          settings.wednesdayTime,
          settings.sundayTime,
          settings.nextWednesdayAt,
          settings.nextSundayAt,
        ),
      this.database
        .prepare(`INSERT INTO goal_progress_reports (goal_id, owner_id, included)
        SELECT json_extract(value, '$.goalId'), ?, json_extract(value, '$.included') FROM json_each(?)
        WHERE EXISTS (SELECT 1 FROM plan_goals WHERE id = json_extract(value, '$.goalId') AND owner_id = ? AND deleted_at IS NULL)
        ON CONFLICT(goal_id) DO UPDATE SET included = excluded.included WHERE owner_id = excluded.owner_id`)
        .bind(ownerId, JSON.stringify(selections), ownerId),
      this.database
        .prepare(`INSERT INTO progress_settings (owner_id, starts_on, revision) VALUES (?, ?, 1)
        ON CONFLICT(owner_id) DO UPDATE SET starts_on = excluded.starts_on, revision = revision + 1 WHERE starts_on IS NOT excluded.starts_on`)
        .bind(ownerId, startsOn),
      this.database
        .prepare(
          `UPDATE reminder_jobs SET status = ?, payload = '[]' WHERE owner_id = ? AND kind = 'weekly-progress' AND status = 'pending'`,
        )
        .bind(scheduleChanged || !settings.enabled ? "cancelled" : "pending", ownerId),
    ]);
  }
  async reschedule(settings: ReportSettings) {
    await this.database.batch([
      this.database
        .prepare(
          `UPDATE progress_report_settings SET next_wednesday_at = ?, next_sunday_at = ?, revision = revision + 1 WHERE owner_id = ? AND revision = ?`,
        )
        .bind(settings.nextWednesdayAt, settings.nextSundayAt, settings.ownerId, settings.revision),
      this.database
        .prepare(
          "UPDATE reminder_jobs SET status = 'cancelled' WHERE owner_id = ? AND kind = 'weekly-progress' AND status = 'pending' AND changes() = 1",
        )
        .bind(settings.ownerId),
    ]);
  }
  async inherit(ownerId: string, carried: { sourceGoalId: string; goalId: string }[]) {
    for (const part of carried) {
      await this.database
        .prepare(`INSERT INTO goal_progress_reports (goal_id, owner_id, included)
        SELECT target.id, source.owner_id, source.included FROM goal_progress_reports source JOIN plan_goals target ON target.carried_from_goal_id = source.goal_id
        WHERE source.goal_id = ? AND source.owner_id = ? AND target.id = ? AND target.owner_id = source.owner_id AND target.deleted_at IS NULL
        ON CONFLICT(goal_id) DO NOTHING`)
        .bind(part.sourceGoalId, ownerId, part.goalId)
        .run();
    }
  }
  async advance(
    settings: ReportSettings,
    slot: ReportSlot,
    previous: number,
    next: number,
    job: ReminderJob | null,
  ) {
    const column = slot === "wed" ? "next_wednesday_at" : "next_sunday_at";
    const advance = this.database
      .prepare(
        `UPDATE progress_report_settings SET ${column} = ? WHERE owner_id = ? AND revision = ? AND enabled = 1 AND ${column} = ?`,
      )
      .bind(next, settings.ownerId, settings.revision, previous);
    if (!job) {
      await advance.run();
      return;
    }
    await this.database.batch([
      advance,
      this.database
        .prepare(`INSERT INTO reminder_jobs (id, event_key, owner_id, local_date, kind, status, due_at, expires_at, payload, attempts, created_at)
        SELECT ?, ?, ?, ?, 'weekly-progress', 'pending', ?, ?, '[]', 0, ? WHERE changes() = 1
        ON CONFLICT(event_key) DO UPDATE SET status = 'pending', due_at = excluded.due_at, expires_at = excluded.expires_at, payload = '[]'
        WHERE reminder_jobs.status = 'cancelled' AND reminder_jobs.message_id IS NULL AND reminder_jobs.kind = 'weekly-progress'`)
        .bind(
          job.id,
          job.eventKey,
          job.ownerId,
          job.localDate,
          job.dueAt,
          job.expiresAt,
          job.createdAt,
        ),
    ]);
  }
  async setSnapshot(id: string, previous: string, payload: string) {
    const result = await this.database
      .prepare(
        "UPDATE reminder_jobs SET payload = ? WHERE id = ? AND status = 'pending' AND payload = ?",
      )
      .bind(payload, id, previous)
      .run();
    return result.meta.changes === 1;
  }
  async postpone(id: string, dueAt: number) {
    await this.database
      .prepare("UPDATE reminder_jobs SET due_at = ? WHERE id = ? AND status = 'pending'")
      .bind(dueAt, id)
      .run();
  }
  async cancel(id: string) {
    await this.database
      .prepare("UPDATE reminder_jobs SET status = 'cancelled' WHERE id = ? AND status = 'pending'")
      .bind(id)
      .run();
  }
  async claim(
    job: ReminderJob,
    settings: ReminderSettings,
    reportRevision: number,
    progressRevision: number,
    chatId: string,
    now: number,
  ) {
    const result = await this.database
      .prepare(`UPDATE reminder_jobs SET status = 'sending', lease_until = ?, attempts = attempts + 1
      WHERE id = ? AND status = 'pending' AND due_at <= ? AND expires_at > ? AND payload = ?
      AND EXISTS (SELECT 1 FROM progress_report_settings WHERE owner_id = ? AND enabled = 1 AND revision = ?)
      AND coalesce((SELECT revision FROM progress_settings WHERE owner_id = ?), 0) = ?
      AND EXISTS (SELECT 1 FROM telegram_links WHERE owner_id = ? AND status = 'active' AND chat_id = ?)
      AND NOT EXISTS (SELECT 1 FROM json_each(json_extract(reminder_jobs.payload, '$.goalIds')) selected
        WHERE NOT EXISTS (SELECT 1 FROM plan_goals goal JOIN goal_progress_reports selection ON selection.goal_id = goal.id
          WHERE goal.id = selected.value AND goal.owner_id = reminder_jobs.owner_id AND goal.deleted_at IS NULL AND selection.owner_id = goal.owner_id AND selection.included = 1))
      AND (SELECT count(*) FROM plan_goals goal JOIN goal_progress_reports selection ON selection.goal_id = goal.id
        WHERE goal.owner_id = reminder_jobs.owner_id AND goal.deleted_at IS NULL AND selection.owner_id = goal.owner_id AND selection.included = 1
        AND goal.month BETWEEN substr(json_extract(reminder_jobs.payload, '$.period.from'), 1, 7) AND substr(json_extract(reminder_jobs.payload, '$.period.to'), 1, 7)) = json_array_length(json_extract(reminder_jobs.payload, '$.goalIds'))
      AND (NOT EXISTS (SELECT 1 FROM reminder_settings WHERE owner_id = ?) OR EXISTS
        (SELECT 1 FROM reminder_settings WHERE owner_id = ? AND time_zone = ? AND quiet_start = ? AND quiet_end = ?))`)
      .bind(
        now + 60000,
        job.id,
        now,
        now,
        job.payload,
        job.ownerId,
        reportRevision,
        job.ownerId,
        progressRevision,
        job.ownerId,
        chatId,
        job.ownerId,
        job.ownerId,
        settings.timeZone,
        settings.quietStart,
        settings.quietEnd,
      )
      .run();
    return result.meta.changes === 1;
  }
}
