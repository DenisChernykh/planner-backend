import type { QueryClient } from "@tanstack/react-query";

import { currentSessionQueryKey } from "../api/session";

/** Removes only data for the current principal after logout. */
export function clearCurrentSession(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: currentSessionQueryKey() });
}
