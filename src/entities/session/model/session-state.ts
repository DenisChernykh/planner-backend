import type { AuthenticatedUser } from "@/shared/api";
import { getApiProblem } from "@/shared/api";

export type SessionState =
  | { kind: "loading" }
  | { kind: "authenticated"; user: AuthenticatedUser }
  | { kind: "anonymous" }
  | { kind: "disabled" }
  | { kind: "error"; error: unknown };

/** Maps only documented Hono session responses to frontend auth states. */
export function classifySessionError(error: unknown): "anonymous" | "disabled" | null {
  const problem = getApiProblem(error);
  if (!problem) return null;

  if (problem.status === 404 && problem.code === "NOT_FOUND") return "disabled";
  if (problem.status === 401 && problem.code === "UNAUTHENTICATED") return "anonymous";

  return null;
}
