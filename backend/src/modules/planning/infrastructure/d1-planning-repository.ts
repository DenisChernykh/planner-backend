import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { goalEntries, planGoals } from "../../../platform/database/schema";
import type { AnswerRepository } from "../application/ports/answer-repository";
import type {
  CarriedGoal,
  MonthRolloverCommit,
  MonthRolloverRepository,
  MonthRolloverState,
} from "../application/ports/month-rollover-repository";
import type {
  GoalUpdate,
  PlanningRepository,
  StoredEntry,
} from "../application/ports/planning-repository";
import type { GoalRecord, GoalTracking } from "../domain/model";
import type { EntrySnapshot, RecordAnswerInput } from "../public-contracts";

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

function toGoalRow(goal: GoalRecord, sortOrder: number) {
  return {
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
  };
}

// Includes ordering and definitions, so a concurrent edit or deletion retries the snapshot.
const rolloverRevision = `json_array(id, title, description, tracking_config, cadence_period,
  target_occurrences, sort_order, created_at, updated_at)`;
const previousMonthSql = `SELECT MAX(month) FROM (
  SELECT month FROM plan_goals WHERE owner_id = ? AND month < ?
  UNION ALL SELECT month FROM plan_month_rollovers WHERE owner_id = ? AND month < ?
)`;

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

