import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useCurrentSession } from "@/entities/session";
import { getGetApiAuthMeQueryKey } from "@/shared/api";

vi.mock("@/shared/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/shared/api")>(),
  getApiAuthMe: vi.fn().mockRejectedValue({
    isAxiosError: true, response: { status: 401, data: { code: "UNAUTHENTICATED" } },
  }),
}));

it("review evidence: a session refetch returning 401 leaves cached identity authenticated", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = getGetApiAuthMeQueryKey();
  client.setQueryData(key, { user: { id: "previous-user", displayName: "User", username: null, photoUrl: null } });
  function State() { return <span>{useCurrentSession().kind}</span>; }
  render(<QueryClientProvider client={client}><State /></QueryClientProvider>);
  await waitFor(() => expect(client.getQueryState(key)?.status).toBe("error"));
  expect(screen.getByText("authenticated")).toBeInTheDocument();
  client.clear();
});
