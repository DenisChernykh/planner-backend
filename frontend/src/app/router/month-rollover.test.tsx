import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGetApiPlansMonthQueryKey } from "@/shared/api";
import { MonthRollover } from "./month-rollover";

const { state } = vi.hoisted(() => ({ state: { timeZone: "Asia/Yekaterinburg", error: false } }));
vi.mock("@/shared/api", async (original) => ({
  ...(await original<typeof import("@/shared/api")>()),
  useGetApiRemindersSettings: () => ({
    isError: state.error,
    data: { settings: { timeZone: state.timeZone } },
  }),
}));

beforeEach(() => {
  state.timeZone = "Asia/Yekaterinburg";
  state.error = false;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T18:59:50Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function open(path = "/plans/2026-09", month = "2026-09") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(getGetApiPlansMonthQueryKey({ month: "2026-10" }), { goals: [] });
  const router = createMemoryRouter(
    [
      {
        path,
        element: (
          <>
            <MonthRollover month={month} />
            <input aria-label="Fact" />
          </>
        ),
      },
      ...(path === "/plans/2026-10" ? [] : [{ path: "/plans/2026-10", element: <p>October</p> }]),
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client };
}

describe("open plan at month rollover", () => {
  it("switches at local midnight and invalidates a previously viewed empty destination", async () => {
    const { router, client } = open();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(router.state.location.pathname).toBe("/plans/2026-10");
    expect(
      client.getQueryState(getGetApiPlansMonthQueryKey({ month: "2026-10" }))?.isInvalidated,
    ).toBe(true);
    router.dispose();
  });
  it.each(["focus", "visibilitychange"])("catches up after sleep using %s", async (event) => {
    const { router } = open();
    vi.setSystemTime(new Date("2026-10-01T06:00:00Z"));
    await act(async () => {
      (event === "focus" ? window : document).dispatchEvent(new Event(event));
    });
    expect(router.state.location.pathname).toBe("/plans/2026-10");
    router.dispose();
  });
  it.each([
    ["/plans/2026-08", "2026-08"],
    ["/plans/2026-09/goals/new", "2026-09"],
    ["/plans/2026-09/reminders", "2026-09"],
    ["/plans/2026-09/trash", "2026-09"],
  ])("preserves history and unfinished forms: %s", async (path, month) => {
    const { router } = open(path, month);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(router.state.location.pathname).toBe(path);
    router.dispose();
  });
  it("uses the account timezone and waits for its actual midnight", async () => {
    state.timeZone = "UTC";
    const { router } = open();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(router.state.location.pathname).toBe("/plans/2026-09");
    vi.setSystemTime(new Date("2026-10-01T00:00:01Z"));
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(router.state.location.pathname).toBe("/plans/2026-10");
    router.dispose();
  });
  it("does not navigate on settings failure", async () => {
    state.error = true;
    const { router } = open();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(router.state.location.pathname).toBe("/plans/2026-09");
    router.dispose();
  });
  it("refreshes an already open future plan when it becomes current", async () => {
    const { router, client } = open("/plans/2026-10", "2026-10");
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(router.state.location.pathname).toBe("/plans/2026-10");
    expect(
      client.getQueryState(getGetApiPlansMonthQueryKey({ month: "2026-10" }))?.isInvalidated,
    ).toBe(true);
    router.dispose();
  });
  it("waits while the user is typing a fact", async () => {
    const { router } = open();
    const input = document.querySelector("input");
    if (!input) throw new Error("Missing fact field");
    input.focus();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(router.state.location.pathname).toBe("/plans/2026-09");
    input.blur();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(router.state.location.pathname).toBe("/plans/2026-10");
    router.dispose();
  });
  it("waits for an in-flight save and then completes the transition", async () => {
    const { router, client } = open();
    const save = Promise.withResolvers<void>();
    const mutation = client.getMutationCache().build(client, { mutationFn: () => save.promise });
    let result: Promise<void>;
    await act(async () => {
      result = mutation.execute(undefined);
      await Promise.resolve();
    });
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(router.state.location.pathname).toBe("/plans/2026-09");
    await act(async () => {
      save.resolve();
      await result;
    });
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(router.state.location.pathname).toBe("/plans/2026-10");
    router.dispose();
  });
  it("cleans up timers and event listeners when unmounted", async () => {
    const { router } = open();
    cleanup();
    vi.setSystemTime(new Date("2026-10-01T00:00:01Z"));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(router.state.location.pathname).toBe("/plans/2026-09");
    router.dispose();
  });
});
