import { useQuery } from "@tanstack/react-query";

import { type AuthenticatedUser, getApiAuthMe, getGetApiAuthMeQueryKey } from "@/shared/api";

import { classifySessionError, type SessionState } from "../model/session-state";

/** Single React Query key for the Hono current-session request. */
export const currentSessionQueryKey = getGetApiAuthMeQueryKey;

/** Reads the user and distinguishes Telegram, anonymous, and disabled auth modes. */
export function useCurrentSession(): SessionState {
  const query = useQuery({
    queryKey: currentSessionQueryKey(),
    queryFn: ({ signal }) => getApiAuthMe(undefined, signal),
    retry: false,
  });

  if (query.isPending) return { kind: "loading" };

  if (query.data) {
    return { kind: "authenticated", user: query.data.user as AuthenticatedUser };
  }

  const knownState = classifySessionError(query.error);
  if (knownState) return { kind: knownState };

  return { kind: "error", error: query.error };
}
