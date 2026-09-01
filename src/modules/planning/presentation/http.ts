import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { WorkerHttpEnv } from "../../../platform/http/environment";
import { problem } from "../../../platform/http/problem-details";
import { problemDetailsSchema } from "../../../platform/http/problem-details-schema";
import { ApplicationError } from "../../../shared/application/application-error";
import type { IdentityContextVariables } from "../../identity-access/public-contracts";
import type { PlanningRepository } from "../application/ports";
import {
  CreateGoal,
  DeleteGoal,
  DeleteGoalEntry,
  ListPlan,
  ListTrash,
  RestoreGoal,
  UpdateGoal,
  UpsertGoalEntry,
} from "../application/use-cases";
import { mapPlanningError, planningResourceNotFoundProblemSchema } from "./problems";

type PlanningHttpEnv = WorkerHttpEnv<IdentityContextVariables>;

export type PlanningHttpDependencies = {
  createRepository(database: D1Database): PlanningRepository;
};

const monthPattern = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const datePattern = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
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
  .strict()
  .refine(
    (tracking) => Boolean(tracking.targetStart) === Boolean(tracking.targetEnd),
    "Time target bounds must be provided together",
  );
const trackingSchema = z.discriminatedUnion("type", [
  checkTrackingSchema,
  quantityTrackingSchema,
  scaleTrackingSchema,
  timeTrackingSchema,
]);

const dailyCadenceSchema = z.object({ period: z.literal("day") }).strict();
const repeatingCadenceSchema = z
  .object({
    period: z.enum(["week", "month"]),
    targetOccurrences: z.number().int().min(1).max(31),
  })
  .strict();
const cadenceSchema = z.union([dailyCadenceSchema, repeatingCadenceSchema]);

const goalInputSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().max(2_000).optional(),
    tracking: trackingSchema,
    cadence: cadenceSchema,
  })
  .strict();
const goalPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().max(2_000).nullable().optional(),
    tracking: trackingSchema.optional(),
    cadence: cadenceSchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, "At least one goal field is required");

const entryInputSchema = z.union([
  z.object({ completed: z.boolean(), note: z.string().max(1_000).optional() }).strict(),
  z.object({ value: z.number().finite(), note: z.string().max(1_000).optional() }).strict(),
  z.object({ value: z.string(), note: z.string().max(1_000).optional() }).strict(),
]);

const monthParams = z.object({
  month: z
    .string()
    .regex(monthPattern)
    .openapi({ param: { name: "month", in: "path" } }),
});
const goalParams = z.object({
  goalId: z.uuid().openapi({ param: { name: "goalId", in: "path" } }),
});
const entryParams = z.object({
  goalId: z.uuid().openapi({ param: { name: "goalId", in: "path" } }),
  date: z
    .string()
    .regex(datePattern)
    .openapi({ param: { name: "date", in: "path" } }),
});

