import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  goalReminders,
  reminderJobs,
  reminderSettings,
  telegramLinks,
  telegramLinkTokens,
} from "../../../platform/database/schema";
import {
  DEFAULT_SETTINGS,
  type GoalReminder,
  type ReminderJob,
  type ReminderSettings,
} from "../application/model";
import type { ReminderRepository } from "../application/ports";

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

export class D1ReminderRepository implements ReminderRepository {
  private readonly db;
  constructor(private readonly binding: D1Database) {
    this.db = drizzle(binding);
  }

  async settings(ownerId: string): Promise<ReminderSettings> {
    const [row] = await this.db
      .select()
      .from(reminderSettings)
      .where(eq(reminderSettings.ownerId, ownerId));
    return row ?? { ownerId, ...DEFAULT_SETTINGS, nextEveningAt: null };
  }
  async saveSettings(settings: ReminderSettings, reminders: GoalReminder[]): Promise<void> {
    await this.db.batch([
      this.db
        .insert(reminderSettings)
        .values(settings)
        .onConflictDoUpdate({ target: reminderSettings.ownerId, set: settings }),
      // Rebuild pending automatic work with the new settings. Sent questions stay addressable.
      this.db
        .update(reminderJobs)
        .set({ status: "cancelled" })
        .where(and(eq(reminderJobs.ownerId, settings.ownerId), eq(reminderJobs.status, "pending"))),
      ...reminders.map((item) =>
        this.db
          .update(goalReminders)
          .set({ nextRunAt: item.nextRunAt })
          .where(eq(goalReminders.goalId, item.goalId)),
      ),
    ]);
  }
  async activeSettings(): Promise<ReminderSettings[]> {
    return this.db.select().from(reminderSettings).where(eq(reminderSettings.enabled, true));
  }
  async reminders(ownerId: string): Promise<GoalReminder[]> {
    return (
      await this.db.select().from(goalReminders).where(eq(goalReminders.ownerId, ownerId))
    ).map(toReminder);
  }
  async saveReminder(item: GoalReminder): Promise<void> {
    const values = { ...item, weekdays: JSON.stringify(item.weekdays) };
    await this.db.batch([
      this.db
        .insert(goalReminders)
        .values(values)
        .onConflictDoUpdate({ target: goalReminders.goalId, set: values }),
      this.db
        .update(reminderJobs)
        .set({ status: "cancelled" })
        .where(and(eq(reminderJobs.goalId, item.goalId), eq(reminderJobs.status, "pending"))),
    ]);
  }
  async link(ownerId: string) {
    return (
      (await this.db.select().from(telegramLinks).where(eq(telegramLinks.ownerId, ownerId)))[0] ??
      null
    );
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
  async advanceGoal(item: GoalReminder, previous: number, job: ReminderJob | null): Promise<void> {
    // The unique event key permits concurrent ticks to safely insert the same event.
    const advance = this.db
      .update(goalReminders)
      .set({ nextRunAt: item.nextRunAt })
      .where(and(eq(goalReminders.goalId, item.goalId), eq(goalReminders.nextRunAt, previous)));
    if (job)
      await this.db.batch([
        this.db.insert(reminderJobs).values(job).onConflictDoNothing(),
        advance,
      ]);
    else await advance;
  }
  async advanceEvening(
    ownerId: string,
    previous: number,
    next: number,
    job: ReminderJob | null,
  ): Promise<void> {
    const advance = this.db
      .update(reminderSettings)
      .set({ nextEveningAt: next })
      .where(
        and(eq(reminderSettings.ownerId, ownerId), eq(reminderSettings.nextEveningAt, previous)),
      );
    if (job)
      await this.db.batch([
        this.db.insert(reminderJobs).values(job).onConflictDoNothing(),
        advance,
      ]);
    else await advance;
  }
  async due(now: number): Promise<ReminderJob[]> {
    return (
      await this.db
        .select()
        .from(reminderJobs)
        .where(and(eq(reminderJobs.status, "pending"), lte(reminderJobs.dueAt, now)))
        .orderBy(reminderJobs.dueAt)
        .limit(3)
    ).map(toJob);
  }
  async job(id: string): Promise<ReminderJob | null> {
    const [row] = await this.db.select().from(reminderJobs).where(eq(reminderJobs.id, id));
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
    const result = await this.db
      .update(reminderJobs)
      .set({
        status: "sending",
        leaseUntil: now + 60_000,
        attempts: sql`${reminderJobs.attempts} + 1`,
      })
      .where(
        and(
          eq(reminderJobs.id, id),
          eq(reminderJobs.status, "pending"),
          lte(reminderJobs.dueAt, now),
        ),
      )
      .returning({ id: reminderJobs.id });
    return result.length === 1;
  }
  async updateJob(id: string, changes: Partial<ReminderJob>): Promise<void> {
    await this.db.update(reminderJobs).set(changes).where(eq(reminderJobs.id, id));
  }
  async recover(now: number): Promise<void> {
    // A crashed send may have reached Telegram: do not automatically resend it.
    await this.db
      .update(reminderJobs)
      .set({ status: "unknown", leaseUntil: null })
      .where(and(eq(reminderJobs.status, "sending"), lte(reminderJobs.leaseUntil, now)));
    const cutoff = now - 90 * 86_400_000;
    await this.binding.batch([
      this.binding
        .prepare(
          "DELETE FROM reminder_jobs WHERE id IN (SELECT id FROM reminder_jobs WHERE created_at < ? LIMIT 25)",
        )
        .bind(cutoff),
      this.binding
        .prepare(
          "DELETE FROM planning_entry_commands WHERE id IN (SELECT id FROM planning_entry_commands WHERE created_at < ? LIMIT 25)",
        )
        .bind(cutoff),
      this.binding.prepare("DELETE FROM telegram_link_tokens WHERE expires_at <= ?").bind(now),
    ]);
  }

  async deliveryIssues(ownerId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(reminderJobs)
      .where(
        and(eq(reminderJobs.ownerId, ownerId), inArray(reminderJobs.status, ["failed", "unknown"])),
      );
    return row?.count ?? 0;
  }
}
