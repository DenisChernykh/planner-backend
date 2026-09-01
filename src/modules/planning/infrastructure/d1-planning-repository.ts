import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
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

  constructor(binding: D1Database) {
    this.database = drizzle(binding);
  }

  async createGoal(goal: GoalRecord): Promise<GoalRecord> {
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
      .orderBy(asc(planGoals.createdAt), asc(planGoals.id));
    return rows.map(toGoal);
  }

  async updateOwnedGoal(
    goalId: string,
    ownerId: string,
    changes: GoalUpdate,
  ): Promise<GoalRecord | null> {
    const current = await this.findOwnedActiveGoal(goalId, ownerId);
    if (!current) return null;
    const next = {
      ...current,
      ...(changes.title === undefined ? {} : { title: changes.title }),
      ...(changes.description === undefined ? {} : { description: changes.description }),
      ...(changes.tracking === undefined ? {} : { tracking: changes.tracking }),
      ...(changes.cadence === undefined ? {} : { cadence: changes.cadence }),
      updatedAt: changes.updatedAt,
    };
    await this.database
      .update(planGoals)
      .set({
        title: next.title,
        description: next.description,
        trackingType: next.tracking.type,
        trackingConfig: JSON.stringify(next.tracking),
        cadencePeriod: next.cadence.period,
        targetOccurrences: next.cadence.period === "day" ? null : next.cadence.targetOccurrences,
        updatedAt: next.updatedAt,
      })
      .where(
        and(eq(planGoals.id, goalId), eq(planGoals.ownerId, ownerId), isNull(planGoals.deletedAt)),
      );
    return next;
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
    const restored = await this.database
      .update(planGoals)
      .set({ deletedAt: null, updatedAt })
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
