import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
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
  EntryWrite,
  GoalUpdate,
  PlanningRepository,
  StoredEntry,
} from "../application/ports/planning-repository";
import type { SearchRepository, SearchScope } from "../application/ports/search-repository";
import { EntryConflictError, GoalNotFoundError } from "../domain/errors";
import type { GoalRecord, GoalTracking } from "../domain/model";
import { calculateMet, validateEntry } from "../domain/rules";
import type { EntrySnapshot, ProgressPlanningSource, RecordAnswerInput } from "../public-contracts";

type GoalRow = typeof planGoals.$inferSelect;
type EntryRow = typeof goalEntries.$inferSelect;
const goalColumns = `id, owner_id AS ownerId, month, carried_from_goal_id AS carriedFromGoalId,
  title, description, tracking_type AS trackingType, tracking_config AS trackingConfig,
  cadence_period AS cadencePeriod, target_occurrences AS targetOccurrences, sort_order AS sortOrder,
  deleted_at AS deletedAt, created_at AS createdAt, updated_at AS updatedAt`;

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
    revision: row.revision,
    date: row.localDate,
    value: parseJson<boolean | number | string>(row.value),
    met: row.met,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class D1PlanningRepository
  implements PlanningRepository, AnswerRepository, MonthRolloverRepository, SearchRepository
{
  private dataSource: ReturnType<typeof drizzle> | undefined;
  private readonly binding: D1Database;

  constructor(binding: D1Database) {
    this.binding = binding;
  }
  private get database() {
    this.dataSource ??= drizzle(this.binding);
    return this.dataSource;
  }

  async progressSources(
    ownerId: string,
    fromMonth: string,
    toMonth: string,
  ): Promise<ProgressPlanningSource[]> {
    const scope = and(
      eq(planGoals.ownerId, ownerId),
      gte(planGoals.month, fromMonth),
      lte(planGoals.month, toMonth),
      isNull(planGoals.deletedAt),
    );
    const [goals, entries, ancestry] = await Promise.all([
      this.database
        .select()
        .from(planGoals)
        .where(scope)
        .orderBy(
          asc(planGoals.month),
          sql`CASE ${planGoals.cadencePeriod} WHEN 'day' THEN 0 WHEN 'week' THEN 1 ELSE 2 END`,
          asc(planGoals.sortOrder),
          asc(planGoals.id),
        ),
      this.database
        .select({ entry: goalEntries })
        .from(planGoals)
        .innerJoin(goalEntries, eq(planGoals.id, goalEntries.goalId))
        .where(scope),
      this.binding
        .prepare(`WITH RECURSIVE ancestry(leaf, id, parent) AS (
        SELECT id, id, carried_from_goal_id FROM plan_goals WHERE owner_id = ? AND month >= ? AND month <= ? AND deleted_at IS NULL
        UNION ALL SELECT a.leaf, p.id, p.carried_from_goal_id FROM ancestry a JOIN plan_goals p ON p.id = a.parent AND p.owner_id = ?
      ) SELECT leaf, id AS root FROM ancestry WHERE parent IS NULL OR NOT EXISTS (SELECT 1 FROM plan_goals WHERE id = ancestry.parent AND owner_id = ?)`)
        .bind(ownerId, fromMonth, toMonth, ownerId, ownerId)
        .all<{ leaf: string; root: string }>(),
    ]);
    const roots = new Map(ancestry.results.map((row) => [row.leaf, row.root]));
    const byGoal = new Map<string, EntryRow[]>();
    for (const { entry } of entries)
      byGoal.set(entry.goalId, [...(byGoal.get(entry.goalId) ?? []), entry]);
    return goals.map((row) => {
      const goal = toGoal(row);
      return {
        id: goal.id,
        chainId: roots.get(goal.id) ?? goal.id,
        month: goal.month,
        title: goal.title,
        tracking: goal.tracking,
        cadence: goal.cadence,
        entries: (byGoal.get(goal.id) ?? []).map((entry) => {
          const value = parseJson<boolean | number | string>(entry.value);
          return { date: entry.localDate, value, met: calculateMet(goal.tracking, value) };
        }),
      };
    });
  }

  private searchScope(ownerId: string, scope: SearchScope) {
    return and(
      eq(planGoals.ownerId, ownerId),
      scope.includeDeleted ? undefined : isNull(planGoals.deletedAt),
      scope.from ? gte(planGoals.month, scope.from.slice(0, 7)) : undefined,
      scope.to ? lte(planGoals.month, scope.to.slice(0, 7)) : undefined,
      scope.tracking ? eq(planGoals.trackingType, scope.tracking) : undefined,
      scope.cadence ? eq(planGoals.cadencePeriod, scope.cadence) : undefined,
      scope.goalId ? eq(planGoals.id, scope.goalId) : undefined,
    );
  }

  async searchGoals(ownerId: string, scope: SearchScope): Promise<GoalRecord[]> {
    const rows = await this.database
      .select()
      .from(planGoals)
      .where(this.searchScope(ownerId, scope))
      .orderBy(desc(planGoals.month), asc(planGoals.title), asc(planGoals.id));
    return rows.map(toGoal);
  }

  async searchEntries(ownerId: string, scope: SearchScope): Promise<StoredEntry[]> {
    // Join through the owner's indexed goals, including the trash only by explicit request.
    const rows = await this.database
      .select({ entry: goalEntries })
      .from(planGoals)
      .innerJoin(goalEntries, eq(goalEntries.goalId, planGoals.id))
      .where(
        and(
          this.searchScope(ownerId, scope),
          scope.from ? gte(goalEntries.localDate, scope.from) : undefined,
          scope.to ? lte(goalEntries.localDate, scope.to) : undefined,
        ),
      );
    return rows.map(({ entry }) => toEntry(entry));
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
    const row = await this.binding
      .prepare(
        `SELECT ${goalColumns} FROM plan_goals WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
      )
      .bind(goalId, ownerId)
      .first<GoalRow>();
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
    if (changes.tracking !== undefined) return this.updateGoalAndCriteria(goalId, ownerId, changes);
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

  private async updateGoalAndCriteria(
    goalId: string,
    ownerId: string,
    changes: GoalUpdate,
  ): Promise<GoalRecord | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await this.findOwnedActiveGoal(goalId, ownerId);
      if (!current) return null;
      const rows = await this.database
        .select()
        .from(goalEntries)
        .where(eq(goalEntries.goalId, goalId));
      const calculated = rows.map((row) => ({
        date: row.localDate,
        previous: row.revision,
        revision: crypto.randomUUID(),
        met: Number(
          calculateMet(
            changes.tracking ?? current.tracking,
            parseJson<boolean | number | string>(row.value),
          ),
        ),
      }));
      const sortOrder =
        changes.cadence && changes.cadence.period !== current.cadence.period
          ? await this.nextSortOrder(ownerId, current.month, changes.cadence.period)
          : undefined;
      const update = this.database
        .update(planGoals)
        .set({
          updatedAt: changes.updatedAt,
          ...(changes.title === undefined ? {} : { title: changes.title }),
          ...(changes.description === undefined ? {} : { description: changes.description }),
          trackingConfig: JSON.stringify(changes.tracking),
          ...(changes.cadence
            ? {
                cadencePeriod: changes.cadence.period,
                targetOccurrences:
                  changes.cadence.period === "day" ? null : changes.cadence.targetOccurrences,
              }
            : {}),
          ...(sortOrder === undefined ? {} : { sortOrder }),
        })
        .where(
          and(
            eq(planGoals.id, goalId),
            eq(planGoals.ownerId, ownerId),
            isNull(planGoals.deletedAt),
            eq(planGoals.updatedAt, current.updatedAt),
            sql`(SELECT count(*) FROM goal_entries WHERE goal_id = ${goalId}) = ${rows.length}`,
            sql`NOT EXISTS (SELECT 1 FROM goal_entries WHERE goal_id = ${goalId} AND revision NOT IN (SELECT json_extract(value, '$.previous') FROM json_each(${JSON.stringify(calculated)})))`,
          ),
        )
        .toSQL();
      // Validate the complete entry snapshot and update the definition and criteria in one D1 transaction.
      const result = await this.binding.batch([
        this.binding.prepare(update.sql).bind(...update.params),
        this.binding
          .prepare(`UPDATE goal_entries SET
          met = (SELECT json_extract(value, '$.met') FROM json_each(?) WHERE json_extract(value, '$.date') = goal_entries.local_date),
          revision = (SELECT json_extract(value, '$.revision') FROM json_each(?) WHERE json_extract(value, '$.date') = goal_entries.local_date)
          WHERE goal_id = ? AND changes() = 1`)
          .bind(JSON.stringify(calculated), JSON.stringify(calculated), goalId),
      ]);
      if (result[0]?.meta.changes === 1) return this.findOwnedActiveGoal(goalId, ownerId);
    }
    throw new EntryConflictError();
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
    date?: string,
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
      .where(
        and(
          inArray(goalEntries.goalId, planGoalIds),
          date === undefined ? undefined : eq(goalEntries.localDate, date),
        ),
      )
      .orderBy(asc(goalEntries.goalId), desc(goalEntries.localDate));
    return rows.map(toEntry);
  }

  async upsertEntry(
    entry: EntryWrite,
    expectedRevision: string | null = null,
  ): Promise<StoredEntry> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const [goal] = await this.database
        .select()
        .from(planGoals)
        .where(and(eq(planGoals.id, entry.goalId), isNull(planGoals.deletedAt)))
        .limit(1);
      if (!goal) throw new GoalNotFoundError();
      const tracking = parseJson<GoalTracking>(goal.trackingConfig);
      const checked = validateEntry(
        tracking,
        typeof entry.value === "boolean"
          ? { completed: entry.value, note: entry.note ?? undefined }
          : typeof entry.value === "number"
            ? { value: entry.value, note: entry.note ?? undefined }
            : { value: entry.value, note: entry.note ?? undefined },
      );
      const met = checked.met;
      const revision = crypto.randomUUID();
      // A fact validated just before a criteria edit must also match the definition at commit.
      const result = await this.binding
        .prepare(`INSERT INTO goal_entries
        (goal_id, local_date, value, met, note, created_at, updated_at, revision)
        SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM plan_goals WHERE id = ? AND deleted_at IS NULL AND updated_at = ? AND tracking_config = ?)
        AND (? IS NULL OR EXISTS (SELECT 1 FROM goal_entries WHERE goal_id = ? AND local_date = ? AND revision = ?))
        ON CONFLICT(goal_id, local_date) DO UPDATE SET value = excluded.value, met = excluded.met, note = excluded.note, updated_at = excluded.updated_at, revision = excluded.revision
        WHERE goal_entries.revision = ?`)
        .bind(
          entry.goalId,
          entry.date,
          JSON.stringify(entry.value),
          Number(met),
          entry.note,
          entry.createdAt,
          entry.updatedAt,
          revision,
          entry.goalId,
          goal.updatedAt,
          goal.trackingConfig,
          expectedRevision,
          entry.goalId,
          entry.date,
          expectedRevision,
          expectedRevision,
        )
        .run();
      if (result.meta.changes === 1) return { ...entry, met, revision };
      // A non-null revision must never recreate a concurrently deleted entry.
      if (expectedRevision !== null) throw new EntryConflictError();
    }
    throw new EntryConflictError();
  }

  async entrySnapshot(
    ownerId: string,
    goalId: string,
    date: string,
  ): Promise<EntrySnapshot | null> {
    const row = await this.binding
      .prepare(`SELECT e.goal_id AS goalId, e.local_date AS localDate, e.value, e.revision, e.met,
        e.note, e.created_at AS createdAt, e.updated_at AS updatedAt
        FROM goal_entries e JOIN plan_goals g ON g.id = e.goal_id
        WHERE g.owner_id = ? AND g.deleted_at IS NULL AND e.goal_id = ? AND e.local_date = ?`)
      .bind(ownerId, goalId, date)
      .first<EntryRow>();
    return row
      ? { entry: toEntry({ ...row, met: Boolean(row.met) }), revision: row.revision }
      : null;
  }

  async recordAnswer(
    input: RecordAnswerInput,
    entry: EntryWrite,
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

  async deleteEntry(goalId: string, date: string, expectedRevision: string): Promise<boolean> {
    const deleted = await this.database
      .delete(goalEntries)
      .where(
        and(
          eq(goalEntries.goalId, goalId),
          eq(goalEntries.localDate, date),
          eq(goalEntries.revision, expectedRevision),
        ),
      )
      .returning({ goalId: goalEntries.goalId });
    return deleted.length === 1;
  }

  async pruneEntryCommands(now: number): Promise<void> {
    // Without statistics SQLite can choose the goal_id index and read every recent
    // receipt. Pin the partial expiry index used by this bounded maintenance query.
    await this.binding
      .prepare(
        "DELETE FROM planning_entry_commands WHERE id IN (SELECT id FROM planning_entry_commands INDEXED BY planning_entry_commands_retention_idx WHERE goal_id IS NULL AND created_at < ? ORDER BY created_at LIMIT 25)",
      )
      .bind(now - 90 * 86_400_000)
      .run();
  }
}
