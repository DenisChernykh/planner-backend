import { z } from "@hono/zod-openapi";
import type { ProblemInput } from "../../../platform/http/problem-details";
import { problemDetailsSchema } from "../../../platform/http/problem-details-schema";
import { PlanningError, type PlanningErrorCode } from "../domain/errors";

const PLANNING_PROBLEMS = {
  GOAL_NOT_FOUND: {
    code: "GOAL_NOT_FOUND",
    detail: "The goal was not found.",
    status: 404,
    title: "Goal not found",
    type: "urn:planner:problem:goal-not-found",
  },
  GOAL_TITLE_INVALID: {
    code: "GOAL_TITLE_INVALID",
    detail: "Goal title must contain 1 to 160 characters.",
    status: 400,
    title: "Goal title is invalid",
    type: "urn:planner:problem:goal-title-invalid",
  },
  GOAL_DESCRIPTION_INVALID: {
    code: "GOAL_DESCRIPTION_INVALID",
    detail: "Goal description must not exceed 2000 characters.",
    status: 400,
    title: "Goal description is invalid",
    type: "urn:planner:problem:goal-description-invalid",
  },
  GOAL_TRACKING_INVALID: {
    code: "GOAL_TRACKING_INVALID",
    detail: "The goal tracking definition is invalid.",
    status: 400,
    title: "Goal tracking is invalid",
    type: "urn:planner:problem:goal-tracking-invalid",
  },
  GOAL_CADENCE_INVALID: {
    code: "GOAL_CADENCE_INVALID",
    detail: "The goal cadence definition is invalid.",
    status: 400,
    title: "Goal cadence is invalid",
    type: "urn:planner:problem:goal-cadence-invalid",
  },
  GOAL_TYPE_IMMUTABLE: {
    code: "GOAL_TYPE_IMMUTABLE",
    detail: "A goal tracking type cannot be changed after creation.",
    status: 409,
    title: "Goal tracking type cannot change",
    type: "urn:planner:problem:goal-type-immutable",
  },
  ENTRY_DATE_INVALID: {
    code: "ENTRY_DATE_INVALID",
    detail: "The entry date must belong to the goal month.",
    status: 400,
    title: "Entry date is invalid",
    type: "urn:planner:problem:entry-date-invalid",
  },
  ENTRY_DATE_FUTURE: {
    code: "ENTRY_DATE_FUTURE",
    detail: "Entries cannot be recorded for a future date.",
    status: 400,
    title: "Entry date is in the future",
    type: "urn:planner:problem:entry-date-future",
  },
  ENTRY_VALUE_INVALID: {
    code: "ENTRY_VALUE_INVALID",
    detail: "The entry value does not match the goal tracking definition.",
    status: 400,
    title: "Entry value is invalid",
    type: "urn:planner:problem:entry-value-invalid",
  },
  ENTRY_NOT_FOUND: {
    code: "ENTRY_NOT_FOUND",
    detail: "The goal entry was not found.",
    status: 404,
    title: "Entry not found",
    type: "urn:planner:problem:entry-not-found",
  },
  GOAL_ORDER_MISMATCH: {
    code: "GOAL_ORDER_MISMATCH",
    detail: "The submitted goal order does not match the active goals in this group.",
    status: 409,
    title: "Goal order does not match",
    type: "urn:planner:problem:goal-order-mismatch",
  },
} as const satisfies Record<PlanningErrorCode, ProblemInput>;

const featureDisabledProblem = {
  code: "NOT_FOUND",
  detail: "The requested resource was not found.",
  status: 404,
  title: "Not found",
  type: "urn:planner:problem:not-found",
} as const satisfies ProblemInput;

const entryNotFoundProblem = PLANNING_PROBLEMS.ENTRY_NOT_FOUND;

export function mapPlanningError(error: unknown): ProblemInput | undefined {
  if (!(error instanceof PlanningError)) return undefined;
  return PLANNING_PROBLEMS[error.code];
}

export const planningNotFoundProblemSchema = problemDetailsSchema
  .extend({
    type: z.literal(PLANNING_PROBLEMS.GOAL_NOT_FOUND.type),
    title: z.literal(PLANNING_PROBLEMS.GOAL_NOT_FOUND.title),
    status: z.literal(PLANNING_PROBLEMS.GOAL_NOT_FOUND.status),
    detail: z.literal(PLANNING_PROBLEMS.GOAL_NOT_FOUND.detail),
    code: z.literal(PLANNING_PROBLEMS.GOAL_NOT_FOUND.code),
  })
  .openapi("PlanningGoalNotFoundProblemDetails");

const entryNotFoundProblemSchema = problemDetailsSchema
  .extend({
    type: z.literal(entryNotFoundProblem.type),
    title: z.literal(entryNotFoundProblem.title),
    status: z.literal(entryNotFoundProblem.status),
    detail: z.literal(entryNotFoundProblem.detail),
    code: z.literal(entryNotFoundProblem.code),
  })
  .openapi("PlanningEntryNotFoundProblemDetails");

const featureDisabledProblemSchema = problemDetailsSchema
  .extend({
    type: z.literal(featureDisabledProblem.type),
    title: z.literal(featureDisabledProblem.title),
    status: z.literal(featureDisabledProblem.status),
    detail: z.literal(featureDisabledProblem.detail),
    code: z.literal(featureDisabledProblem.code),
  })
  .openapi("PlanningFeatureDisabledProblemDetails");

export const planningResourceNotFoundProblemSchema = z
  .union([planningNotFoundProblemSchema, entryNotFoundProblemSchema, featureDisabledProblemSchema])
  .openapi("PlanningResourceNotFoundProblemDetails");
