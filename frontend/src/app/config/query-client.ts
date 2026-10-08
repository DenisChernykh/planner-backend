import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import {
  classifySessionError,
  clearCurrentSession,
  currentSessionQueryKey,
} from "@/entities/session";

export function createPlannerQueryClient() {
  let principal: string | undefined;
  const onError = (error: unknown) => {
    if (classifySessionError(error) === "anonymous") {
      principal = undefined;
      clearCurrentSession(client);
    }
  };
  const client = new QueryClient({
    queryCache: new QueryCache({
      onError,
      onSuccess: (data, query) => {
        if (
          query.queryKey[0] !== currentSessionQueryKey()[0] ||
          !data ||
          typeof data !== "object" ||
          !("user" in data)
        )
          return;
        const user = data.user;
        if (!user || typeof user !== "object" || !("id" in user) || typeof user.id !== "string")
          return;
        if (principal && principal !== user.id) {
          const personal = {
            predicate: (item: { queryKey: readonly unknown[] }) =>
              item.queryKey[0] !== currentSessionQueryKey()[0],
          };
          void client.cancelQueries(personal);
          client.removeQueries(personal);
        }
        principal = user.id;
      },
    }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  return client;
}

export const queryClient = createPlannerQueryClient();
