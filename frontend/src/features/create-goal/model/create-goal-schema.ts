import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";

import { type PostApiPlansMonthGoalsBody, postApiPlansMonthGoalsBodySchema } from "@/shared/api";
import { getPlannerMonthDays } from "@/shared/lib/planner-month";

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

const formFieldsSchema = z.object({
  title: z.string(),
  description: z.string().max(2_000, "Описание должно быть короче 2000 символов"),
  trackingType: z.enum(["check", "quantity", "scale", "time"]),
  comparison: z.enum(["atLeast", "atMost", "equal"]),
  targetValue: z.string(),
  unit: z.string(),
  scaleMin: z.string(),
  scaleMax: z.string(),
  targetStart: z.string(),
  targetEnd: z.string(),
  cadencePeriod: z.enum(["day", "week", "month"]),
  targetOccurrences: z.string(),
});

export const createGoalDefaultValues: z.input<typeof formFieldsSchema> = {
  title: "",
  description: "",
  trackingType: "check",
  comparison: "atLeast",
  targetValue: "",
  unit: "",
  scaleMin: "",
  scaleMax: "",
  targetStart: "",
  targetEnd: "",
  cadencePeriod: "day",
  targetOccurrences: "",
};

function addIssue(ctx: z.RefinementCtx, path: string, message: string) {
  ctx.addIssue({ code: "custom", path: [path], message });
}

function optionalValue(value: string): string | undefined {
  const normalized = value.trim();
  if (normalized === "") return undefined;
  return normalized;
}

function toPayload(value: z.output<typeof formFieldsSchema>): PostApiPlansMonthGoalsBody {
  let tracking: PostApiPlansMonthGoalsBody["tracking"];
  switch (value.trackingType) {
    case "check":
      tracking = { type: "check" };
      break;
    case "quantity": {
      tracking = {
        type: "quantity",
        comparison: value.comparison,
        targetValue: Number(value.targetValue),
      };
      const unit = optionalValue(value.unit);
      if (unit !== undefined) tracking.unit = unit;
      break;
    }
    case "scale":
      tracking = { type: "scale", min: Number(value.scaleMin), max: Number(value.scaleMax) };
      break;
    case "time": {
      tracking = { type: "time" };
      const targetStart = optionalValue(value.targetStart);
      const targetEnd = optionalValue(value.targetEnd);
      if (targetStart !== undefined) tracking.targetStart = targetStart;
      if (targetEnd !== undefined) tracking.targetEnd = targetEnd;
      break;
    }
  }

  const cadence: PostApiPlansMonthGoalsBody["cadence"] =
    value.cadencePeriod === "day"
      ? { period: "day" }
      : { period: value.cadencePeriod, targetOccurrences: Number(value.targetOccurrences) };
  const payload: PostApiPlansMonthGoalsBody = { title: value.title.trim(), tracking, cadence };
  if (value.description.trim() !== "") payload.description = value.description;
  return payload;
}

export function createGoalFormSchema(month: string) {
  const monthDays = getPlannerMonthDays(month);

  return formFieldsSchema
    .superRefine((value, ctx) => {
      const title = value.title.trim();
      if (title === "") addIssue(ctx, "title", "Введите название цели");
      if (title.length > 160) addIssue(ctx, "title", "Название должно быть короче 160 символов");

      if (value.trackingType === "quantity") {
        if (value.targetValue.trim() === "" || !Number.isFinite(Number(value.targetValue))) {
          addIssue(ctx, "targetValue", "Введите конечное число");
        }
        if (value.unit.trim().length > 64) addIssue(ctx, "unit", "Не больше 64 символов");
      }

      if (value.trackingType === "scale") {
        const min = Number(value.scaleMin);
        const max = Number(value.scaleMax);
        if (value.scaleMin.trim() === "" || !Number.isInteger(min)) {
          addIssue(ctx, "scaleMin", "Введите целое число");
        }
        if (value.scaleMax.trim() === "" || !Number.isInteger(max)) {
          addIssue(ctx, "scaleMax", "Введите целое число");
        } else if (Number.isInteger(min) && min >= max) {
          addIssue(ctx, "scaleMax", "Максимум должен быть больше минимума");
        }
      }

      if (value.trackingType === "time") {
        const targetStart = optionalValue(value.targetStart);
        const targetEnd = optionalValue(value.targetEnd);
        if (targetStart !== undefined && !TIME_PATTERN.test(targetStart)) {
          addIssue(ctx, "targetStart", "Используйте формат ЧЧ:ММ");
        }
        if (targetEnd !== undefined && !TIME_PATTERN.test(targetEnd)) {
          addIssue(ctx, "targetEnd", "Используйте формат ЧЧ:ММ");
        }
      }

      if (value.cadencePeriod !== "day") {
        const occurrences = Number(value.targetOccurrences);
        const limit = value.cadencePeriod === "week" ? 7 : monthDays;
        if (!Number.isInteger(occurrences) || occurrences < 1 || occurrences > limit) {
          addIssue(ctx, "targetOccurrences", `Введите целое число от 1 до ${limit}`);
        }
      }
    })
    .transform(toPayload)
    .pipe(postApiPlansMonthGoalsBodySchema);
}

export type CreateGoalFormInput = z.input<ReturnType<typeof createGoalFormSchema>>;
export type CreateGoalFormOutput = z.output<ReturnType<typeof createGoalFormSchema>>;
export type CreateGoalFormApi = UseFormReturn<CreateGoalFormInput, unknown, CreateGoalFormOutput>;
