import { QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import { queryClient } from "./query-client";

/**
 * Подключает React Query к дереву приложения.
 *
 * @remarks Должен оборачивать компоненты, которые используют session и другие
 * hooks React Query.
 */
export function AppProvider({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
