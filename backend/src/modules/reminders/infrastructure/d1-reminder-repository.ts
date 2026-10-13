import { and, eq, exists, gt, inArray, isNull, like, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  goalReminders,
  reminderJobs,
  reminderSettings,
  telegramLinks,
  telegramLinkTokens,
} from "../../../platform/database/schema";
import type {
  ReminderRepository,
  ReminderSchedulingState,
} from "../application/ports/reminder-repository";
import {
  DEFAULT_SETTINGS,
  type GoalReminder,
  type ReminderJob,
  type ReminderSettings,
} from "../domain/model";

type JobRow = typeof reminderJobs.$inferSelect;
const toJob = (row: JobRow): ReminderJob => ({
  ...row,
  kind: row.kind as ReminderJob["kind"],
  status: row.status as ReminderJob["status"],
});
const toReminder = (row: typeof goalReminders.$inferSelect): GoalReminder => ({
  ...row,
  mode: row.mode as GoalReminder["mode"],
  weekdays: JSON.parse(row.weekdays) as number[],
});
type SettingsRow = {
  owner_id: string;
  enabled: number;
  time_zone: string;
  quiet_start: string;
  quiet_end: string;
  evening_time: string;
  next_evening_at: number | null;
  revision: string;
};
const settingsFromRow = (row: SettingsRow): ReminderSettings => ({
  ownerId: row.owner_id,
  enabled: Boolean(row.enabled),
  timeZone: row.time_zone,
  quietStart: row.quiet_start,
  quietEnd: row.quiet_end,
  eveningTime: row.evening_time,
  nextEveningAt: row.next_evening_at,
  revision: row.revision,
});
const reminderColumns = `r.goal_id AS goalId, r.owner_id AS ownerId, r.mode, r.time,
  r.weekdays, r.next_run_at AS nextRunAt, r.revision`;
const jobColumns = `id, event_key AS eventKey, owner_id AS ownerId, goal_id AS goalId,
  local_date AS localDate, kind, status, due_at AS dueAt, expires_at AS expiresAt,
  lease_until AS leaseUntil, chat_id AS chatId, message_id AS messageId,
  expected_revision AS expectedRevision, payload, attempts, created_at AS createdAt`;

// Unsent automatic jobs can be rebuilt after a schedule edit. Keep delivery history,
// including uncertain sends, and never release the event key of a delivered message.
const replaceableAutomaticJob = and(
  or(like(reminderJobs.eventKey, "scheduled:%"), like(reminderJobs.eventKey, "evening:%")),
  isNull(reminderJobs.messageId),
  or(
    eq(reminderJobs.status, "pending"),
    and(eq(reminderJobs.status, "cancelled"), eq(reminderJobs.attempts, 0)),
  ),
);

export class D1ReminderRepository implements ReminderRepository {
  private database: ReturnType<typeof drizzle> | undefined;
  constructor(private readonly binding: D1Database) {}
  private get db() {
    this.database ??= drizzle(this.binding);
    return this.database;
  }

