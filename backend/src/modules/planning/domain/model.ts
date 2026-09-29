export type CheckTracking = { type: "check" };

export type QuantityTracking = {
  type: "quantity";
  unit?: string;
  targetValue: number;
  comparison: "atLeast" | "atMost" | "equal";
};

export type ScaleTracking = {
  type: "scale";
  min: number;
  max: number;
};

export type TimeTracking = {
  type: "time";
  targetStart?: string;
  targetEnd?: string;
};

export type GoalTracking = CheckTracking | QuantityTracking | ScaleTracking | TimeTracking;

export type DailyCadence = { period: "day" };
export type RepeatingCadence = {
  period: "week" | "month";
  targetOccurrences: number;
};
export type GoalCadence = DailyCadence | RepeatingCadence;

export type GoalRecord = {
  id: string;
  ownerId: string;
  month: string;
  title: string;
  description: string | null;
  tracking: GoalTracking;
  cadence: GoalCadence;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type GoalEntryValue = boolean | number | string;

export type GoalEntry = {
  date: string;
  value: GoalEntryValue;
  met: boolean;
  note: string | null;
  createdAt: number;
  updatedAt: number;
};

export type GoalResource = GoalRecord & { entries: GoalEntry[] };

export type GoalOrderCadence = GoalCadence["period"];

export type GoalCreateInput = {
  title: string;
  description?: string;
  tracking: GoalTracking;
  cadence: GoalCadence;
};

export type GoalPatchInput = {
  title?: string;
  description?: string | null;
  tracking?: GoalTracking;
  cadence?: GoalCadence;
};

export type GoalEntryInput =
  | { completed: boolean; note?: string }
  | { value: number; note?: string }
  | { value: string; note?: string };

export type StoredGoalEntry = GoalEntry & { goalId: string };
