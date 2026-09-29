import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { formatPlannerMonth, getCurrentPlannerMonth } from "@/shared/lib/planner-month";

import { routes } from "./router";

function currentPlannerDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Yekaterinburg",
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

vi.mock("@/entities/session", () => ({
  useCurrentSession: () => ({
    kind: "authenticated",
    user: { id: "user-1", displayName: "Денис", username: null, photoUrl: null },
  }),
}));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return {
    ...actual,
    useGetApiRemindersSettings: () => ({
      isPending: false,
      data: { settings: { timeZone: "Asia/Yekaterinburg" } },
    }),
    useGetApiPlansMonth: () => ({
      isPending: false,
      isError: false,
      data: { month: getCurrentPlannerMonth(), today: currentPlannerDate(), goals: [] },
    }),
    useGetApiPlansMonthTrash: () => ({ isPending: false, isError: false, data: { goals: [] } }),
  };
});

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("planner routes", () => {
  it("redirects the root to the current month", async () => {
    const router = renderRoute("/");
    const currentMonth = getCurrentPlannerMonth();

    await waitFor(() => expect(router.state.location.pathname).toBe(`/plans/${currentMonth}`));
    const monthName = formatPlannerMonth(currentMonth)
      .replace(/ \d{4}$/u, "")
      .toLocaleLowerCase("ru-RU");
    expect(screen.getByRole("heading", { name: `План на ${monthName}` })).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Открыть меню пользователя" }));
    expect(await screen.findByRole("menuitem", { name: "Выйти из Planner" })).toBeInTheDocument();
  });

  it("surfaces invalid months and unknown routes", async () => {
    const invalidMonthRouter = renderRoute("/plans/2026-13");
    expect(await screen.findByRole("heading", { name: "Некорректный месяц" })).toBeInTheDocument();
    expect(invalidMonthRouter.state.location.pathname).toBe("/plans/2026-13");

    invalidMonthRouter.dispose();
    const unknownRouter = renderRoute("/missing");
    expect(await screen.findByRole("heading", { name: "Страница не найдена" })).toBeInTheDocument();
    unknownRouter.dispose();
  });

  it("returns from the form through both header and cancel links", async () => {
    const user = userEvent.setup();
    const router = renderRoute("/plans/2026-04/goals/new");

    await user.click(await screen.findByRole("link", { name: "К плану" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/plans/2026-04"));
    await act(async () => router.navigate("/plans/2026-04/goals/new"));
    await user.click(await screen.findByRole("link", { name: "Отмена" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/plans/2026-04"));
  });
});