  async settings(ownerId: string): Promise<ReminderSettings> {
    const row = await this.binding
      .prepare("SELECT * FROM reminder_settings WHERE owner_id = ?")
      .bind(ownerId)
      .first<SettingsRow>();
    return row ? settingsFromRow(row) : { ownerId, ...DEFAULT_SETTINGS, nextEveningAt: null };
  }
  async saveSettings(
    settings: ReminderSettings,
    reminders: GoalReminder[],
    expected?: ReminderSettings,
  ): Promise<boolean> {
    const previous = expected ?? (await this.settings(settings.ownerId));
    const revision = crypto.randomUUID();
    const versions = JSON.stringify(
      reminders.map((item) => ({ goalId: item.goalId, revision: item.revision ?? "initial" })),
    );
    const writtenSettings = this.db
      .select({ ownerId: reminderSettings.ownerId })
      .from(reminderSettings)
      .where(
        and(
          eq(reminderSettings.ownerId, settings.ownerId),
          eq(reminderSettings.revision, revision),
        ),
      );
    const operations = [
      this.binding
        .prepare(`INSERT INTO reminder_settings
        (owner_id, enabled, time_zone, quiet_start, quiet_end, evening_time, next_evening_at, revision)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE coalesce((SELECT revision FROM reminder_settings WHERE owner_id = ?), 'initial') = ?
        AND (SELECT COUNT(*) FROM goal_reminders WHERE owner_id = ?) = json_array_length(?)
        AND NOT EXISTS (SELECT 1 FROM goal_reminders r WHERE r.owner_id = ? AND NOT EXISTS (
          SELECT 1 FROM json_each(?) v WHERE json_extract(v.value, '$.goalId') = r.goal_id AND json_extract(v.value, '$.revision') = r.revision))
        ON CONFLICT(owner_id) DO UPDATE SET enabled = excluded.enabled, time_zone = excluded.time_zone,
          quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end, evening_time = excluded.evening_time,
          next_evening_at = excluded.next_evening_at, revision = excluded.revision`)
        .bind(
          settings.ownerId,
          Number(settings.enabled),
          settings.timeZone,
          settings.quietStart,
          settings.quietEnd,
          settings.eveningTime,
          settings.nextEveningAt,
          revision,
          settings.ownerId,
          previous.revision ?? "initial",
          settings.ownerId,
          versions,
          settings.ownerId,
          versions,
        ),
      // Release unsent automatic event keys before rebuilding the day's schedule.
      this.db
        .delete(reminderJobs)
        .where(
          and(
            eq(reminderJobs.ownerId, settings.ownerId),
            replaceableAutomaticJob,
            exists(writtenSettings),
          ),
        ),
      this.db
        .update(reminderJobs)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(reminderJobs.ownerId, settings.ownerId),
            eq(reminderJobs.status, "pending"),
            ne(reminderJobs.kind, "weekly-progress"),
            exists(writtenSettings),
          ),
        ),
      ...reminders.map((item) =>
        this.db
          .update(goalReminders)
          .set({ nextRunAt: item.nextRunAt, revision })
          .where(and(eq(goalReminders.goalId, item.goalId), exists(writtenSettings))),
      ),
    ];
    const statements = operations.map((operation) => {
      if (!("toSQL" in operation)) return operation;
      const query = operation.toSQL();
      return this.binding.prepare(query.sql).bind(...query.params);
    });
    const results = await this.binding.batch(statements);
    return results[0]?.meta.changes === 1;
  }
  async schedulingState(): Promise<ReminderSchedulingState[]> {
    // One read replaces per-owner scans and plan inheritance on every minute.
    // Keep unfinished inheritance visible after an interrupted month rollover.
    const rows = await this.binding
      .prepare(`SELECT u.id AS owner_id, coalesce(s.enabled, 0) AS enabled,
        coalesce(s.time_zone, 'Asia/Yekaterinburg') AS time_zone,
        coalesce(s.quiet_start, '23:00') AS quiet_start, coalesce(s.quiet_end, '08:00') AS quiet_end,
        coalesce(s.evening_time, '21:00') AS evening_time, s.next_evening_at,
        coalesce(s.revision, 'initial') AS revision,
        (SELECT json_group_array(month) FROM plan_month_rollovers WHERE owner_id = u.id) AS prepared_months,
        (SELECT json_group_array(DISTINCT target.month) FROM plan_goals target
          WHERE target.owner_id = u.id AND target.deleted_at IS NULL AND target.carried_from_goal_id IS NOT NULL
          AND (EXISTS (SELECT 1 FROM goal_reminders source WHERE source.goal_id = target.carried_from_goal_id AND source.owner_id = u.id)
            AND NOT EXISTS (SELECT 1 FROM goal_reminders inherited WHERE inherited.goal_id = target.id)
          OR EXISTS (SELECT 1 FROM goal_progress_reports source WHERE source.goal_id = target.carried_from_goal_id AND source.owner_id = u.id)
            AND NOT EXISTS (SELECT 1 FROM goal_progress_reports inherited WHERE inherited.goal_id = target.id))) AS inheritance_months,
        (SELECT json_group_object(month, due_at) FROM (
          SELECT g.month, min(r.next_run_at) AS due_at FROM goal_reminders r JOIN plan_goals g ON g.id = r.goal_id
          WHERE r.owner_id = u.id AND g.owner_id = u.id AND g.deleted_at IS NULL
            AND r.mode = 'scheduled' AND r.next_run_at IS NOT NULL GROUP BY g.month
        )) AS next_goal_runs
        FROM users u JOIN telegram_links l ON l.owner_id = u.id AND l.status = 'active'
        LEFT JOIN reminder_settings s ON s.owner_id = u.id
        WHERE s.enabled = 1 OR EXISTS (SELECT 1 FROM progress_report_settings p WHERE p.owner_id = u.id AND p.enabled = 1)`)
      .all<
        SettingsRow & {
          prepared_months: string;
          inheritance_months: string;
          next_goal_runs: string;
        }
      >();
    return rows.results.map((row) => ({
      settings: settingsFromRow(row),
      preparedMonths: JSON.parse(row.prepared_months) as string[],
      inheritanceMonths: JSON.parse(row.inheritance_months) as string[],
      nextGoalRuns: JSON.parse(row.next_goal_runs) as Record<string, number>,
    }));
  }
  async reminders(ownerId: string): Promise<GoalReminder[]> {
    const rows = await this.binding
      .prepare(`SELECT ${reminderColumns} FROM goal_reminders r WHERE r.owner_id = ?`)
      .bind(ownerId)
      .all<typeof goalReminders.$inferSelect>();
    return rows.results.map(toReminder);
  }
  async reminder(ownerId: string, goalId: string): Promise<GoalReminder | null> {
    const row = await this.binding
      .prepare(
        `SELECT ${reminderColumns} FROM goal_reminders r WHERE r.owner_id = ? AND r.goal_id = ?`,
      )
      .bind(ownerId, goalId)
      .first<typeof goalReminders.$inferSelect>();
    return row ? toReminder(row) : null;
  }
  async saveReminder(item: GoalReminder, expected?: ReminderSettings): Promise<boolean> {
    const settings = expected ?? (await this.settings(item.ownerId));
    const revision = crypto.randomUUID();
    const writtenRule = this.db
      .select({ goalId: goalReminders.goalId })
      .from(goalReminders)
      .where(and(eq(goalReminders.goalId, item.goalId), eq(goalReminders.revision, revision)));
    const operations = [
      this.binding
        .prepare(`INSERT INTO goal_reminders (goal_id, owner_id, mode, time, weekdays, next_run_at, revision)
        SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE coalesce((SELECT revision FROM reminder_settings WHERE owner_id = ?), 'initial') = ?
        AND EXISTS (SELECT 1 FROM plan_goals WHERE id = ? AND owner_id = ? AND deleted_at IS NULL)
        ON CONFLICT(goal_id) DO UPDATE SET mode = excluded.mode, time = excluded.time,
          weekdays = excluded.weekdays, next_run_at = excluded.next_run_at, revision = excluded.revision`)
        .bind(
          item.goalId,
          item.ownerId,
          item.mode,
          item.time,
          JSON.stringify(item.weekdays),
          item.nextRunAt,
          revision,
          item.ownerId,
          settings.revision ?? "initial",
          item.goalId,
          item.ownerId,
        ),
      this.db
        .delete(reminderJobs)
        .where(
          and(eq(reminderJobs.goalId, item.goalId), replaceableAutomaticJob, exists(writtenRule)),
        ),
      this.db
        .update(reminderJobs)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(reminderJobs.goalId, item.goalId),
            eq(reminderJobs.status, "pending"),
            exists(writtenRule),
          ),
        ),
    ];
    const statements = operations.map((operation) => {
      if (!("toSQL" in operation)) return operation;
      const query = operation.toSQL();
      return this.binding.prepare(query.sql).bind(...query.params);
    });
    const results = await this.binding.batch(statements);
    return results[0]?.meta.changes === 1;
  }
  async inheritReminder(
    source: GoalReminder,
    target: GoalReminder,
    timeZone: string,
  ): Promise<boolean> {
    // Retry-safe and never overwrite a new month's manually edited setting.
    // Recheck the source and timezone to reject an inheritance based on stale reads.
    const result = await this.binding
      .prepare(`INSERT INTO goal_reminders (goal_id, owner_id, mode, time, weekdays, next_run_at)
      SELECT target.id, source.owner_id, source.mode, source.time, source.weekdays, ?
      FROM goal_reminders source JOIN plan_goals target ON target.carried_from_goal_id = source.goal_id
      WHERE target.id = ? AND target.owner_id = ? AND target.deleted_at IS NULL
        AND source.goal_id = ? AND source.owner_id = ? AND source.mode = ? AND source.time = ? AND source.weekdays = ?
        AND NOT EXISTS (SELECT 1 FROM reminder_settings WHERE owner_id = ? AND time_zone != ?)
      ON CONFLICT(goal_id) DO NOTHING`)
      .bind(
        target.nextRunAt,
        target.goalId,
        target.ownerId,
        source.goalId,
        source.ownerId,
        source.mode,
        source.time,
        JSON.stringify(source.weekdays),
        source.ownerId,
        timeZone,
      )
      .run();
    return result.meta.changes === 1;
  }

  async scheduledReminders(ownerId: string, month: string, now: number): Promise<GoalReminder[]> {
    const rows = await this.binding
      .prepare(`SELECT ${reminderColumns} FROM goal_reminders r JOIN plan_goals g ON g.id = r.goal_id
        WHERE r.owner_id = ? AND g.owner_id = ? AND g.month = ? AND g.deleted_at IS NULL
          AND r.mode = 'scheduled' AND r.next_run_at <= ? ORDER BY r.next_run_at, r.goal_id LIMIT 5`)
      .bind(ownerId, ownerId, month, now)
      .all<typeof goalReminders.$inferSelect>();
    return rows.results.map(toReminder);
  }

  async link(ownerId: string) {
    return this.binding
      .prepare(`SELECT owner_id AS ownerId, chat_id AS chatId, telegram_user_id AS telegramUserId, status
        FROM telegram_links WHERE owner_id = ?`)
      .bind(ownerId)
      .first<typeof telegramLinks.$inferSelect>();
  }
  async linkForChat(chatId: string, userId: string) {
    return (
      (
        await this.db
          .select()
          .from(telegramLinks)
          .where(
            and(
              eq(telegramLinks.chatId, chatId),
              eq(telegramLinks.telegramUserId, userId),
              eq(telegramLinks.status, "active"),
            ),
          )
      )[0] ?? null
    );
  }
  async createLinkToken(ownerId: string, hash: string, expiresAt: number): Promise<void> {
    await this.db
      .insert(telegramLinkTokens)
      .values({ ownerId, tokenHash: hash, expiresAt })
      .onConflictDoUpdate({
        target: telegramLinkTokens.ownerId,
        set: { tokenHash: hash, expiresAt },
      });
  }
  async hasLinkToken(hash: string, now: number): Promise<boolean> {
    return Boolean(
      await this.binding
        .prepare("SELECT 1 FROM telegram_link_tokens WHERE token_hash = ? AND expires_at > ?")
        .bind(hash, now)
        .first(),
    );
  }
  async consumeLinkToken(
    hash: string,
    chatId: string,
    userId: string,
    now: number,
  ): Promise<boolean> {
    const results = await this.binding.batch([
      this.binding
        .prepare(`INSERT INTO telegram_links (owner_id, chat_id, telegram_user_id, status)
        SELECT owner_id, ?, ?, 'active' FROM telegram_link_tokens t WHERE token_hash = ? AND expires_at > ?
        AND NOT EXISTS (SELECT 1 FROM telegram_links l WHERE l.owner_id != t.owner_id AND (l.chat_id = ? OR l.telegram_user_id = ?))
        ON CONFLICT(owner_id) DO UPDATE SET chat_id = excluded.chat_id, telegram_user_id = excluded.telegram_user_id, status = 'active'
        RETURNING owner_id`)
        .bind(chatId, userId, hash, now, chatId, userId),
      this.binding.prepare("DELETE FROM telegram_link_tokens WHERE token_hash = ?").bind(hash),
    ]);
    return (results[0]?.results.length ?? 0) === 1;
  }
  async disconnect(ownerId: string): Promise<void> {
    await this.db.batch([
      this.db.delete(telegramLinks).where(eq(telegramLinks.ownerId, ownerId)),
      this.db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.ownerId, ownerId)),
      this.db
        .update(reminderJobs)
        .set({ status: "cancelled" })
        .where(eq(reminderJobs.ownerId, ownerId)),
      this.db
        .update(reminderSettings)
        .set({ enabled: false })
        .where(eq(reminderSettings.ownerId, ownerId)),
    ]);
  }
  async block(ownerId: string): Promise<void> {
    await this.db
      .update(telegramLinks)
      .set({ status: "blocked" })
      .where(eq(telegramLinks.ownerId, ownerId));
  }
  async enqueue(job: ReminderJob): Promise<ReminderJob> {
    await this.db
      .insert(reminderJobs)
      .values(job)
      .onConflictDoNothing({ target: reminderJobs.eventKey });
    const [row] = await this.db
      .select()
      .from(reminderJobs)
      .where(eq(reminderJobs.eventKey, job.eventKey));
    if (!row) throw new Error("Missing reminder job");
    return toJob(row);
  }
  async advanceGoal(
    item: GoalReminder,
    previous: number,
    job: ReminderJob | null,
    settings: ReminderSettings,
  ): Promise<void> {
    const advance = this.binding
      .prepare(`UPDATE goal_reminders SET next_run_at = ?
        WHERE goal_id = ? AND owner_id = ? AND next_run_at = ? AND mode = ? AND time = ? AND weekdays = ? AND revision = ?
        AND EXISTS (SELECT 1 FROM reminder_settings WHERE owner_id = ? AND enabled = ? AND time_zone = ?
          AND quiet_start = ? AND quiet_end = ? AND evening_time = ? AND revision = ?)`)
      .bind(
        item.nextRunAt,
        item.goalId,
        item.ownerId,
        previous,
        item.mode,
        item.time,
        JSON.stringify(item.weekdays),
        item.revision ?? "initial",
        settings.ownerId,
        Number(settings.enabled),
        settings.timeZone,
        settings.quietStart,
        settings.quietEnd,
        settings.eveningTime,
        settings.revision ?? "initial",
      );
    await this.advanceSchedule(advance, job);
  }
  async advanceEvening(
    settings: ReminderSettings,
    previous: number,
    next: number,
    job: ReminderJob | null,
  ): Promise<void> {
    const advance = this.binding
      .prepare(`UPDATE reminder_settings SET next_evening_at = ?
        WHERE owner_id = ? AND next_evening_at = ? AND enabled = ? AND time_zone = ?
          AND quiet_start = ? AND quiet_end = ? AND evening_time = ? AND revision = ?`)
      .bind(
        next,
        settings.ownerId,
        previous,
        Number(settings.enabled),
        settings.timeZone,
        settings.quietStart,
        settings.quietEnd,
        settings.eveningTime,
        settings.revision ?? "initial",
      );
    await this.advanceSchedule(advance, job);
  }
  private async advanceSchedule(advance: D1PreparedStatement, job: ReminderJob | null) {
    if (!job) {
      await advance.run();
      return;
    }
    // D1 batches are atomic. Only the winner of the immediately preceding schedule
    // update may insert work; a losing/stale tick must not enqueue a question.
    await this.binding.batch([
      advance,
      this.binding
        .prepare(`INSERT INTO reminder_jobs
        (id, event_key, owner_id, goal_id, local_date, kind, status, due_at, expires_at,
         lease_until, chat_id, message_id, expected_revision, payload, attempts, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1
        ON CONFLICT(event_key) DO NOTHING`)
        .bind(
          job.id,
          job.eventKey,
          job.ownerId,
          job.goalId,
          job.localDate,
          job.kind,
          job.status,
          job.dueAt,
          job.expiresAt,
          job.leaseUntil,
          job.chatId,
          job.messageId,
          job.expectedRevision,
          job.payload,
          job.attempts,
          job.createdAt,
        ),
    ]);
  }
  async due(now: number): Promise<ReminderJob[]> {
    const rows = await this.binding
      .prepare(
        `SELECT ${jobColumns} FROM reminder_jobs WHERE status = 'pending' AND due_at <= ? ORDER BY due_at, id LIMIT 1`,
      )
      .bind(now)
      .all<JobRow>();
    return rows.results.map(toJob);
  }
  async job(id: string): Promise<ReminderJob | null> {
    const row = await this.binding
      .prepare(`SELECT ${jobColumns} FROM reminder_jobs WHERE id = ?`)
      .bind(id)
      .first<JobRow>();
    return row ? toJob(row) : null;
  }
  async replyJob(chatId: string, messageId: number): Promise<ReminderJob | null> {
    const [row] = await this.db
      .select()
      .from(reminderJobs)
      .where(and(eq(reminderJobs.chatId, chatId), eq(reminderJobs.messageId, messageId)));
    return row ? toJob(row) : null;
  }
  async claim(id: string, now: number): Promise<boolean> {
    const result = await this.binding
      .prepare(`UPDATE reminder_jobs SET status = 'sending', lease_until = ?, attempts = attempts + 1
        WHERE id = ? AND status = 'pending' AND due_at <= ?`)
      .bind(now + 60_000, id, now)
      .run();
    return result.meta.changes === 1;
  }
  async updateJob(id: string, changes: Partial<ReminderJob>): Promise<void> {
    const columns: Record<keyof ReminderJob, string> = {
      id: "id",
      eventKey: "event_key",
      ownerId: "owner_id",
      goalId: "goal_id",
      localDate: "local_date",
      kind: "kind",
      status: "status",
      dueAt: "due_at",
      expiresAt: "expires_at",
      leaseUntil: "lease_until",
      chatId: "chat_id",
      messageId: "message_id",
      expectedRevision: "expected_revision",
      payload: "payload",
      attempts: "attempts",
      createdAt: "created_at",
    };
    const entries = Object.entries(changes).filter(([, value]) => value !== undefined);
    if (!entries.length) return;
    await this.binding
      .prepare(
        `UPDATE reminder_jobs SET ${entries.map(([key]) => `${columns[key as keyof ReminderJob]} = ?`).join(", ")} WHERE id = ?`,
      )
      .bind(...entries.map(([, value]) => value), id)
      .run();
  }
  async recover(now: number): Promise<void> {
    // A crashed send may have reached Telegram: do not automatically resend it.
    await this.binding
      .prepare(
        "UPDATE reminder_jobs SET status = 'unknown', lease_until = NULL WHERE status = 'sending' AND lease_until <= ?",
      )
      .bind(now)
      .run();
    if (Math.floor(now / 60_000) % 60 !== 0) return;
    const cutoff = now - 90 * 86_400_000;
    await this.binding.batch([
      this.binding
        .prepare(
          "DELETE FROM reminder_jobs WHERE id IN (SELECT id FROM reminder_jobs WHERE created_at < ? ORDER BY created_at LIMIT 25)",
        )
        .bind(cutoff),
      this.binding
        .prepare(
          "DELETE FROM telegram_link_tokens WHERE token_hash IN (SELECT token_hash FROM telegram_link_tokens WHERE expires_at <= ? LIMIT 25)",
        )
        .bind(now),
    ]);
  }

  async deliveryIssues(ownerId: string, since: number): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(reminderJobs)
      .where(
        and(
          eq(reminderJobs.ownerId, ownerId),
          inArray(reminderJobs.status, ["failed", "unknown"]),
          gt(reminderJobs.createdAt, since),
        ),
      );
    return row?.count ?? 0;
  }
}
