import { z } from "@hono/zod-openapi";

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

const checkTrackingSchema = z.object({ type: z.literal("check") }).strict();
const quantityTrackingSchema = z
  .object({
    type: z.literal("quantity"),
    unit: z.string().trim().max(64).optional(),
    targetValue: z.number().finite(),
    comparison: z.enum(["atLeast", "atMost", "equal"]),
  })
  .strict();
const scaleTrackingSchema = z
  .object({
    type: z.literal("scale"),
    min: z.number().int(),
    max: z.number().int(),
  })
  .strict()
  .refine((tracking) => tracking.min < tracking.max, "Scale min must be below max");
const timeTrackingSchema = z
  .object({
    type: z.literal("time"),
    targetStart: z.string().regex(timePattern).optional(),
    targetEnd: z.string().regex(timePattern).optional(),
  })
  .strict();
export const trackingSchema = z.discriminatedUnion("type", [
  checkTrackingSchema,
  quantityTrackingSchema,
  scaleTrackingSchema,
  timeTrackingSchema,
]);

const dailyCadenceSchema = z.object({ period: z.literal("day") }).strict();
const weeklyCadenceSchema = z
  .object({
    period: z.literal("week"),
    targetOccurrences: z.number().int().min(1).max(7),
  })
  .strict();
const monthlyCadenceSchema = z
  .object({
    period: z.literal("month"),
    targetOccurrences: z.number().int().min(1).max(31),
  })
  .strict();
export const cadenceSchema = z.discriminatedUnion("period", [
  dailyCadenceSchema,
  weeklyCadenceSchema,
  monthlyCadenceSchema,
]);

export const entrySchema = z.object({
  date: z.string(),
  value: z.union([z.boolean(), z.number(), z.string()]),
  met: z.boolean(),
  note: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export const goalSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  month: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  tracking: trackingSchema,
  cadence: cadenceSchema,
  deletedAt: z.number().int().nonnegative().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  entries: z.array(entrySchema),
});
