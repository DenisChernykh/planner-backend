import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { WorkerHttpEnv } from "../../../platform/http/environment";
import { problem } from "../../../platform/http/problem-details";
import { problemDetailsSchema } from "../../../platform/http/problem-details-schema";
import { ApplicationError } from "../../../shared/application/application-error";
import {
  ACCOUNT_API_SECURITY,
  type IdentityContextVariables,
} from "../../identity-access/public-contracts";
import type { AdjustGoalEntryUseCase } from "../application/entries/adjust-goal-entry.use-case";
import type { DeleteGoalEntryUseCase } from "../application/entries/delete-goal-entry.use-case";
import type { UpsertGoalEntryUseCase } from "../application/entries/upsert-goal-entry.use-case";
import type { CreateGoalUseCase } from "../application/goals/create-goal.use-case";
import type { DeleteGoalUseCase } from "../application/goals/delete-goal.use-case";
import type { ReorderGoalsUseCase } from "../application/goals/reorder-goals.use-case";
import type { RestoreGoalUseCase } from "../application/goals/restore-goal.use-case";
import type { UpdateGoalUseCase } from "../application/goals/update-goal.use-case";
import type { GetPlanQuery } from "../application/plans/get-plan.query";
import type { ListTrashQuery } from "../application/plans/list-trash.query";
import type { SearchPlanningQuery } from "../application/plans/search-planning.query";
import { mapPlanningError, planningResourceNotFoundProblemSchema } from "./problems";
import { cadenceSchema, entrySchema, goalSchema, trackingSchema } from "./resource-schemas";
import { registerSearchRoutes } from "./search-http";

type PlanningHttpEnv = WorkerHttpEnv<IdentityContextVariables>;

export type PlanningHttpDependencies = {
  prepareCurrentPlan(
    database: D1Database,
    input: { ownerId: string; month: string; now: number },
  ): Promise<void>;
  getTimeZone(database: D1Database, ownerId: string): Promise<string>;
  createUseCases(database: D1Database): {
    adjustEntry: AdjustGoalEntryUseCase;
    createGoal: CreateGoalUseCase;
    deleteGoal: DeleteGoalUseCase;
    deleteEntry: DeleteGoalEntryUseCase;
    getPlan: GetPlanQuery;
    listTrash: ListTrashQuery;
    search: SearchPlanningQuery;
    reorderGoals: ReorderGoalsUseCase;
    restoreGoal: RestoreGoalUseCase;
    updateGoal: UpdateGoalUseCase;
    upsertEntry: UpsertGoalEntryUseCase;
  };
};

