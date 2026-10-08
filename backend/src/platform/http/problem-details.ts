import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApplicationError } from "../../shared/application/application-error";

export const PROBLEM_JSON = "application/problem+json";

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  requestId: string;
};

export type ProblemInput = Omit<ProblemDetails, "instance" | "requestId">;

export function problem(c: Context, input: ProblemInput): Response {
  const requestId = c.get("requestId") as string;
  const body: ProblemDetails = {
    ...input,
    instance: `${new URL(c.req.url).pathname}#${encodeURIComponent(requestId)}`,
    requestId,
  };

  return c.json(body, input.status as ContentfulStatusCode, {
    "Content-Type": PROBLEM_JSON,
  });
}

export function applicationErrorToResponse(c: Context, error: ApplicationError): Response {
  const mapping: Record<ApplicationError["code"], Omit<ProblemInput, "code" | "detail">> = {
    CONFLICT: { status: 409, title: "Conflict", type: "urn:planner:problem:conflict" },
    DEPENDENCY_UNAVAILABLE: {
      status: 503,
      title: "Dependency unavailable",
      type: "urn:planner:problem:dependency-unavailable",
    },
    FORBIDDEN: {
      status: 403,
      title: "Forbidden",
      type: "urn:planner:problem:forbidden",
    },
    INVALID_REQUEST: {
      status: 400,
      title: "Invalid request",
      type: "urn:planner:problem:invalid-request",
    },
    NOT_FOUND: {
      status: 404,
      title: "Not found",
      type: "urn:planner:problem:not-found",
    },
    UNAUTHENTICATED: {
      status: 401,
      title: "Unauthenticated",
      type: "urn:planner:problem:unauthenticated",
    },
  };

  return problem(c, { ...mapping[error.code], code: error.code, detail: error.message });
}
