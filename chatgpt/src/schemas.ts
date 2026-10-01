import { z } from "zod";

export const month = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u);
export const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);
const tracking = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("check") }),
  z.strictObject({
    type: z.literal("quantity"),
    unit: z.string().trim().max(64).optional(),
    targetValue: z.number(),
    comparison: z.enum(["atLeast", "atMost", "equal"]),
  }),
  z
    .strictObject({ type: z.literal("scale"), min: z.int(), max: z.int() })
    .refine((value) => value.min < value.max),
  z.strictObject({
    type: z.literal("time"),
    targetStart: time.optional(),
    targetEnd: time.optional(),
  }),
]);
const cadence = z.discriminatedUnion("period", [
  z.strictObject({ period: z.literal("day") }),
  z.strictObject({ period: z.literal("week"), targetOccurrences: z.int().min(1).max(7) }),
  z.strictObject({ period: z.literal("month"), targetOccurrences: z.int().min(1).max(31) }),
]);
const goalFields = {
  title: z.string().trim().min(1).max(160),
  description: z.string().max(2_000).optional(),
  tracking,
  cadence,
};
export const goalInput = z.strictObject(goalFields);
export const goalPatch = z
  .strictObject({
    ...goalInput.partial().shape,
    description: z.string().max(2_000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const note = z.string().max(1_000).optional();
export const entryInput = z.union([
  z.strictObject({ completed: z.boolean(), note }),
  z.strictObject({ value: z.number(), note }),
  z.strictObject({ value: time, note }),
]);
export const goalIdInput = z.strictObject({ goalId: z.uuid() });
export const entryIdInput = goalIdInput.extend({ date: z.iso.date() });
export const getPlanInput = z.strictObject({ month });
export const createGoalInput = getPlanInput.extend({ input: goalInput });
export const recordEntryInput = entryIdInput.extend({ entry: entryInput });
export const accountResponse = z.object({
  user: z.object({
    id: z.uuid(),
    displayName: z.string().nullable(),
    username: z.string().nullable(),
    photoUrl: z.string().nullable(),
  }),
});
export const entry = z.object({
  date: z.iso.date(),
  value: z.union([z.boolean(), z.number(), time]),
  met: z.boolean(),
  note: z.string().nullable(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});
export const goal = z.object({
  id: z.uuid(),
  month,
  title: z.string(),
  description: z.string().nullable(),
  tracking,
  cadence,
  entries: z.array(entry),
  ownerId: z.uuid().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  deletedAt: z.number().nullable().optional(),
});
export const planResponse = z.object({ month, today: z.iso.date(), goals: z.array(goal) });
export const getPlanOutput = planResponse.extend({ accountId: z.uuid() });
export const createGoalOutput = z.object({ goal });
export const recordEntryOutput = z.object({ entry });
export const success = z.object({ success: z.literal(true) });
export const reminderSettingsInput = z.strictObject({
  enabled: z.boolean(),
  timeZone: z.string().min(1).max(80),
  quietStart: time,
  quietEnd: time,
  eveningTime: time,
});
export const reminderRuleInput = z.strictObject({
  mode: z.enum(["off", "scheduled", "evening"]),
  time,
  weekdays: z.array(z.int().min(1).max(7)).min(1).max(7),
});
export const settingsResponse = z.object({
  settings: reminderSettingsInput.passthrough(),
  connection: z.string(),
  botAvailable: z.boolean(),
  deliveryIssues: z.number(),
});
export const reminderRule = reminderRuleInput.extend({
  goalId: z.uuid(),
  nextRunAt: z.number().nullable(),
});
