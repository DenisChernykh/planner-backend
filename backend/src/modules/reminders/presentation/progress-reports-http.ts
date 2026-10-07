import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { WorkerHttpEnv } from "../../../platform/http/environment";
import { problemDetailsSchema } from "../../../platform/http/problem-details-schema";
import {
  ACCOUNT_API_SECURITY,
  type IdentityContextVariables,
  requireAuthenticatedUser,
} from "../../identity-access/public-contracts";
import { progressOverviewSchema } from "../../progress";
import type { ProgressReportsUseCases } from "../application/reports/progress-reports";

type Env = WorkerHttpEnv<IdentityContextVariables>;
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);
const settings = z.object({
  ownerId: z.string(),
  enabled: z.boolean(),
  wednesdayTime: time,
  sundayTime: time,
  nextWednesdayAt: z.number().nullable(),
  nextSundayAt: z.number().nullable(),
  revision: z.number().int(),
});
const input = z
  .object({
    month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u),
    enabled: z.boolean(),
    wednesdayTime: time,
    sundayTime: time,
    startsOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable(),
    goals: z.array(z.object({ goalId: z.uuid(), included: z.boolean() }).strict()).max(200),
  })
  .strict()
  .openapi("ProgressReportInput");
const state = z
  .object({
    settings,
    startsOn: z.string().nullable(),
    timeZone: z.string(),
    quietStart: time,
    quietEnd: time,
    connection: z.string(),
    botAvailable: z.boolean(),
    state: z.enum(["disabled", "disconnected", "future-start", "no-goals", "ready"]),
    nextRuns: z.array(
      z.object({
        slot: z.enum(["wed", "sun"]),
        scheduledAt: z.number(),
        sendAt: z.number(),
        reportDate: z.string(),
      }),
    ),
    goals: z.array(z.object({ goalId: z.string(), title: z.string(), included: z.boolean() })),
  })
  .openapi("ProgressReportState");
const message = z.object({
  text: z.string(),
  buttons: z
    .array(
      z.array(
        z.object({ text: z.string(), url: z.string().optional(), data: z.string().optional() }),
      ),
    )
    .optional(),
  forceReply: z.boolean().optional(),
});
const preview = z
  .object({
    message: message.nullable(),
    reason: z.string().nullable(),
    overview: progressOverviewSchema,
  })
  .openapi("ProgressReportPreview");
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

export function registerProgressReportHttp(
  router: OpenAPIHono<Env>,
  operations: (env: CloudflareBindings) => { reports: ProgressReportsUseCases },
) {
  const owner = (c: {
    get(name: "authenticatedUser"): IdentityContextVariables["authenticatedUser"];
  }) => requireAuthenticatedUser({ authenticatedUser: c.get("authenticatedUser") }).id;
  const base = { tags: ["Progress reports"], security: ACCOUNT_API_SECURITY };
  router.openapi(
    createRoute({
      ...base,
      method: "get",
      path: "/api/reminders/progress-reports",
      request: { query: z.object({ month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u) }) },
      responses: {
        200: {
          description: "Progress report settings and monthly selection",
          content: json(state),
        },
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await operations(c.env).reports.get({
          ownerId: owner(c),
          month: c.req.valid("query").month,
          now: Date.now(),
        }),
        200,
      ),
  );
  router.openapi(
    createRoute({
      ...base,
      method: "put",
      path: "/api/reminders/progress-reports",
      request: { body: { required: true, content: json(input) } },
      responses: {
        200: { description: "Settings saved atomically", content: json(state) },
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await operations(c.env).reports.save({
          ownerId: owner(c),
          input: c.req.valid("json"),
          now: Date.now(),
        }),
        200,
      ),
  );
  router.openapi(
    createRoute({
      ...base,
      method: "post",
      path: "/api/reminders/progress-reports/preview",
      request: {
        body: { required: true, content: json(input.extend({ slot: z.enum(["wed", "sun"]) })) },
      },
      responses: {
        200: { description: "Read-only draft preview", content: json(preview) },
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await operations(c.env).reports.preview({
          ownerId: owner(c),
          input: c.req.valid("json"),
          slot: c.req.valid("json").slot,
          now: Date.now(),
        }),
        200,
      ),
  );
}
