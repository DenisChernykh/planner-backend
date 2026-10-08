import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { currentSessionQueryKey, useCurrentSession } from "./session";

const { getMe } = vi.hoisted(() => ({ getMe: vi.fn() }));
vi.mock("@/shared/api", async (original) => ({
  ...(await original<typeof import("@/shared/api")>()),
  getApiAuthMe: getMe,
}));

describe("cached session refetch", () => {
  it("prioritizes a confirmed 401 over previously successful user data", async () => {
    const data = { user: { id: "owner", displayName: "Test", username: null, photoUrl: null } };
    getMe.mockResolvedValueOnce(data);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(useCurrentSession, { wrapper });
    await waitFor(() => expect(result.current.kind).toBe("authenticated"));
    getMe.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401, data: { code: "UNAUTHENTICATED" } },
    });
    await act(() => client.refetchQueries({ queryKey: currentSessionQueryKey() }));
    expect(client.getQueryData(currentSessionQueryKey())).toEqual(data);
    await waitFor(() => expect(result.current.kind).toBe("anonymous"));
    client.clear();
  });
});
