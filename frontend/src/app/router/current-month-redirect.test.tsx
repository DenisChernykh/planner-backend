import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getGetApiRemindersSettingsQueryKey } from "@/shared/api";
import { routes } from "./router";

const { apiMutator } = vi.hoisted(() => ({ apiMutator: vi.fn() }));

vi.mock("@/entities/session", () => ({
  useCurrentSession: () => ({
    kind: "authenticated",
    user: { id: "owner", displayName: "Денис", username: null, photoUrl: null },
  }),
}));
vi.mock("@/pages/plan", () => ({ PlanPage: () => <p>План</p> }));
vi.mock("@/shared/api/client/orval-mutator", () => ({ apiMutator }));

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

function openRoot() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T21:30:00Z"));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(getGetApiRemindersSettingsQueryKey(), {
    settings: { timeZone: "Asia/Yekaterinburg" },
  });
  const router = createMemoryRouter(routes, { initialEntries: ["/"] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("current month with cached settings", () => {
  it("waits for refreshed settings even when cached settings are considered fresh", async () => {
    const refresh = Promise.withResolvers<unknown>();
    vi.mocked(apiMutator).mockReturnValueOnce(refresh.promise);
    const router = openRoot();
    await waitFor(() => expect(apiMutator).toHaveBeenCalledTimes(1));
    expect(router.state.location.pathname).toBe("/");
    expect(screen.getByRole("status")).toHaveTextContent("Загружаем план");
    await act(async () => refresh.resolve({ settings: { timeZone: "UTC" } }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/plans/2026-09"));
    router.dispose();
  });

  it("does not redirect using cached data when the refresh fails and allows retry", async () => {
    vi.mocked(apiMutator).mockRejectedValueOnce(new Error("offline"));
    const router = openRoot();
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить часовой пояс");
    expect(router.state.location.pathname).toBe("/");
    vi.mocked(apiMutator).mockResolvedValueOnce({ settings: { timeZone: "UTC" } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Повторить" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/plans/2026-09"));
    router.dispose();
  });
});
