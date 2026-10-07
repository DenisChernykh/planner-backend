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
import type { ConnectTelegramUseCase } from "../application/connection/connect-telegram.use-case";
import type { DisconnectTelegramUseCase } from "../application/connection/disconnect-telegram.use-case";
import type { PrepareCurrentPlanUseCase } from "../application/scheduling/prepare-current-plan.use-case";
import type { GetGoalRemindersQuery } from "../application/settings/get-goal-reminders.query";
import type { GetReminderStateQuery } from "../application/settings/get-reminder-state.query";
import type { SaveGoalReminderUseCase } from "../application/settings/save-goal-reminder.use-case";
import type { SaveReminderSettingsUseCase } from "../application/settings/save-reminder-settings.use-case";

import {
  GoalReminderInvalidError,
  ReminderScheduleInvalidError,
  ReminderSettingsInvalidError,
} from "../domain/errors";

type ReminderHttpUseCases = {
  prepareCurrentPlan: PrepareCurrentPlanUseCase;
  getState: GetReminderStateQuery;
  getGoalReminders: GetGoalRemindersQuery;
  saveSettings: SaveReminderSettingsUseCase;
  saveGoalReminder: SaveGoalReminderUseCase;
  connect: ConnectTelegramUseCase;
  disconnect: DisconnectTelegramUseCase;
};

type Env = WorkerHttpEnv<IdentityContextVariables>;
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);
const settingsInput = z
  .object({
    enabled: z.boolean(),
    timeZone: z.string().min(1).max(80),
    quietStart: time,
    quietEnd: time,
    eveningTime: time,
  })
  .strict();
const settings = settingsInput.extend({
  ownerId: z.string(),
  nextEveningAt: z.number().nullable(),
});
const rule = z
  .object({
    mode: z.enum(["off", "scheduled", "evening"]),
    time,
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  })
  .strict();
const ruleOutput = rule.extend({ goalId: z.string(), nextRunAt: z.number().nullable() });
const errors = Object.fromEntries(
  [400, 401, 403, 404, 413, 415, 500, 503].map((status) => [
    status,
    {
      description: "Request failed",
      content: { "application/problem+json": { schema: problemDetailsSchema } },
    },
  ]),
);
const json = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });
const security = ACCOUNT_API_SECURITY;
const tags = ["Reminders"];

export function createReminderHttp(
  useCases: (env: CloudflareBindings) => ReminderHttpUseCases,
): OpenAPIHono<Env> {
  const router = new OpenAPIHono<Env>({
    defaultHook: (result, c) => {
      if (!result.success)
        return applicationErrorToResponse(
          c,
          new ApplicationError("INVALID_REQUEST", "Проверьте настройки напоминаний."),
        );
    },
  });
  router.onError((error, c) => {
    if (
      error instanceof ReminderSettingsInvalidError ||
      error instanceof GoalReminderInvalidError ||
      error instanceof ReminderScheduleInvalidError
    )
      return applicationErrorToResponse(c, new ApplicationError("INVALID_REQUEST", error.message));
    if (error instanceof HTTPException && error.status === 400)
      return applicationErrorToResponse(
        c,
        new ApplicationError("INVALID_REQUEST", "Некорректный JSON."),
      );
    throw error;
  });
  router.use("/api/reminders/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  router.use(
    "/api/reminders/*",
    bodyLimit({
      maxSize: 16 * 1024,
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
  router.use("/api/reminders/*", async (c, next) => {
    if (
      c.req.method === "PUT" &&
      !/^application\/json(?:\s*;|$)/iu.test(c.req.header("Content-Type") ?? "")
    ) {
      return problem(c, {
        code: "UNSUPPORTED_MEDIA_TYPE",
        type: "urn:planner:problem:unsupported-media-type",
        title: "Unsupported media type",
        status: 415,
        detail: "JSON is required.",
      });
    }
    await next();
  });
  const owner = (c: {
    get(name: "authenticatedUser"): IdentityContextVariables["authenticatedUser"];
  }) => requireAuthenticatedUser({ authenticatedUser: c.get("authenticatedUser") }).id;
  router.openapi(
    createRoute({
      method: "get",
      path: "/api/reminders/settings",
      tags,
      security,
      responses: {
        200: {
          description: "Reminder settings and Telegram connection",
          content: json(
            z.object({
              settings,
              connection: z.string(),
              botAvailable: z.boolean(),
              deliveryIssues: z.number(),
            }),
          ),
        },
        ...errors,
      },
    }),
    async (c) =>
      c.json(await useCases(c.env).getState.execute({ ownerId: owner(c), now: Date.now() }), 200),
  );
  router.openapi(
    createRoute({
      method: "put",
      path: "/api/reminders/settings",
      tags,
      security,
      request: { body: { required: true, content: json(settingsInput) } },
      responses: { 200: { description: "Settings saved", content: json(settings) }, ...errors },
    }),
    async (c) =>
      c.json(
        await useCases(c.env).saveSettings.execute({
          ownerId: owner(c),
          input: c.req.valid("json"),
          now: Date.now(),
        }),
        200,
      ),
  );
  router.openapi(
    createRoute({
      method: "get",
      path: "/api/reminders/goals/{month}",
      tags,
      security,
      request: { params: z.object({ month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u) }) },
      responses: {
        200: {
          description: "Goal reminder settings",
          content: json(z.object({ goals: z.array(ruleOutput.extend({ title: z.string() })) })),
        },
        ...errors,
      },
    }),
    async (c) => {
      const operations = useCases(c.env);
      const input = { ownerId: owner(c), month: c.req.valid("param").month, now: Date.now() };
      await operations.prepareCurrentPlan.execute(input);
      return c.json({ goals: await operations.getGoalReminders.execute(input) }, 200);
    },
  );
  router.openapi(
    createRoute({
      method: "put",
      path: "/api/reminders/goals/{goalId}",
      tags,
      security,
      request: {
        params: z.object({ goalId: z.uuid() }),
        body: { required: true, content: json(rule) },
      },
      responses: {
        200: { description: "Goal reminder saved", content: json(ruleOutput) },
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await useCases(c.env)
          .saveGoalReminder.execute({
            ownerId: owner(c),
            goalId: c.req.valid("param").goalId,
            input: c.req.valid("json"),
            now: Date.now(),
          })
          .then(({ goalId, mode, time, weekdays, nextRunAt }) => ({
            goalId,
            mode,
            time,
            weekdays,
            nextRunAt,
          })),
        200,
      ),
  );
  router.openapi(
    createRoute({
      method: "post",
      path: "/api/reminders/telegram/connect",
      tags,
      security,
      responses: {
        200: {
          description: "One-use Telegram connection URL",
          content: json(z.object({ url: z.string(), expiresAt: z.number() })),
        },
        ...errors,
      },
    }),
    async (c) => {
      c.header("Cache-Control", "no-store");
      return c.json(
        await useCases(c.env).connect.execute({ ownerId: owner(c), now: Date.now() }),
        200,
      );
    },
  );
  router.openapi(
    createRoute({
      method: "delete",
      path: "/api/reminders/telegram",
      tags,
      security,
      responses: { 204: { description: "Telegram disconnected and reminders paused" }, ...errors },
    }),
    async (c) => {
      await useCases(c.env).disconnect.execute({ ownerId: owner(c) });
      return c.body(null, 204);
    },
  );
  return router;
}
