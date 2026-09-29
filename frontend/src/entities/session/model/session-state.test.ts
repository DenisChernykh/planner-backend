import { describe, expect, it } from "vitest";

import { classifySessionError } from "./session-state";

function problemError(status: number, code: string): unknown {
  return { isAxiosError: true, response: { status, data: { code } } };
}

describe("classifySessionError", () => {
  it("recognizes the disabled Hono authentication mode", () => {
    expect(classifySessionError(problemError(404, "NOT_FOUND"))).toBe("disabled");
  });

  it("recognizes an anonymous user from the documented session response", () => {
    expect(classifySessionError(problemError(401, "UNAUTHENTICATED"))).toBe("anonymous");
  });

  it("does not turn unrelated failures into an authentication state", () => {
    expect(classifySessionError(problemError(404, "NOTE_NOT_FOUND"))).toBeNull();
    expect(classifySessionError(new Error("network unavailable"))).toBeNull();
  });
});