const entrySchema = z.object({
  date: z.string(),
  value: z.union([z.boolean(), z.number(), z.string()]),
  met: z.boolean(),
  note: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
const goalSchema = z.object({
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

const standardErrors = {
  400: {
    description: "Request validation failed",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  401: {
    description: "Authentication required",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  500: {
    description: "Unexpected server failure",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
} as const;
const unsafeErrors = {
  403: {
    description: "Untrusted Origin",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
} as const;
const conflictErrors = {
  409: {
    description: "The goal tracking type cannot be changed",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
} as const;
const jsonErrors = {
  413: {
    description: "Request body is too large",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  415: {
    description: "JSON Content-Type is required",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
} as const;
const goalNotFoundError = {
  404: {
    description: "Goal not found or authentication feature disabled",
    content: { "application/problem+json": { schema: planningResourceNotFoundProblemSchema } },
  },
} as const;

const listPlanRoute = createRoute({
  method: "get",
  path: "/api/plans/{month}",
  tags: ["Planning"],
  security: [{ sessionCookie: [] }],
  request: { params: monthParams },
  responses: {
    200: {
      description: "Active goals and entries for a virtual month",
      content: {
        "application/json": { schema: z.object({ month: z.string(), goals: z.array(goalSchema) }) },
      },
    },
    ...standardErrors,
    ...goalNotFoundError,
  },
});
const listTrashRoute = createRoute({
  method: "get",
  path: "/api/plans/{month}/trash",
  tags: ["Planning"],
  security: [{ sessionCookie: [] }],
  request: { params: monthParams },
  responses: {
    200: {
      description: "Deleted goals and entries for a virtual month",
      content: {
        "application/json": { schema: z.object({ month: z.string(), goals: z.array(goalSchema) }) },
      },
    },
    ...standardErrors,
    ...goalNotFoundError,
  },
});
const createGoalRoute = createRoute({
  method: "post",
  path: "/api/plans/{month}/goals",
  tags: ["Planning"],
  security: [{ sessionCookie: [] }],
  request: {
    params: monthParams,
    body: { required: true, content: { "application/json": { schema: goalInputSchema } } },
  },
  responses: {
    201: {
      description: "Created goal",
      content: { "application/json": { schema: z.object({ goal: goalSchema }) } },
    },
    ...standardErrors,
    ...goalNotFoundError,
    ...unsafeErrors,
    ...jsonErrors,
  },
});
const updateGoalRoute = createRoute({
  method: "patch",
  path: "/api/goals/{goalId}",
  tags: ["Planning"],
  security: [{ sessionCookie: [] }],
  request: {
    params: goalParams,
    body: { required: true, content: { "application/json": { schema: goalPatchSchema } } },
  },
  responses: {
    200: {
      description: "Updated goal",
      content: { "application/json": { schema: z.object({ goal: goalSchema }) } },
    },
    ...standardErrors,
    ...goalNotFoundError,
    ...unsafeErrors,
    ...jsonErrors,
    ...conflictErrors,
  },
});
const deleteGoalRoute = createRoute({
  method: "delete",
  path: "/api/goals/{goalId}",
  tags: ["Planning"],
  security: [{ sessionCookie: [] }],
  request: { params: goalParams },
  responses: {
    204: { description: "Goal moved to trash" },
    ...standardErrors,
    ...goalNotFoundError,
    ...unsafeErrors,
  },
});
const restoreGoalRoute = createRoute({
  method: "post",
  path: "/api/goals/{goalId}/restore",
  tags: ["Planning"],
  security: [{ sessionCookie: [] }],
  request: { params: goalParams },
  responses: {
    204: { description: "Goal restored from trash" },
    ...standardErrors,
    ...goalNotFoundError,
    ...unsafeErrors,
  },
});
const putEntryRoute = createRoute({
  method: "put",
  path: "/api/goals/{goalId}/entries/{date}",
  tags: ["Planning"],
  security: [{ sessionCookie: [] }],
  request: {
    params: entryParams,
    body: { required: true, content: { "application/json": { schema: entryInputSchema } } },
  },
  responses: {
    200: {
      description: "Entry replaced",
      content: { "application/json": { schema: z.object({ entry: entrySchema }) } },
    },
    ...standardErrors,
    ...goalNotFoundError,
    ...unsafeErrors,
    ...jsonErrors,
  },
});
const deleteEntryRoute = createRoute({
  method: "delete",
  path: "/api/goals/{goalId}/entries/{date}",
  tags: ["Planning"],
  security: [{ sessionCookie: [] }],
  request: { params: entryParams },
  responses: {
    204: { description: "Entry removed" },
    ...standardErrors,
    ...goalNotFoundError,
    ...unsafeErrors,
  },
});

function authenticatedOwnerId(c: {
  get(name: "authenticatedUser"): IdentityContextVariables["authenticatedUser"];
}): string {
  const user = c.get("authenticatedUser");
  if (!user) throw new ApplicationError("UNAUTHENTICATED", "A valid session is required.");
  return user.id;
}

const requirePlanningJson: MiddlewareHandler<PlanningHttpEnv> = async (c, next) => {
  const isCreate = c.req.method === "POST" && new URL(c.req.url).pathname.endsWith("/goals");
  const needsJson = isCreate || c.req.method === "PATCH" || c.req.method === "PUT";
  if (!needsJson) {
    await next();
    return;
  }
  if (
    !/^application\/(?:[a-z0-9.!#$&^_-]+\+)?json(?:\s*;|$)/iu.test(
      c.req.header("Content-Type") ?? "",
    )
  ) {
    c.res = problem(c, {
      code: "UNSUPPORTED_MEDIA_TYPE",
      type: "https://free-hosting-starter.dev/problems/unsupported-media-type",
      title: "Unsupported media type",
      status: 415,
      detail: "This endpoint requires an application/json request body.",
    });
    return;
  }
  await next();
};

const limitPlanningBody = bodyLimit({
  maxSize: 64 * 1024,
  onError: (c) =>
    problem(c, {
      code: "PAYLOAD_TOO_LARGE",
      type: "https://free-hosting-starter.dev/problems/content-too-large",
      title: "Content too large",
      status: 413,
      detail: "The request body exceeds the accepted size.",
    }),
});

export function createPlanningHttp(
  dependencies: PlanningHttpDependencies,
): OpenAPIHono<PlanningHttpEnv> {
  const router = new OpenAPIHono<PlanningHttpEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return problem(c, {
          code: "VALIDATION_FAILED",
          type: "https://free-hosting-starter.dev/problems/validation-error",
          title: "Validation failed",
          status: 400,
          detail: "The request does not match the API contract.",
        });
      }
    },
  });
  router.onError((error, c) => {
    const mapped = mapPlanningError(error);
    if (!mapped) throw error;
    return problem(c, mapped);
  });
  router.use("/api/plans", requirePlanningJson);
  router.use("/api/plans/*", requirePlanningJson);
  router.use("/api/goals", requirePlanningJson);
  router.use("/api/goals/*", requirePlanningJson);
  router.use("/api/plans", limitPlanningBody);
  router.use("/api/plans/*", limitPlanningBody);
  router.use("/api/goals", limitPlanningBody);
  router.use("/api/goals/*", limitPlanningBody);

  router.openapi(listPlanRoute, async (c) => {
    const month = c.req.valid("param").month;
    const goals = await new ListPlan(dependencies.createRepository(c.env.DB)).execute(
      authenticatedOwnerId(c),
      month,
    );
    return c.json({ month, goals }, 200);
  });
  router.openapi(listTrashRoute, async (c) => {
    const month = c.req.valid("param").month;
    const goals = await new ListTrash(dependencies.createRepository(c.env.DB)).execute(
      authenticatedOwnerId(c),
      month,
    );
    return c.json({ month, goals }, 200);
  });
  router.openapi(createGoalRoute, async (c) => {
    const goal = await new CreateGoal(dependencies.createRepository(c.env.DB)).execute({
      ...c.req.valid("json"),
      month: c.req.valid("param").month,
      now: Date.now(),
      ownerId: authenticatedOwnerId(c),
    });
    return c.json({ goal: { ...goal, entries: [] } }, 201);
  });
  router.openapi(updateGoalRoute, async (c) => {
    const goal = await new UpdateGoal(dependencies.createRepository(c.env.DB)).execute({
      ...c.req.valid("json"),
      goalId: c.req.valid("param").goalId,
      now: Date.now(),
      ownerId: authenticatedOwnerId(c),
    });
    const entries = await dependencies.createRepository(c.env.DB).listEntries(goal.id);
    return c.json({ goal: { ...goal, entries } }, 200);
  });
  router.openapi(deleteGoalRoute, async (c) => {
    await new DeleteGoal(dependencies.createRepository(c.env.DB)).execute(
      authenticatedOwnerId(c),
      c.req.valid("param").goalId,
      Date.now(),
    );
    return c.body(null, 204);
  });
  router.openapi(restoreGoalRoute, async (c) => {
    await new RestoreGoal(dependencies.createRepository(c.env.DB)).execute(
      authenticatedOwnerId(c),
      c.req.valid("param").goalId,
      Date.now(),
    );
    return c.body(null, 204);
  });
  router.openapi(putEntryRoute, async (c) => {
    const entry = await new UpsertGoalEntry(dependencies.createRepository(c.env.DB)).execute({
      date: c.req.valid("param").date,
      goalId: c.req.valid("param").goalId,
      now: Date.now(),
      ownerId: authenticatedOwnerId(c),
      value: c.req.valid("json"),
    });
    return c.json({ entry }, 200);
  });
  router.openapi(deleteEntryRoute, async (c) => {
    await new DeleteGoalEntry(dependencies.createRepository(c.env.DB)).execute(
      authenticatedOwnerId(c),
      c.req.valid("param").goalId,
      c.req.valid("param").date,
      Date.now(),
    );
    return c.body(null, 204);
  });
  return router;
}
