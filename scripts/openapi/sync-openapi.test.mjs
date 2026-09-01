import { describe, expect, it } from "vitest";

import { normalizeForOrval, validateOpenApiDocument } from "./sync-openapi.mjs";

function validDocument() {
  const paths = {
    "/health": { get: {} },
    "/api/auth/telegram/start": { get: {} },
    "/api/auth/telegram/callback": { get: {} },
    "/api/auth/me": { get: {} },
    "/api/auth/logout": { post: {} },
    "/api/notes": { get: {}, post: {} },
    "/api/notes/{noteId}": { get: {}, patch: {}, delete: {} },
  };
  return { openapi: "3.1.0", paths };
}

describe("Hono OpenAPI synchronization", () => {
  it("requires the routes consumed by this frontend", () => {
    expect(validateOpenApiDocument(validDocument())).toEqual(validDocument());

    const document = validDocument();
    delete document.paths["/api/notes/{noteId}"].patch;
    expect(() => validateOpenApiDocument(document)).toThrow("PATCH /api/notes/{noteId}");
  });

  it("normalizes the equivalent escaped slash pattern for Orval", () => {
    expect(normalizeForOrval({ pattern: "^\\/" })).toEqual({ pattern: "^/" });
  });
});
