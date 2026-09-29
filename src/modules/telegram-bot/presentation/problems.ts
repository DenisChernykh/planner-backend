import type { Context } from "hono";
import { problem } from "../../../platform/http/problem-details";

export function telegramWebhookNotFound(c: Context): Response {
  return problem(c, {
    code: "NOT_FOUND",
    type: "urn:planner:problem:not-found",
    title: "Not found",
    status: 404,
    detail: "The requested resource was not found.",
  });
}

export function telegramWebhookUnauthorized(c: Context): Response {
  return problem(c, {
    code: "UNAUTHENTICATED",
    type: "urn:planner:problem:unauthenticated",
    title: "Unauthenticated",
    status: 401,
    detail: "The webhook request is not authorized.",
  });
}

export function telegramWebhookUnsupportedMediaType(c: Context): Response {
  return problem(c, {
    code: "UNSUPPORTED_MEDIA_TYPE",
    type: "urn:planner:problem:unsupported-media-type",
    title: "Unsupported media type",
    status: 415,
    detail: "This endpoint requires an application/json request body.",
  });
}

export function telegramWebhookInvalidBody(c: Context): Response {
  return problem(c, {
    code: "VALIDATION_FAILED",
    type: "urn:planner:problem:validation-error",
    title: "Validation failed",
    status: 400,
    detail: "The request does not match the Telegram webhook contract.",
  });
}
