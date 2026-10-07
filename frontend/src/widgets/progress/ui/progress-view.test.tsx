import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ProgressOverview, useGetApiProgress } from "@/shared/api";
import { GoalFilter } from "./goal-filter";
import { ProgressView } from "./progress-view";

const refetch = vi.fn();
let mode: "ready" | "future" | "error";
const overview: ProgressOverview = {
  period: "week",
  requested: { from: "2026-10-05", to: "2026-10-11" },
  actual: { from: "2026-10-06", to: "2026-10-07" },
  today: "2026-10-07",
  asOf: 0,
  timeZone: "Asia/Yekaterinburg",
  startsOn: "2026-10-06",
  partial: true,
  state: "ready",
  summary: {
    met: 1,
    dailyRecords: 1,
    dailyDays: 2,
    dailyPercent: 50,
    daysWithEntries: 1,
    eligibleDays: 2,
  },
  goals: [
    {
      id: "goal-a",
      goalIds: ["goal-a"],
      chainId: "goal-a",
      title: "Чтение",
      tracking: { type: "quantity", comparison: "atLeast", targetValue: 20, unit: "страниц" },
      cadence: { period: "day" },
      interval: { from: "2026-10-06", to: "2026-10-07" },
      measurable: true,
      eligibleDays: 2,
      records: 1,
      met: 1,
      missing: 1,
      completeness: 50,
      sum: 25,
      average: 25,
      minimum: 25,
      maximum: 25,
      days: [
        { date: "2026-10-06", goalId: "goal-a", state: "met", value: 25 },
        { date: "2026-10-07", goalId: "goal-a", state: "missing", value: null },
      ],
      targets: [
        {
          from: "2026-10-06",
          to: "2026-10-07",
          value: 1,
          target: 2,
          originalTarget: 2,
          accounted: { from: "2026-10-06", to: "2026-10-07" },
          percent: 50,
          overflow: 0,
          reduced: false,
          missingPlan: false,
        },
      ],
      comparison: null,
      comparisonReason: "insufficient-history",
      streak: { current: 1, best: 1 },
    },
  ],
};
vi.mock("@/shared/api", async (original) => ({
  ...(await original<typeof import("@/shared/api")>()),
  useGetApiRemindersSettings: () => ({
    isPending: false,
    isError: false,
    data: { settings: { timeZone: "Asia/Yekaterinburg" } },
    refetch,
  }),
  useGetApiProgress: vi.fn(() => ({
    isPending: false,
    isError: mode === "error",
    data:
      mode === "error"
        ? undefined
        : mode === "future"
          ? { ...overview, startsOn: "2026-12-12", state: "future-start" }
          : overview,
    refetch,
  })),
  useGetApiProgressGoalsGoalId: () => ({ isPending: false, data: overview, refetch }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mode = "ready";
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});
function open(path = "/plans/2026-10/progress?anchor=2026-10-07") {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <ProgressView month="2026-10" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
describe("progress screen", () => {
  it("switches calendar periods through API parameters and exposes fact editing links", async () => {
    const user = open("/plans/2026-10/progress?anchor=2026-10-07&goal=goal-a");
    expect(screen.getByRole("heading", { name: "Чтение" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Изменить" })).toHaveAttribute(
      "href",
      "/plans/2026-10?goal=goal-a&date=2026-10-06",
    );
    expect(screen.getByRole("link", { name: "Внести" })).toHaveAttribute(
      "href",
      "/plans/2026-10?goal=goal-a&date=2026-10-07",
    );
    await user.click(screen.getByRole("button", { name: "Месяц" }));
    expect(useGetApiProgress).toHaveBeenCalledWith(
      expect.objectContaining({ period: "month", anchor: "2026-10-07" }),
      expect.anything(),
    );
    await user.click(screen.getByRole("button", { name: "Неделя" }));
    await user.click(screen.getByRole("button", { name: "Предыдущий период" }));
    expect(useGetApiProgress).toHaveBeenCalledWith(
      expect.objectContaining({ anchor: "2026-09-28" }),
      expect.anything(),
    );
  });
  it("explains future start without showing zero percentages or statistics", () => {
    mode = "future";
    open();
    expect(screen.getByRole("heading", { name: /Учёт начнётся/ })).toBeInTheDocument();
    expect(screen.queryByText("Подтверждённых выполнений")).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });
  it("retries an error without leaving a loading skeleton", async () => {
    mode = "error";
    const user = open();
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить статистику");
    expect(screen.queryByLabelText("Загружаем статистику")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Повторить" }));
    expect(refetch).toHaveBeenCalledTimes(2);
  });
  it("applies a view filter only after confirmation and discards cancelled selection", async () => {
    const apply = vi.fn();
    render(<GoalFilter goals={overview.goals} selected={null} onApply={apply} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Все цели" }));
    await user.click(screen.getByRole("checkbox", { name: "Чтение" }));
    await user.click(screen.getByRole("button", { name: "Закрыть фильтр" }));
    expect(apply).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Все цели" }));
    expect(screen.getByRole("checkbox", { name: "Чтение" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Чтение" }));
    await user.click(screen.getByRole("button", { name: "Применить" }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith([]));
  });
});
