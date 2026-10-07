import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { WorkerHttpEnv } from "../../../platform/http/environment";
import { problemDetailsSchema } from "../../../platform/http/problem-details-schema";
import {
  ACCOUNT_API_SECURITY,
  type IdentityContextVariables,
  requireAuthenticatedUser,
} from "../../identity-access/public-contracts";
import type { PlanningHttpDependencies } from "./http";
import { entrySchema, goalSchema } from "./resource-schemas";

const deletedQuery = z.enum(["true", "false"]).default("false");
const searchQuery = z
  .object({
    q: z.string().trim().max(160).default(""),
    kind: z.enum(["all", "goals", "entries"]).default("all"),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    tracking: z.enum(["check", "quantity", "scale", "time"]).optional(),
    cadence: z.enum(["day", "week", "month"]).optional(),
    goalId: z.uuid().optional(),
    presence: z.enum(["any", "present", "missing"]).default("any"),
    met: z.enum(["any", "met", "unmet"]).default("any"),
    note: z.enum(["any", "present", "absent"]).default("any"),
    comparison: z.enum(["gt", "lt", "eq", "between"]).optional(),
    value: z.string().trim().min(1).max(64).optional(),
    valueTo: z.string().trim().min(1).max(64).optional(),
    includeDeleted: deletedQuery,
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .refine((input) => {
    if (input.from && input.to && input.from > input.to) return false;
    if (input.comparison && (!input.goalId || !input.value)) return false;
    if (input.comparison === "between" && !input.valueTo) return false;
    if (!input.comparison && (input.value !== undefined || input.valueTo !== undefined))
      return false;
    if (
      input.presence === "missing" &&
      (input.met !== "any" || input.note !== "any" || input.comparison)
    )
      return false;
    return true;
  }, "Search conditions are incompatible");

const searchGoalSchema = goalSchema
  .omit({ ownerId: true, createdAt: true, updatedAt: true, entries: true })
  .openapi("SearchGoal");
const searchResultSchema = z
  .object({
    id: z.string(),
    kind: z.enum(["goal", "entry"]),
    goal: searchGoalSchema,
    date: z.string().nullable(),
    entry: entrySchema.nullable(),
    match: z.enum(["title", "description", "note"]).nullable(),
  })
  .openapi("SearchResult");
const errors = {
  400: {
    description: "Invalid search conditions",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  401: {
    description: "Authentication required",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  404: {
    description: "Authentication feature disabled",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  500: {
    description: "Unexpected server failure",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
} as const;

const searchRoute = createRoute({
  method: "get",
  path: "/api/search",
  tags: ["Search"],
  security: ACCOUNT_API_SECURITY,
  request: { query: searchQuery },
  responses: {
    200: {
      description: "Owner-scoped ranked goals and daily entries across all months",
      content: {
        "application/json": {
          schema: z
            .object({
              results: z.array(searchResultSchema),
              total: z.number().int(),
              counts: z.object({ goals: z.number().int(), entries: z.number().int() }),
              nextOffset: z.number().int().nullable(),
              suggestion: z.string().nullable(),
              today: z.string(),
            })
            .openapi("SearchPage"),
        },
      },
    },
    ...errors,
  },
});
const goalsRoute = createRoute({
  method: "get",
  path: "/api/search/goals",
  tags: ["Search"],
  security: ACCOUNT_API_SECURITY,
  request: { query: z.object({ includeDeleted: deletedQuery }).strict() },
  responses: {
    200: {
      description: "Owner's goal choices for search, without daily entries",
      content: { "application/json": { schema: z.object({ goals: z.array(searchGoalSchema) }) } },
    },
    ...errors,
  },
});

export function registerSearchRoutes(
  router: OpenAPIHono<WorkerHttpEnv<IdentityContextVariables>>,
  dependencies: PlanningHttpDependencies,
) {
  router.openapi(searchRoute, async (c) => {
    const ownerId = requireAuthenticatedUser({ authenticatedUser: c.get("authenticatedUser") }).id;
    const query = c.req.valid("query");
    const result = await dependencies.createUseCases(c.env.DB).search.execute({
      ownerId,
      filters: { ...query, includeDeleted: query.includeDeleted === "true" },
      now: Date.now(),
      timeZone: await dependencies.getTimeZone(c.env.DB, ownerId),
    });
    return c.json(result, 200);
  });
  router.openapi(goalsRoute, async (c) => {
    const ownerId = requireAuthenticatedUser({ authenticatedUser: c.get("authenticatedUser") }).id;
    const goals = await dependencies
      .createUseCases(c.env.DB)
      .search.goals(ownerId, c.req.valid("query").includeDeleted === "true");
    return c.json({ goals }, 200);
  });
}