export class D1PlanningRepository
  implements PlanningRepository, AnswerRepository, MonthRolloverRepository
{
  private readonly database;
  private readonly binding: D1Database;

  constructor(binding: D1Database) {
    this.binding = binding;
    this.database = drizzle(binding);
  }

  async createGoal(goal: GoalRecord): Promise<GoalRecord> {
    const sortOrder = await this.nextSortOrder(goal.ownerId, goal.month, goal.cadence.period);
    await this.database.insert(planGoals).values(toGoalRow(goal, sortOrder));
    return goal;
  }

  async rolloverState(ownerId: string, month: string): Promise<MonthRolloverState> {
    const initialized = await this.binding
      .prepare("SELECT 1 FROM plan_month_rollovers WHERE owner_id = ? AND month = ?")
      .bind(ownerId, month)
      .first();
    if (initialized) return { initialized: true, sourceMonth: null, goals: [] };
    const previous = await this.binding
      .prepare(previousMonthSql)
      .bind(ownerId, month, ownerId, month)
      .first<{ "MAX(month)": string | null }>();
    const sourceMonth = previous?.["MAX(month)"] ?? null;
    const rows =
      sourceMonth === null
        ? []
        : await this.database
            .select({
              ...getTableColumns(planGoals),
              revision: sql<string>`${sql.raw(rolloverRevision)}`,
            })
            .from(planGoals)
            .where(
              and(
                eq(planGoals.ownerId, ownerId),
                eq(planGoals.month, sourceMonth),
                isNull(planGoals.deletedAt),
              ),
            )
            .orderBy(asc(planGoals.sortOrder), asc(planGoals.createdAt), asc(planGoals.id));
    return {
      initialized: false,
      sourceMonth,
      goals: rows.map((row) => ({
        goal: toGoal(row),
        revision: row.revision,
        sortOrder: row.sortOrder,
      })),
    };
  }

  async commitRollover(input: MonthRolloverCommit): Promise<boolean> {
    const { ownerId, month, operationId, sourceMonth, now } = input;
    const revisions = JSON.stringify(input.goals.map((item) => item.revision));
    const goals = JSON.stringify(
      input.goals.map((item) => ({
        ...toGoalRow(item.goal, item.sortOrder),
        carriedFromGoalId: item.sourceGoalId,
      })),
    );
    // Receipt and all goals commit together. The operation ID gates the losing batch.
    // A manually planned target (including trash) is sealed without copying anything.
    const results = await this.binding.batch([
      this.binding
        .prepare(`INSERT INTO plan_month_rollovers
        (owner_id, month, operation_id, source_month, created_at)
        SELECT ?, ?, ?, CASE WHEN EXISTS (
          SELECT 1 FROM plan_goals WHERE owner_id = ? AND month = ?
        ) THEN NULL ELSE ? END, ?
        WHERE EXISTS (SELECT 1 FROM plan_goals WHERE owner_id = ? AND month = ?)
          OR ((${previousMonthSql}) IS ?
            AND (SELECT COUNT(*) FROM plan_goals WHERE owner_id = ? AND month = ? AND deleted_at IS NULL) = json_array_length(?)
            AND NOT EXISTS (SELECT 1 FROM plan_goals WHERE owner_id = ? AND month = ? AND deleted_at IS NULL
              AND ${rolloverRevision} NOT IN (SELECT value FROM json_each(?))))
        ON CONFLICT(owner_id, month) DO NOTHING`)
        .bind(
          ownerId,
          month,
          operationId,
          ownerId,
          month,
          sourceMonth,
          now,
          ownerId,
          month,
          ownerId,
          month,
          ownerId,
          month,
          sourceMonth,
          ownerId,
          sourceMonth,
          revisions,
          ownerId,
          sourceMonth,
          revisions,
        ),
      this.binding
        .prepare(`INSERT INTO plan_goals
        (id, owner_id, month, title, description, tracking_type, tracking_config,
          cadence_period, target_occurrences, sort_order, deleted_at, created_at, updated_at, carried_from_goal_id)
        SELECT json_extract(value, '$.id'), json_extract(value, '$.ownerId'), json_extract(value, '$.month'),
          json_extract(value, '$.title'), json_extract(value, '$.description'), json_extract(value, '$.trackingType'),
          json_extract(value, '$.trackingConfig'), json_extract(value, '$.cadencePeriod'),
          json_extract(value, '$.targetOccurrences'), json_extract(value, '$.sortOrder'), NULL,
          json_extract(value, '$.createdAt'), json_extract(value, '$.updatedAt'), json_extract(value, '$.carriedFromGoalId')
        FROM json_each(?) WHERE EXISTS (SELECT 1 FROM plan_month_rollovers
          WHERE owner_id = ? AND month = ? AND operation_id = ? AND source_month = ?)`)
        .bind(goals, ownerId, month, operationId, sourceMonth),
    ]);
    return results[0]?.meta.changes === 1;
  }

  async carriedGoals(ownerId: string, month: string): Promise<CarriedGoal[]> {
    const rows = await this.database
      .select({ sourceGoalId: planGoals.carriedFromGoalId, goalId: planGoals.id })
      .from(planGoals)
      .where(
        and(
          eq(planGoals.ownerId, ownerId),
          lte(planGoals.month, month),
          isNull(planGoals.deletedAt),
          isNotNull(planGoals.carriedFromGoalId),
        ),
      )
      .orderBy(asc(planGoals.month));
    return rows.flatMap((row) =>
      row.sourceGoalId === null ? [] : [{ ...row, sourceGoalId: row.sourceGoalId }],
    );
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
        revision: crypto.randomUUID(),
        met: entry.met,
        note: entry.note,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })
      .onConflictDoUpdate({
        target: [goalEntries.goalId, goalEntries.localDate],
        set: {
          value: JSON.stringify(entry.value),
          revision: crypto.randomUUID(),
          met: entry.met,
          note: entry.note,
          updatedAt: entry.updatedAt,
        },
      });
    return entry;
  }

  async entrySnapshot(
    ownerId: string,
    goalId: string,
    date: string,
  ): Promise<EntrySnapshot | null> {
    const [row] = await this.database
      .select({ entry: goalEntries })
      .from(goalEntries)
      .innerJoin(planGoals, eq(planGoals.id, goalEntries.goalId))
      .where(
        and(
          eq(planGoals.ownerId, ownerId),
          isNull(planGoals.deletedAt),
          eq(goalEntries.goalId, goalId),
          eq(goalEntries.localDate, date),
        ),
      )
      .limit(1);
    return row ? { entry: toEntry(row.entry), revision: row.entry.revision } : null;
  }

  async recordAnswer(
    input: RecordAnswerInput,
    entry: StoredEntry,
    goalUpdatedAt: number,
    receiptLifetime: "retry-window" | "goal" = "retry-window",
  ): Promise<"saved" | "conflict"> {
    const { operationId, ownerId, goalId, date, expectedRevision, now } = input;
    const eligibility = `EXISTS (SELECT 1 FROM plan_goals WHERE id = ? AND owner_id = ?
      AND deleted_at IS NULL AND updated_at = ?)
      AND NOT EXISTS (SELECT 1 FROM planning_entry_commands WHERE id = ?)`;
    const write =
      expectedRevision === null
        ? this.binding
            .prepare(`INSERT INTO goal_entries
        (goal_id, local_date, value, met, note, created_at, updated_at, revision)
        SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${eligibility}
        ON CONFLICT(goal_id, local_date) DO NOTHING`)
            .bind(
              goalId,
              date,
              JSON.stringify(entry.value),
              Number(entry.met),
              entry.note,
              entry.createdAt,
              now,
              operationId,
              goalId,
              ownerId,
              goalUpdatedAt,
              operationId,
            )
        : this.binding
            .prepare(`UPDATE goal_entries SET value = ?, met = ?, updated_at = ?, revision = ?
        WHERE goal_id = ? AND local_date = ? AND revision = ? AND ${eligibility}`)
            .bind(
              JSON.stringify(entry.value),
              Number(entry.met),
              now,
              operationId,
              goalId,
              date,
              expectedRevision,
              goalId,
              ownerId,
              goalUpdatedAt,
              operationId,
            );
    // The command receipt and mutation commit together. Re-delivery never reapplies an old answer.
    const results = await this.binding.batch<{ result?: string }>([
      write,
      this.binding
        .prepare(`INSERT INTO planning_entry_commands (id, result, created_at, goal_id)
        SELECT ?, CASE WHEN EXISTS (SELECT 1 FROM goal_entries WHERE goal_id = ?
          AND local_date = ? AND revision = ?) THEN 'saved' ELSE 'conflict' END, ?, ?
        ON CONFLICT(id) DO NOTHING`)
        .bind(
          operationId,
          goalId,
          date,
          operationId,
          now,
          receiptLifetime === "goal" ? goalId : null,
        ),
      this.binding
        .prepare("SELECT result FROM planning_entry_commands WHERE id = ?")
        .bind(operationId),
    ]);
    const result = results[2]?.results[0]?.result;
    return result === "saved" ? "saved" : "conflict";
  }

  async deleteEntry(goalId: string, date: string): Promise<boolean> {
    const deleted = await this.database
      .delete(goalEntries)
      .where(and(eq(goalEntries.goalId, goalId), eq(goalEntries.localDate, date)))
      .returning({ goalId: goalEntries.goalId });
    return deleted.length === 1;
  }
}
