import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Outlet, RouterProvider, useParams } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getApiSearch, getApiSearchGoals, type SearchGoal, type SearchPage } from "@/shared/api";
import { PlannerSearchProvider, usePlannerSearch } from "./search-provider";

vi.mock("@/entities/session", () => ({
  useCurrentSession: () => ({
    kind: "authenticated",
    user: { id: "owner-search", displayName: "Тест", username: null, photoUrl: null },
  }),
}));
vi.mock("@/shared/api", async (original) => ({
  ...(await original<typeof import("@/shared/api")>()),
  getApiSearch: vi.fn(),
  getApiSearchGoals: vi.fn(),
}));
const training: SearchGoal = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Тренировка",
  month: "2026-09",
  description: "Разминка",
  tracking: { type: "check" },
  cadence: { period: "week", targetOccurrences: 2 },
  deletedAt: null,
};
const water: SearchGoal = {
  ...training,
  id: "22222222-2222-4222-8222-222222222222",
  title: "Вода",
  tracking: { type: "quantity", targetValue: 1500, comparison: "atLeast", unit: "мл" },
};
const results: SearchPage = {
  results: [25, 18].map((day) => ({
    id: `entry:${training.id}:2026-09-${day}`,
    kind: "entry",
    goal: training,
    date: `2026-09-${day}`,
    entry: {
      date: `2026-09-${day}`,
      value: true,
      met: true,
      note: "После разминки колено не беспокоило.",
      createdAt: 1,
      updatedAt: 1,
    },
    match: "note",
  })),
  total: 2,
  counts: { goals: 0, entries: 2 },
  today: "2026-10-07",
  nextOffset: null,
  suggestion: null,
};
function EntryPoint() {
  const search = usePlannerSearch();
  return (
    <>
      <button type="button" onClick={search?.openSearch}>
        Открыть поиск
      </button>
      <Outlet />
    </>
  );
}
function Harness() {
  return (
    <PlannerSearchProvider month={useParams().month ?? "2026-10"}>
      <EntryPoint />
    </PlannerSearchProvider>
  );
}
const disposers: (() => void)[] = [];
function setup() {
  const router = createMemoryRouter(
    [
      {
        path: "/plans/:month",
        element: <Harness />,
        children: [
          { index: true, element: <p>План</p> },
          { path: "trash", element: <p>Корзина</p> },
        ],
      },
    ],
    { initialEntries: ["/plans/2026-10"] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  disposers.push(() => {
    router.dispose();
    client.clear();
  });
  return { user: userEvent.setup(), router };
}
async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Открыть поиск" }));
  return screen.findByRole("combobox", { name: "Поиск по целям и заметкам" }, { timeout: 5000 });
}
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  vi.mocked(getApiSearchGoals).mockResolvedValue({ goals: [training, water] });
  vi.mocked(getApiSearch).mockResolvedValue(results);
});
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.resetAllMocks();
});

