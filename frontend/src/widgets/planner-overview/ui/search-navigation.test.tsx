import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { GetApiPlansMonth200 } from "@/shared/api";
import type { PlanGridProps } from "./plan-grid-model";
import { PlanOverviewContent } from "./plan-overview-content";

vi.mock("./plan-grid", () => ({
  PlanGrid: ({ weekDates, goals, onSelect, selection }: PlanGridProps) => (
    <div data-goal-id={goals[0]?.id}>
      {weekDates.map((date) => (
        <button
          key={date}
          type="button"
          data-entry-date={date}
          aria-pressed={selection?.date === date}
          onClick={() => onSelect(goals[0]!, date)}
        >
          {date}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("./fact-inspector", () => ({
  FactInspector: ({ date, onClose }: { date: string; onClose: () => void }) => (
    <aside aria-label="Факт">
      <span>{date}</span>
      <button type="button" onClick={onClose}>
        Закрыть факт
      </button>
    </aside>
  ),
}));
const plan: GetApiPlansMonth200 = {
  month: "2026-09",
  today: "2026-09-15",
  goals: [
    {
      id: "goal-search",
      ownerId: "owner",
      title: "Тренировка",
      month: "2026-09",
      description: null,
      tracking: { type: "check" },
      cadence: { period: "day" },
      entries: [],
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    },
  ],
};
function open(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/plans/:month",
        element: <PlanOverviewContent month={plan.month} plan={plan} notice={null} />,
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}
describe("search navigation into a plan", () => {
  it("selects the result's week and day, including another result in the same month", async () => {
    const router = open("/plans/2026-09?goal=goal-search&date=2026-09-05");
    expect(screen.getByRole("complementary", { name: "Факт" })).toHaveTextContent("2026-09-05");
    expect(screen.getByRole("button", { name: "2026-09-05" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await act(() => router.navigate("/plans/2026-09?goal=goal-search&date=2026-09-18"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "2026-09-18" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(screen.getByRole("complementary", { name: "Факт" })).toHaveTextContent("2026-09-18");
    router.dispose();
  });
  it("preserves future-day viewing and clears the deep link when closing the inspector", async () => {
    const router = open("/plans/2026-09");
    fireEvent.click(screen.getByRole("button", { name: "2026-09-18" }));
    expect(await screen.findByRole("complementary", { name: "Факт" })).toHaveTextContent(
      "2026-09-18",
    );
    fireEvent.click(screen.getByRole("button", { name: "Закрыть факт" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(screen.queryByRole("complementary", { name: "Факт" })).not.toBeInTheDocument();
    router.dispose();
  });
});
