import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import type { WorkerHttpEnv } from "../../../platform/http/environment";
import { applicationErrorToResponse, problem } from "../../../platform/http/problem-details";
import { problemDetailsSchema } from "../../../platform/http/problem-details-schema";
import { ApplicationError } from "../../../shared/application/application-error";
import {
  ACCOUNT_API_SECURITY,
  type IdentityContextVariables,
  requireAuthenticatedUser,
} from "../../identity-access/public-contracts";
import type { ProgressUseCases } from "../application/progress";
import { progressDate, progressOverviewSchema, progressSettingsSchema } from "./schemas";

type Env = WorkerHttpEnv<IdentityContextVariables>;
const json = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });
const errors = Object.fromEntries(
  [400, 401, 403, 404, 413, 415, 500].map((status) => [
    status,
    {
      description: "Request failed",
      content: { "application/problem+json": { schema: problemDetailsSchema } },
    },
  ]),
);
const query = z.object({
  period: z.enum(["week", "month"]).default("week"),
  anchor: progressDate,
  goals: z
    .string()
    .max(7400)
    .regex(/^[0-9a-f-]{36}(?:,[0-9a-f-]{36})*$/iu)
    .optional(),
});

export function createProgressHttp(dependencies: {
  operations(database: D1Database): ProgressUseCases;
  timeZone(database: D1Database, ownerId: string): Promise<string>;
  today(now: number, timeZone: string): string;
}) {
  const router = new OpenAPIHono<Env>({
    defaultHook: (result, c) => {
      if (!result.success)
        return applicationErrorToResponse(
          c,
          new ApplicationError("INVALID_REQUEST", "Проверьте дату и период."),
        );
    },
  });
  router.onError((error, c) => {
    if (error instanceof HTTPException && error.status === 400)
      return applicationErrorToResponse(
        c,
        new ApplicationError("INVALID_REQUEST", "Некорректный JSON."),
      );
    throw error;
  });
  router.use("/api/progress*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  router.use(
    "/api/progress/*",
    bodyLimit({
      maxSize: 4096,
      onError: (c) =>
        problem(c, {
          code: "PAYLOAD_TOO_LARGE",
          type: "urn:planner:problem:content-too-large",
          title: "Content too large",
          status: 413,
          detail: "Request body is too large.",
        }),
    }),
  );
  router.use("/api/progress/*", async (c, next) => {
    if (
      c.req.method === "PUT" &&
      !/^application\/json(?:\s*;|$)/iu.test(c.req.header("Content-Type") ?? "")
    )
      return problem(c, {
        code: "UNSUPPORTED_MEDIA_TYPE",
        type: "urn:planner:problem:unsupported-media-type",
        title: "Unsupported media type",
        status: 415,
        detail: "JSON is required.",
      });
    await next();
  });
  const owner = (c: {
    get(name: "authenticatedUser"): IdentityContextVariables["authenticatedUser"];
  }) => requireAuthenticatedUser({ authenticatedUser: c.get("authenticatedUser") }).id;
  const routeBase = { tags: ["Progress"], security: ACCOUNT_API_SECURITY };
  router.openapi(
    createRoute({
      ...routeBase,
      method: "get",
      path: "/api/progress/settings",
      responses: {
        200: { description: "Shared progress start date", content: json(progressSettingsSchema) },
        ...errors,
      },
    }),
    async (c) => c.json(await dependencies.operations(c.env.DB).settings(owner(c)), 200),
  );
  router.openapi(
    createRoute({
      ...routeBase,
      method: "put",
      path: "/api/progress/settings",
      request: {
        body: {
          required: true,
          content: json(z.object({ startsOn: progressDate.nullable() }).strict()),
        },
      },
      responses: {
        200: { description: "Start date saved", content: json(progressSettingsSchema) },
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await dependencies
          .operations(c.env.DB)
          .saveSettings(owner(c), c.req.valid("json").startsOn),
        200,
      ),
  );
  router.openapi(
    createRoute({
      ...routeBase,
      method: "get",
      path: "/api/progress",
      request: { query },
      responses: {
        200: {
          description: "Owner progress for a calendar period",
          content: json(progressOverviewSchema),
        },
        ...errors,
      },
    }),
    async (c) => {
      const ownerId = owner(c),
        now = Date.now();
      const timeZone = await dependencies.timeZone(c.env.DB, ownerId);
      return c.json(
        await dependencies.operations(c.env.DB).overview({
          ...c.req.valid("query"),
          ownerId,
          now,
          timeZone,
          today: dependencies.today(now, timeZone),
        }),
        200,
      );
    },
  );
  router.openapi(
    createRoute({
      ...routeBase,
      method: "get",
      path: "/api/progress/goals/{goalId}",
      request: { query, params: z.object({ goalId: z.uuid() }) },
      responses: {
        200: { description: "Goal lineage progress", content: json(progressOverviewSchema) },
        ...errors,
      },
    }),
    async (c) => {
      const ownerId = owner(c),
        now = Date.now();
      const timeZone = await dependencies.timeZone(c.env.DB, ownerId);
      return c.json(
        await dependencies.operations(c.env.DB).overview({
          ...c.req.valid("query"),
          ...c.req.valid("param"),
          ownerId,
          now,
          timeZone,
          today: dependencies.today(now, timeZone),
        }),
        200,
      );
    },
  );
  return router;
}