describe("search flow", () => {
  it("opens with Cmd/Ctrl+K, focuses the input and restores focus on Escape", async () => {
    const { user } = setup();
    screen.getByRole("button", { name: "Открыть поиск" }).focus();
    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole(
      "combobox",
      { name: "Поиск по целям и заметкам" },
      { timeout: 5000 },
    );
    await waitFor(() => expect(input).toHaveFocus());
    expect(getApiSearch).not.toHaveBeenCalled();
    await user.keyboard("{Meta>}k{/Meta}");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Открыть поиск" })).toHaveFocus();
  });

  it("selects with arrows, opens the exact historical day and retains the search on return", async () => {
    const { user, router } = setup();
    const input = await open(user);
    await user.type(input, "колено");
    await screen.findByRole("listbox", { name: "Результаты поиска" });
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/plans/2026-09"));
    expect(new URLSearchParams(router.state.location.search).get("date")).toBe("2026-09-18");
    expect(new URLSearchParams(router.state.location.search).get("goal")).toBe(training.id);
    const restored = await open(user);
    expect(restored).toHaveValue("колено");
    await user.click(screen.getByRole("button", { name: "Очистить запрос" }));
    expect(await screen.findByText("НЕДАВНИЕ ЗАПРОСЫ")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Очистить историю" }));
    expect(screen.queryByText("НЕДАВНИЕ ЗАПРОСЫ")).not.toBeInTheDocument();
  });

  it("prevents a late response from replacing results for a newer query", async () => {
    let finish: ((page: SearchPage) => void) | undefined;
    vi.mocked(getApiSearch).mockImplementation((params) =>
      params?.q === "колено"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve({
            ...results,
            results: results.results.slice(0, 1).map((result) => ({ ...result, goal: water })),
          }),
    );
    const { user } = setup();
    const input = await open(user);
    await user.type(input, "колено");
    await waitFor(() => expect(finish).toBeDefined());
    await user.clear(input);
    await user.type(input, "вода");
    const list = await screen.findByRole("listbox", { name: "Результаты поиска" });
    expect(within(list).getByRole("option", { name: /Вода/ })).toBeInTheDocument();
    await act(async () => finish?.(results));
    expect(within(list).queryByRole("option", { name: /Тренировка/ })).not.toBeInTheDocument();
  });

  it("applies filters without submit and clears incompatible conditions for missing entries", async () => {
    const { user } = setup();
    await open(user);
    await user.click(screen.getByRole("button", { name: "Фильтры поиска" }));
    await waitFor(() => expect(screen.getByLabelText("Цель")).toBeEnabled());
    await user.selectOptions(screen.getByLabelText("Цель"), water.id);
    await user.selectOptions(screen.getByLabelText("Сравнение"), "lt");
    await user.type(screen.getByLabelText("Значение, мл"), "1200");
    await waitFor(() =>
      expect(getApiSearch).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: "entries",
          goalId: water.id,
          comparison: "lt",
          value: "1200",
        }),
        undefined,
        expect.any(AbortSignal),
      ),
    );
    await user.selectOptions(screen.getByLabelText("Наличие записи"), "missing");
    expect(screen.getByLabelText("Выполнение")).toBeDisabled();
    expect(screen.getByLabelText("Заметка")).toBeDisabled();
    expect(screen.getByLabelText("Сравнение")).toHaveValue("any");
    await waitFor(() =>
      expect(getApiSearch).toHaveBeenLastCalledWith(
        expect.objectContaining({ presence: "missing", met: "any", note: "any" }),
        undefined,
        expect.any(AbortSignal),
      ),
    );
    expect(vi.mocked(getApiSearch).mock.lastCall?.[0]).not.toHaveProperty("comparison");
  });

  it("keeps the query on error and retries the same request", async () => {
    vi.mocked(getApiSearch).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(results);
    const { user } = setup();
    await user.type(await open(user), "колено");
    expect(await screen.findByText("Не удалось загрузить результаты")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Поиск по целям и заметкам" })).toHaveValue(
      "колено",
    );
    await user.click(screen.getByRole("button", { name: "Повторить" }));
    await screen.findByRole("listbox", { name: "Результаты поиска" });
    expect(getApiSearch).toHaveBeenCalledTimes(2);
  });

  it("opens mobile details and returns to the same results; filters use their own screen", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const { user } = setup();
    await user.type(await open(user), "колено");
    const list = await screen.findByRole("listbox", { name: "Результаты поиска" });
    await user.click(within(list).getByRole("option", { name: /25 сентября/ }));
    expect(screen.getByRole("region", { name: "Предпросмотр результата" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Тренировка" })).toHaveFocus());
    expect(screen.queryByRole("listbox", { name: "Результаты поиска" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Результаты" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("listbox", { name: "Результаты поиска" })).getByRole("option", {
          name: /25 сентября/,
        }),
      ).toHaveFocus(),
    );
    expect(screen.getByRole("combobox", { name: "Поиск по целям и заметкам" })).toHaveValue(
      "колено",
    );
    await user.click(screen.getByRole("button", { name: "Фильтры поиска" }));
    expect(screen.getByRole("heading", { name: "Фильтры" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Фильтры" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: /К результатам ·/ }));
    expect(screen.getByRole("listbox", { name: "Результаты поиска" })).toBeInTheDocument();
  });

  it("keeps the loaded page when loading more fails and retries without duplicating results", async () => {
    vi.mocked(getApiSearch)
      .mockResolvedValueOnce({ ...results, results: results.results.slice(0, 1), nextOffset: 1 })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ...results, results: results.results.slice(1) });
    const { user } = setup();
    await user.type(await open(user), "колено");
    await screen.findByRole("listbox", { name: "Результаты поиска" });
    await user.click(screen.getByRole("button", { name: "Показать ещё" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не удалось загрузить следующую страницу",
    );
    expect(
      within(screen.getByRole("listbox", { name: "Результаты поиска" })).getAllByRole("option"),
    ).toHaveLength(1);
    expect(screen.getByRole("combobox", { name: "Поиск по целям и заметкам" })).toHaveValue(
      "колено",
    );
    await user.click(screen.getByRole("button", { name: "Показать ещё" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("listbox", { name: "Результаты поиска" })).getAllByRole("option"),
      ).toHaveLength(2),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Показать ещё" })).not.toBeInTheDocument();
    expect(getApiSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 1 }),
      undefined,
      expect.any(AbortSignal),
    );
  });
});
