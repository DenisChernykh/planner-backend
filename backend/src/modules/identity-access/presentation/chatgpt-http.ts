import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { WorkerHttpEnv } from "../../../platform/http/environment";
import { problem } from "../../../platform/http/problem-details";
import { problemDetailsSchema } from "../../../platform/http/problem-details-schema";
import { ApplicationError } from "../../../shared/application/application-error";
import type { ChatGptConnection } from "../application/integrations/chatgpt-connection";
import { type IdentityContextVariables, requireAuthenticatedUser } from "../public-contracts";

type Env = WorkerHttpEnv<IdentityContextVariables>;
const path = "/api/integrations/chatgpt";
const json = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });
const errors = Object.fromEntries(
  [400, 401, 403, 404, 413, 415, 500].map((status) => [
    status,
    {
      description: "Request rejected",
      content: { "application/problem+json": { schema: problemDetailsSchema } },
    },
  ]),
);

export function registerChatGptConnection(
  router: OpenAPIHono<Env>,
  authentication: MiddlewareHandler<Env>,
  createConnection: (database: D1Database) => ChatGptConnection,
) {
  router.use(path, async (c, next) => {
    // Integration keys cannot mint, inspect, or revoke account credentials.
    if (c.req.header("Authorization"))
      throw new ApplicationError("FORBIDDEN", "Use the website to manage connections.");
    await authentication(c, next);
  });
  router.use(
    path,
    bodyLimit({
      maxSize: 1024,
      onError: (c) =>
        problem(c, {
          code: "PAYLOAD_TOO_LARGE",
          type: "urn:planner:problem:content-too-large",
          title: "Content too large",
          status: 413,
          detail: "The request body exceeds the accepted size.",
        }),
    }),
  );
  router.use(path, async (c, next) => {
    if (
      c.req.method === "POST" &&
      !/^application\/json(?:\s*;|$)/iu.test(c.req.header("Content-Type") ?? "")
    ) {
      c.res = problem(c, {
        code: "UNSUPPORTED_MEDIA_TYPE",
        type: "urn:planner:problem:unsupported-media-type",
        title: "Unsupported media type",
        status: 415,
        detail: "JSON is required.",
      });
      return;
    }
    await next();
  });
  const common = { path, tags: ["Integrations"], security: [{ sessionCookie: [] }] };
  const owner = (c: {
    get(name: "authenticatedUser"): IdentityContextVariables["authenticatedUser"];
  }) => requireAuthenticatedUser({ authenticatedUser: c.get("authenticatedUser") }).id;
  router.openapi(
    createRoute({
      ...common,
      method: "get",
      responses: {
        200: {
          description: "Current ChatGPT connection; never includes the key",
          content: json(
            z.object({
              connection: z.object({ createdAt: z.number(), expiresAt: z.number() }).nullable(),
            }),
          ),
        },
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        { connection: await createConnection(c.env.DB).connection(owner(c), Date.now()) },
        200,
      ),
  );
  router.openapi(
    createRoute({
      ...common,
      method: "post",
      request: { body: { required: true, content: json(z.strictObject({})) } },
      responses: {
        201: {
          description: "New key, displayed once; replaces the previous key",
          content: json(z.object({ token: z.string(), expiresAt: z.number() })),
        },
        ...errors,
      },
    }),
    async (c) => c.json(await createConnection(c.env.DB).issue(owner(c), Date.now()), 201),
  );
  router.openapi(
    createRoute({
      ...common,
      method: "delete",
      responses: { 204: { description: "Connection revoked" }, ...errors },
    }),
    async (c) => {
      await createConnection(c.env.DB).revoke(owner(c));
      return c.body(null, 204);
    },
  );
}

/** Explicit, bounded surface for the personal ChatGPT key. */
export function integrationPathAllowed(pathname: string): boolean {
  return (
    pathname === "/api/auth/me" ||
    pathname === "/api/search" ||
    pathname === "/api/search/goals" ||
    /^\/api\/plans\/\d{4}-\d{2}(?:\/trash|\/goals(?:\/order)?)?$/u.test(pathname) ||
    /^\/api\/goals\/[0-9a-f-]{36}(?:\/restore|\/entries\/\d{4}-\d{2}-\d{2}(?:\/adjust)?)?$/iu.test(
      pathname,
    ) ||
    /^\/api\/reminders\/(?:settings|goals\/(?:\d{4}-\d{2}|[0-9a-f-]{36})|telegram(?:\/connect)?)$/iu.test(
      pathname,
    )
  );
}