const monthPattern = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const datePattern = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;

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
  z
    .object({
      completed: z.boolean(),
      note: z.string().max(1_000).optional(),
      expectedRevision: z.string().min(1).nullable(),
    })
    .strict(),
  z
    .object({
      value: z.number().finite(),
      note: z.string().max(1_000).optional(),
      expectedRevision: z.string().min(1).nullable(),
    })
    .strict(),
  z
    .object({
      value: z.string(),
      note: z.string().max(1_000).optional(),
      expectedRevision: z.string().min(1).nullable(),
    })
    .strict(),
]);
const goalOrderSchema = z
  .object({
    cadence: z.enum(["day", "week", "month"]),
    goalIds: z.array(z.uuid()).min(1),
  })
  .strict();

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
const entryConflictErrors = {
  409: {
    description: "The entry changed since it was read; reload before saving or deleting",
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
const goalOrderConflictError = {
  409: {
    description: "The submitted goal order does not match the active goals in this group",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
} as const;

const listPlanRoute = createRoute({
  method: "get",
  path: "/api/plans/{month}",
  tags: ["Planning"],
  security: ACCOUNT_API_SECURITY,
  request: { params: monthParams },
  responses: {
    200: {
      description: "Active goals and entries for a virtual month",
      content: {
        "application/json": {
          schema: z.object({
            month: z.string(),
            today: z.string().regex(datePattern),
            goals: z.array(goalSchema),
          }),
        },
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
  security: ACCOUNT_API_SECURITY,
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
  security: ACCOUNT_API_SECURITY,
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
const reorderGoalsRoute = createRoute({
  method: "put",
  path: "/api/plans/{month}/goals/order",
  tags: ["Planning"],
  security: ACCOUNT_API_SECURITY,
  request: {
    params: monthParams,
    body: { required: true, content: { "application/json": { schema: goalOrderSchema } } },
  },
  responses: {
    204: { description: "Goal order saved" },
    ...standardErrors,
    ...goalNotFoundError,
    ...unsafeErrors,
    ...jsonErrors,
    ...goalOrderConflictError,
  },
});
const updateGoalRoute = createRoute({
  method: "patch",
  path: "/api/goals/{goalId}",
  tags: ["Planning"],
  security: ACCOUNT_API_SECURITY,
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
  security: ACCOUNT_API_SECURITY,
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
  security: ACCOUNT_API_SECURITY,
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
  security: ACCOUNT_API_SECURITY,
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
    ...entryConflictErrors,
  },
});
const deleteEntryRoute = createRoute({
  method: "delete",
  path: "/api/goals/{goalId}/entries/{date}",
  tags: ["Planning"],
  security: ACCOUNT_API_SECURITY,
  request: { params: entryParams, query: z.object({ expectedRevision: z.string().min(1) }) },
  responses: {
    204: { description: "Entry removed" },
    ...standardErrors,
    ...goalNotFoundError,
    ...unsafeErrors,
    ...entryConflictErrors,
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
  const isCreate =
    c.req.method === "POST" && /\/(?:goals|adjust)$/u.test(new URL(c.req.url).pathname);
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
      type: "urn:planner:problem:unsupported-media-type",
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
      type: "urn:planner:problem:content-too-large",
      title: "Content too large",
      status: 413,
      detail: "The request body exceeds the accepted size.",
    }),
});

const adjustEntryRoute = createRoute({
  method: "post",
  path: "/api/goals/{goalId}/entries/{date}/adjust",
  tags: ["Planning"],
  security: ACCOUNT_API_SECURITY,
  request: {
    params: entryParams,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({ delta: z.number().finite(), operationId: z.uuid() }).strict(),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Quantity adjusted once; replay does not apply the delta again",
      content: { "application/json": { schema: z.object({ entry: entrySchema }) } },
    },
    409: {
      description: "The entry changed concurrently; reread before a new operation",
      content: { "application/problem+json": { schema: problemDetailsSchema } },
    },
    ...standardErrors,
    ...goalNotFoundError,
    ...unsafeErrors,
    ...jsonErrors,
  },
});

export function createPlanningHttp(
  dependencies: PlanningHttpDependencies,
): OpenAPIHono<PlanningHttpEnv> {
  const router = new OpenAPIHono<PlanningHttpEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return problem(c, {
          code: "VALIDATION_FAILED",
          type: "urn:planner:problem:validation-error",
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
  registerSearchRoutes(router, dependencies);

  router.openapi(listPlanRoute, async (c) => {
    const ownerId = authenticatedOwnerId(c);
    const month = c.req.valid("param").month;
    const now = Date.now();
    await dependencies.prepareCurrentPlan(c.env.DB, { ownerId, month, now });
    const plan = await dependencies.createUseCases(c.env.DB).getPlan.execute({
      ownerId,
      month,
      now,
      timeZone: await dependencies.getTimeZone(c.env.DB, ownerId),
    });
    return c.json(plan, 200);
  });
  router.openapi(listTrashRoute, async (c) => {
    const month = c.req.valid("param").month;
    const goals = await dependencies
      .createUseCases(c.env.DB)
      .listTrash.execute({ ownerId: authenticatedOwnerId(c), month });
    return c.json({ month, goals }, 200);
  });
  router.openapi(createGoalRoute, async (c) => {
    const goal = await dependencies.createUseCases(c.env.DB).createGoal.execute({
      ...c.req.valid("json"),
      month: c.req.valid("param").month,
      now: Date.now(),
      ownerId: authenticatedOwnerId(c),
    });
    return c.json({ goal: { ...goal, entries: [] } }, 201);
  });
  router.openapi(reorderGoalsRoute, async (c) => {
    await dependencies.createUseCases(c.env.DB).reorderGoals.execute({
      ...c.req.valid("json"),
      month: c.req.valid("param").month,
      ownerId: authenticatedOwnerId(c),
    });
    return c.body(null, 204);
  });
  router.openapi(updateGoalRoute, async (c) => {
    const goal = await dependencies.createUseCases(c.env.DB).updateGoal.execute({
      ...c.req.valid("json"),
      goalId: c.req.valid("param").goalId,
      now: Date.now(),
      ownerId: authenticatedOwnerId(c),
    });
    return c.json({ goal }, 200);
  });
  router.openapi(deleteGoalRoute, async (c) => {
    await dependencies.createUseCases(c.env.DB).deleteGoal.execute({
      ownerId: authenticatedOwnerId(c),
      goalId: c.req.valid("param").goalId,
      now: Date.now(),
    });
    return c.body(null, 204);
  });
  router.openapi(restoreGoalRoute, async (c) => {
    await dependencies.createUseCases(c.env.DB).restoreGoal.execute({
      ownerId: authenticatedOwnerId(c),
      goalId: c.req.valid("param").goalId,
      now: Date.now(),
    });
    return c.body(null, 204);
  });
  router.openapi(adjustEntryRoute, async (c) => {
    const ownerId = authenticatedOwnerId(c);
    const entry = await dependencies.createUseCases(c.env.DB).adjustEntry.execute({
      ...c.req.valid("param"),
      ...c.req.valid("json"),
      ownerId,
      now: Date.now(),
      timeZone: await dependencies.getTimeZone(c.env.DB, ownerId),
    });
    return c.json({ entry }, 200);
  });

  router.openapi(putEntryRoute, async (c) => {
    const { expectedRevision, ...value } = c.req.valid("json");
    const entry = await dependencies.createUseCases(c.env.DB).upsertEntry.execute({
      date: c.req.valid("param").date,
      goalId: c.req.valid("param").goalId,
      now: Date.now(),
      ownerId: authenticatedOwnerId(c),
      value,
      expectedRevision,
      timeZone: await dependencies.getTimeZone(c.env.DB, authenticatedOwnerId(c)),
    });
    return c.json({ entry }, 200);
  });
  router.openapi(deleteEntryRoute, async (c) => {
    await dependencies.createUseCases(c.env.DB).deleteEntry.execute({
      ownerId: authenticatedOwnerId(c),
      goalId: c.req.valid("param").goalId,
      date: c.req.valid("param").date,
      now: Date.now(),
      expectedRevision: c.req.valid("query").expectedRevision,
      timeZone: await dependencies.getTimeZone(c.env.DB, authenticatedOwnerId(c)),
    });
    return c.body(null, 204);
  });
  return router;
}
