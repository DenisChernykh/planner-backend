import {
  EntryDateFutureError,
  EntryDateInvalidError,
  EntryNotFoundError,
  EntryValueInvalidError,
  GoalCadenceInvalidError,
  GoalDescriptionInvalidError,
  GoalNotFoundError,
  GoalTitleInvalidError,
  GoalTrackingInvalidError,
  GoalTypeImmutableError,
} from "./errors";
import type {
  GoalCadence,
  GoalCreateInput,
  GoalEntry,
  GoalEntryInput,
  GoalPatchInput,
  GoalRecord,
  GoalResource,
  GoalTracking,
  RepeatingCadence,
  TimeTracking,
} from "./model";
import type { GoalUpdate, PlanningRepository, StoredEntry } from "./ports";

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const LOCAL_TIME_ZONE = "Asia/Yekaterinburg";

function validMonth(month: string): boolean {
  return /^\d{4}-(?:0[1-9]|1[0-2])$/u.test(month);
}

function validDate(date: string): boolean {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u.test(date)) {
    return false;
  }
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return day <= daysInMonth(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`);
}

function daysInMonth(month: string): number {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function localToday(now: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: LOCAL_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeTitle(title: string): string {
  const normalized = title.trim();
  if (normalized.length < 1 || normalized.length > 160) {
    throw new GoalTitleInvalidError();
  }
  return normalized;
}

function normalizeDescription(description: string | null | undefined): string | null {
  if (description === undefined || description === null) return null;
  if (description.length > 2_000) throw new GoalDescriptionInvalidError();
  return description;
}

function parseTime(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key));
}

function validateTracking(tracking: GoalTracking): GoalTracking {
  if (!tracking || typeof tracking !== "object") throw new GoalTrackingInvalidError();
  switch (tracking.type) {
    case "check":
      if (Object.keys(tracking).length !== 1) throw new GoalTrackingInvalidError();
      return tracking;
    case "quantity":
      if (
        !hasOnlyKeys(tracking, ["type", "unit", "targetValue", "comparison"]) ||
        !Number.isFinite(tracking.targetValue) ||
        !["atLeast", "atMost", "equal"].includes(tracking.comparison) ||
        (tracking.unit !== undefined &&
          (typeof tracking.unit !== "string" || tracking.unit.trim().length > 64))
      ) {
        throw new GoalTrackingInvalidError();
      }
      return {
        ...tracking,
        unit: tracking.unit?.trim() || undefined,
      };
    case "scale":
      if (
        !hasOnlyKeys(tracking, ["type", "min", "max"]) ||
        !Number.isInteger(tracking.min) ||
        !Number.isInteger(tracking.max) ||
        tracking.min >= tracking.max
      ) {
        throw new GoalTrackingInvalidError();
      }
      return tracking;
    case "time":
      if (
        !hasOnlyKeys(tracking, ["type", "targetStart", "targetEnd"]) ||
        (tracking.targetStart !== undefined && !TIME_PATTERN.test(tracking.targetStart)) ||
        (tracking.targetEnd !== undefined && !TIME_PATTERN.test(tracking.targetEnd)) ||
        Boolean(tracking.targetStart) !== Boolean(tracking.targetEnd)
      ) {
        throw new GoalTrackingInvalidError();
      }
      return tracking;
    default:
      throw new GoalTrackingInvalidError();
  }
}

function validateCadence(cadence: GoalCadence, month: string): GoalCadence {
  if (!cadence || typeof cadence !== "object") throw new GoalCadenceInvalidError();
  if (cadence.period === "day") {
    if (Object.keys(cadence).length !== 1) throw new GoalCadenceInvalidError();
    return cadence;
  }
  if (
    (cadence.period !== "week" && cadence.period !== "month") ||
    !Number.isInteger(cadence.targetOccurrences) ||
    cadence.targetOccurrences < 1 ||
    (cadence.period === "week" && cadence.targetOccurrences > 7) ||
    (cadence.period === "month" && cadence.targetOccurrences > daysInMonth(month)) ||
    Object.keys(cadence).length !== 2
  ) {
    throw new GoalCadenceInvalidError();
  }
  return cadence;
}

function requireGoal(goal: GoalRecord | null): GoalRecord {
  if (!goal) throw new GoalNotFoundError();
  return goal;
}

function toResource(goal: GoalRecord, entries: GoalEntry[]): GoalResource {
  return { ...goal, entries };
}

async function withEntries(
  repository: PlanningRepository,
  ownerId: string,
  month: string,
  includeDeleted: boolean,
  goals: GoalRecord[],
): Promise<GoalResource[]> {
  const entriesByGoal = new Map<string, GoalEntry[]>();
  for (const entry of await repository.listEntriesForPlan(ownerId, month, includeDeleted)) {
    const entries = entriesByGoal.get(entry.goalId) ?? [];
    entries.push(entry);
    entriesByGoal.set(entry.goalId, entries);
  }

  return goals.map((goal) => toResource(goal, entriesByGoal.get(goal.id) ?? []));
}

export function calculateMet(tracking: GoalTracking, value: boolean | number | string): boolean {
  switch (tracking.type) {
    case "check":
      return value === true;
    case "quantity":
      if (typeof value !== "number") return false;
      if (tracking.comparison === "atLeast") return value >= tracking.targetValue;
      if (tracking.comparison === "atMost") return value <= tracking.targetValue;
      return value === tracking.targetValue;
    case "scale":
      return typeof value === "number" && value >= tracking.min && value <= tracking.max;
    case "time": {
      if (typeof value !== "string") return false;
      if (!tracking.targetStart || !tracking.targetEnd) return true;
      const valueMinutes = parseTime(value);
      const start = parseTime(tracking.targetStart);
      const end = parseTime(tracking.targetEnd);
      return start <= end
        ? valueMinutes >= start && valueMinutes <= end
        : valueMinutes >= start || valueMinutes <= end;
    }
  }
}

function validateEntry(
  tracking: GoalTracking,
  input: GoalEntryInput,
): { value: boolean | number | string; note: string | null; met: boolean } {
  if (input.note !== undefined && (typeof input.note !== "string" || input.note.length > 1_000)) {
    throw new EntryValueInvalidError();
  }
  const note = input.note ?? null;
  if (tracking.type === "check") {
    if (
      !("completed" in input) ||
      Object.keys(input).some((key) => key !== "completed" && key !== "note")
    ) {
      throw new EntryValueInvalidError();
    }
    const value = input.completed;
    return { value, note, met: calculateMet(tracking, value) };
  }
  if (!("value" in input) || Object.keys(input).some((key) => key !== "value" && key !== "note")) {
    throw new EntryValueInvalidError();
  }
  const value = input.value;
  if (tracking.type === "quantity") {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new EntryValueInvalidError();
  } else if (tracking.type === "scale") {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < tracking.min ||
      value > tracking.max
    ) {
      throw new EntryValueInvalidError();
    }
  } else if (tracking.type === "time") {
    if (typeof value !== "string" || !TIME_PATTERN.test(value)) throw new EntryValueInvalidError();
  }
  return { value, note, met: calculateMet(tracking, value) };
}

export class CreateGoal {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(
    input: GoalCreateInput & { month: string; now: number; ownerId: string },
  ): Promise<GoalRecord> {
    if (!validMonth(input.month)) throw new GoalCadenceInvalidError();
    const tracking = validateTracking(input.tracking);
    const cadence = validateCadence(input.cadence, input.month);
    return this.repository.createGoal({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      month: input.month,
      title: normalizeTitle(input.title),
      description: normalizeDescription(input.description),
      tracking,
      cadence,
      deletedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }
}

export class ListPlan {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(ownerId: string, month: string): Promise<GoalResource[]> {
    if (!validMonth(month)) throw new GoalCadenceInvalidError();
    return withEntries(
      this.repository,
      ownerId,
      month,
      false,
      await this.repository.listGoals(ownerId, month, false),
    );
  }
}

export class ListTrash {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(ownerId: string, month: string): Promise<GoalResource[]> {
    if (!validMonth(month)) throw new GoalCadenceInvalidError();
    return withEntries(
      this.repository,
      ownerId,
      month,
      true,
      await this.repository.listGoals(ownerId, month, true),
    );
  }
}

export class UpdateGoal {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(
    input: GoalPatchInput & { goalId: string; now: number; ownerId: string },
  ): Promise<GoalRecord> {
    const goal = requireGoal(
      await this.repository.findOwnedActiveGoal(input.goalId, input.ownerId),
    );
    const changes: GoalUpdate = { updatedAt: input.now };
    if (input.tracking !== undefined) {
      const tracking = validateTracking(input.tracking);
      if (tracking.type !== goal.tracking.type) throw new GoalTypeImmutableError();
      changes.tracking = tracking;
    }
    if (input.cadence !== undefined) {
      changes.cadence = validateCadence(input.cadence, goal.month);
    }
    if (input.title !== undefined) changes.title = normalizeTitle(input.title);
    if (input.description !== undefined) {
      changes.description = normalizeDescription(input.description);
    }
    const updated = await this.repository.updateOwnedGoal(input.goalId, input.ownerId, changes);
    return requireGoal(updated);
  }
}

export class DeleteGoal {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(ownerId: string, goalId: string, now: number): Promise<void> {
    if (!(await this.repository.softDeleteOwnedGoal(goalId, ownerId, now))) {
      throw new GoalNotFoundError();
    }
  }
}

export class RestoreGoal {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(ownerId: string, goalId: string, now: number): Promise<void> {
    if (!(await this.repository.restoreOwnedGoal(goalId, ownerId, now))) {
      throw new GoalNotFoundError();
    }
  }
}

export class UpsertGoalEntry {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(input: {
    date: string;
    goalId: string;
    now: number;
    ownerId: string;
    value: GoalEntryInput;
  }): Promise<GoalEntry> {
    const goal = requireGoal(
      await this.repository.findOwnedActiveGoal(input.goalId, input.ownerId),
    );
    if (!validDate(input.date) || !input.date.startsWith(goal.month))
      throw new EntryDateInvalidError();
    if (input.date > localToday(input.now)) throw new EntryDateFutureError();
    const checked = validateEntry(goal.tracking, input.value);
    const stored: StoredEntry = {
      goalId: input.goalId,
      date: input.date,
      value: checked.value,
      met: checked.met,
      note: checked.note,
      createdAt: input.now,
      updatedAt: input.now,
    };
    const existing = (await this.repository.listEntries(input.goalId)).find(
      (entry) => entry.date === input.date,
    );
    if (existing) stored.createdAt = existing.createdAt;
    const result = await this.repository.upsertEntry(stored);
    return result;
  }
}

export class DeleteGoalEntry {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(ownerId: string, goalId: string, date: string, now: number): Promise<void> {
    const goal = requireGoal(await this.repository.findOwnedActiveGoal(goalId, ownerId));
    if (!validDate(date) || !date.startsWith(goal.month)) throw new EntryDateInvalidError();
    if (date > localToday(now)) throw new EntryDateFutureError();
    if (!(await this.repository.deleteEntry(goalId, date))) throw new EntryNotFoundError();
  }
}

export function isRepeatingCadence(cadence: GoalCadence): cadence is RepeatingCadence {
  return cadence.period === "week" || cadence.period === "month";
}

export function isTimeTracking(tracking: GoalTracking): tracking is TimeTracking {
  return tracking.type === "time";
}
