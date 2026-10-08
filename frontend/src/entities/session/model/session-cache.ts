import type { QueryClient } from "@tanstack/react-query";

import { currentSessionQueryKey } from "../api/session";

/** Cancel requests before removing personal data so late responses cannot refill it. */
export function clearCurrentSession(queryClient: QueryClient) {
  void queryClient.cancelQueries();
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== currentSessionQueryKey()[0],
  });
  queryClient.setQueryData(currentSessionQueryKey(), null);
}
