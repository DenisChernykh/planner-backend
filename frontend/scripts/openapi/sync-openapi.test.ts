import { describe, expect, it } from "vitest";

import { normalizeForOrval, validateOpenApiDocument } from "./sync-openapi";

function validDocument() {
  return {
    openapi: "3.1.0",
    paths: {
      "/health": { get: {} },
      "/api/reminders/settings": { get: {}, put: {} },
      "/api/reminders/goals/{month}": { get: {} },
      "/api/reminders/goals/{goalId}": { put: {} },
      "/api/reminders/telegram/connect": { post: {} },
      "/api/reminders/telegram": { delete: {} },
      "/api/auth/telegram/start": { get: {} },
      "/api/auth/telegram/callback": { get: {} },
      "/api/auth/me": { get: {} },
      "/api/auth/logout": { post: {} },
      "/api/notes": { get: {}, post: {} },
      "/api/notes/{noteId}": { get: {}, patch: {}, delete: {} },
      "/api/plans/{month}": { get: {} },
      "/api/plans/{month}/trash": { get: {} },
      "/api/plans/{month}/goals": { post: {} },
      "/api/plans/{month}/goals/order": { put: {} },
      "/api/goals/{goalId}": { patch: {}, delete: {} },
      "/api/goals/{goalId}/restore": { post: {} },
      "/api/goals/{goalId}/entries/{date}": { put: {}, delete: {} },
    },
  };
}

describe("Hono OpenAPI synchronization", () => {
  it("requires every operation consumed by this frontend", () => {
    expect(validateOpenApiDocument(validDocument())).toEqual(validDocument());

    const document = structuredClone(validDocument()) as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
    };
    document.paths["/api/plans/{month}/goals"] = {};
    expect(() => validateOpenApiDocument(document)).toThrow("POST /api/plans/{month}/goals");
  });

  it("normalizes escaped slashes and JavaScript-only regex flags for Orval", () => {
    expect(normalizeForOrval({ pattern: "^\\/" })).toEqual({ pattern: "^/" });
    expect(normalizeForOrval({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$/u" })).toEqual({
      pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$",
    });
  });
});
