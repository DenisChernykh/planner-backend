import { isAxiosError } from "axios";

import type { ProblemDetails } from "@/shared/api/generated/model";

type ApiProblem = Pick<ProblemDetails, "code" | "status">;

/** Extracts Problem Details from an Axios error without trusting arbitrary bodies. */
export function getApiProblem(error: unknown): ApiProblem | null {
  if (!isAxiosError<ProblemDetails>(error)) return null;

  const response = error.response;
  if (!response || typeof response.data !== "object" || response.data === null) return null;

  const problem = response.data as Partial<ProblemDetails>;
  if (typeof problem.code !== "string") return null;

  return { code: problem.code, status: response.status };
}
