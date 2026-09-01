import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { goalEntries, planGoals } from "../../../platform/database/schema";
import type { GoalRecord, GoalTracking } from "../application/model";
import type { GoalUpdate, PlanningRepository, StoredEntry } from "../application/ports";

type GoalRow = typeof planGoals.$inferSelect;
type EntryRow = typeof goalEntries.$inferSelect;

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function toGoal(row: GoalRow): GoalRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    month: row.month,
    title: row.title,
    description: row.description,
    tracking: parseJson<GoalTracking>(row.trackingConfig),
    cadence:
      row.cadencePeriod === "day"
        ? { period: "day" }
        : {
            period: row.cadencePeriod as "week" | "month",
            targetOccurrences: row.targetOccurrences as number,
          },
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toEntry(row: EntryRow): StoredEntry {
  return {
    goalId: row.goalId,
    date: row.localDate,
    value: parseJson<boolean | number | string>(row.value),
    met: row.met,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class D1PlanningRepository implements PlanningRepository {
  private readonly database;
  private readonly binding: D1Database;

  constructor(binding: D1Database) {
    this.binding = binding;
    this.database = drizzle(binding);
  }

  async createGoal(goal: GoalRecord): Promise<GoalRecord> {
    const sortOrder = await this.nextSortOrder(goal.ownerId, goal.month, goal.cadence.period);
    await this.database.insert(planGoals).values({
      id: goal.id,
      ownerId: goal.ownerId,
      month: goal.month,
      title: goal.title,
      description: goal.description,
      trackingType: goal.tracking.type,
      trackingConfig: JSON.stringify(goal.tracking),
      cadencePeriod: goal.cadence.period,
      targetOccurrences: goal.cadence.period === "day" ? null : goal.cadence.targetOccurrences,
      sortOrder,
      deletedAt: goal.deletedAt,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
    });
    return goal;
  }

  async findOwnedActiveGoal(goalId: string, ownerId: string): Promise<GoalRecord | null> {
    const [row] = await this.database
      .select()
      .from(planGoals)
      .where(
        and(eq(planGoals.id, goalId), eq(planGoals.ownerId, ownerId), isNull(planGoals.deletedAt)),
      )
      .limit(1);
    return row ? toGoal(row) : null;
  }

  async listGoals(ownerId: string, month: string, includeDeleted: boolean): Promise<GoalRecord[]> {
    const rows = await this.database
      .select()
      .from(planGoals)
      .where(
        and(
          eq(planGoals.ownerId, ownerId),
          eq(planGoals.month, month),
          includeDeleted ? isNotNull(planGoals.deletedAt) : isNull(planGoals.deletedAt),
        ),
      )
      .orderBy(
        sql`CASE ${planGoals.cadencePeriod} WHEN 'day' THEN 0 WHEN 'week' THEN 1 ELSE 2 END`,
        asc(planGoals.sortOrder),
        asc(planGoals.createdAt),
        asc(planGoals.id),
      );
    return rows.map(toGoal);
  }

  private async nextSortOrder(ownerId: string, month: string, cadence: string): Promise<number> {
    const [row] = await this.database
      .select({ sortOrder: planGoals.sortOrder })
      .from(planGoals)
      .where(
        and(
          eq(planGoals.ownerId, ownerId),
          eq(planGoals.month, month),
          eq(planGoals.cadencePeriod, cadence),
          isNull(planGoals.deletedAt),
        ),
      )
      .orderBy(desc(planGoals.sortOrder))
      .limit(1);
    return (row?.sortOrder ?? -1) + 1;
  }

  async reorderGoals(
    ownerId: string,
    month: string,
    cadence: "day" | "week" | "month",
    goalIds: string[],
  ): Promise<boolean> {
    const sql = `
      WITH requested_order AS (
        SELECT CAST(key AS INTEGER) AS sort_order, value AS id
        FROM json_each(?)
      ),
      active_goals AS (
        SELECT id
        FROM plan_goals
        WHERE owner_id = ?
          AND month = ?
          AND cadence_period = ?
          AND deleted_at IS NULL
      ),
      valid_request AS (
        SELECT
          (SELECT COUNT(*) FROM active_goals) = (SELECT COUNT(*) FROM requested_order)
            AND (SELECT COUNT(*) FROM active_goals WHERE id IN (SELECT id FROM requested_order)) =
              (SELECT COUNT(*) FROM requested_order)
            AND (SELECT COUNT(DISTINCT id) FROM requested_order) =
              (SELECT COUNT(*) FROM requested_order) AS valid
      )
      UPDATE plan_goals
      SET sort_order = (SELECT requested_order.sort_order
        FROM requested_order WHERE requested_order.id = plan_goals.id)
      WHERE id IN (SELECT id FROM active_goals)
        AND EXISTS (SELECT 1 FROM valid_request WHERE valid)
    `;
    const result = await this.binding
      .prepare(sql)
      .bind(JSON.stringify(goalIds), ownerId, month, cadence)
      .run();
    return result.meta.changes === goalIds.length;
  }

  async updateOwnedGoal(
    goalId: string,
    ownerId: string,
    changes: GoalUpdate,
  ): Promise<GoalRecord | null> {
    const current = await this.findOwnedActiveGoal(goalId, ownerId);
    if (!current) return null;
    const sortOrder =
      changes.cadence !== undefined && changes.cadence.period !== current.cadence.period
        ? await this.nextSortOrder(current.ownerId, current.month, changes.cadence.period)
        : undefined;
    const updated = await this.database
      .update(planGoals)
      .set({
        updatedAt: changes.updatedAt,
        ...(changes.title === undefined ? {} : { title: changes.title }),
        ...(changes.description === undefined ? {} : { description: changes.description }),
        ...(changes.tracking === undefined
          ? {}
          : {
              trackingType: changes.tracking.type,
              trackingConfig: JSON.stringify(changes.tracking),
            }),
        ...(changes.cadence === undefined
          ? {}
          : {
              cadencePeriod: changes.cadence.period,
              targetOccurrences:
                changes.cadence.period === "day" ? null : changes.cadence.targetOccurrences,
              ...(sortOrder === undefined ? {} : { sortOrder }),
            }),
      })
      .where(
        and(eq(planGoals.id, goalId), eq(planGoals.ownerId, ownerId), isNull(planGoals.deletedAt)),
      )
      .returning();
    return updated[0] ? toGoal(updated[0]) : null;
  }

  async softDeleteOwnedGoal(goalId: string, ownerId: string, deletedAt: number): Promise<boolean> {
    const deleted = await this.database
      .update(planGoals)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(
        and(eq(planGoals.id, goalId), eq(planGoals.ownerId, ownerId), isNull(planGoals.deletedAt)),
      )
      .returning({ id: planGoals.id });
    return deleted.length === 1;
  }

  async restoreOwnedGoal(goalId: string, ownerId: string, updatedAt: number): Promise<boolean> {
    const [row] = await this.database
      .select({
        ownerId: planGoals.ownerId,
        month: planGoals.month,
        cadence: planGoals.cadencePeriod,
      })
      .from(planGoals)
      .where(
        and(
          eq(planGoals.id, goalId),
          eq(planGoals.ownerId, ownerId),
          isNotNull(planGoals.deletedAt),
        ),
      )
      .limit(1);
    if (!row) return false;
    const sortOrder = await this.nextSortOrder(row.ownerId, row.month, row.cadence);
    const restored = await this.database
      .update(planGoals)
      .set({ deletedAt: null, updatedAt, sortOrder })
      .where(
        and(
          eq(planGoals.id, goalId),
          eq(planGoals.ownerId, ownerId),
          isNotNull(planGoals.deletedAt),
        ),
      )
      .returning({ id: planGoals.id });
    return restored.length === 1;
  }

  async listEntries(goalId: string): Promise<StoredEntry[]> {
    const rows = await this.database
      .select()
      .from(goalEntries)
      .where(eq(goalEntries.goalId, goalId))
      .orderBy(desc(goalEntries.localDate));
    return rows.map(toEntry);
  }

  async listEntriesForPlan(
    ownerId: string,
    month: string,
    includeDeleted: boolean,
  ): Promise<StoredEntry[]> {
    const planGoalIds = this.database
      .select({ id: planGoals.id })
      .from(planGoals)
      .where(
        and(
          eq(planGoals.ownerId, ownerId),
          eq(planGoals.month, month),
          includeDeleted ? isNotNull(planGoals.deletedAt) : isNull(planGoals.deletedAt),
        ),
      );
    const rows: EntryRow[] = await this.database
      .select()
      .from(goalEntries)
      .where(inArray(goalEntries.goalId, planGoalIds))
      .orderBy(asc(goalEntries.goalId), desc(goalEntries.localDate));
    return rows.map(toEntry);
  }

  async upsertEntry(entry: StoredEntry): Promise<StoredEntry> {
    await this.database
      .insert(goalEntries)
      .values({
        goalId: entry.goalId,
        localDate: entry.date,
        value: JSON.stringify(entry.value),
        met: entry.met,
        note: entry.note,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })
      .onConflictDoUpdate({
        target: [goalEntries.goalId, goalEntries.localDate],
        set: {
          value: JSON.stringify(entry.value),
          met: entry.met,
          note: entry.note,
          updatedAt: entry.updatedAt,
        },
      });
    return entry;
  }

  async deleteEntry(goalId: string, date: string): Promise<boolean> {
    const deleted = await this.database
      .delete(goalEntries)
      .where(and(eq(goalEntries.goalId, goalId), eq(goalEntries.localDate, date)))
      .returning({ goalId: goalEntries.goalId });
    return deleted.length === 1;
  }
}
