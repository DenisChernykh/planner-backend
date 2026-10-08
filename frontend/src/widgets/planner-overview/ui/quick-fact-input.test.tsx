import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GetApiPlansMonth200GoalsItem } from "@/shared/api";

import { QuickFactInput } from "./quick-fact-input";

const { putFact } = vi.hoisted(() => ({ putFact: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, putApiGoalsGoalIdEntriesDate: putFact };
});

const baseGoal = {
  id: "goal-1",
  ownerId: "owner-1",
  month: "2026-04",
  title: "Вода",
  description: null,
  cadence: { period: "day" as const },
  deletedAt: null,
  createdAt: 1,
  updatedAt: 1,
  entries: [
    {
      revision: "test-revision",
      date: "2026-04-15",
      value: false,
      met: false,
      note: "  Сохранить заметку  ",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
};

function renderQuickFact(tracking: GetApiPlansMonth200GoalsItem["tracking"]) {
  const goal = { ...baseGoal, tracking } as GetApiPlansMonth200GoalsItem;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <QuickFactInput goal={goal} month="2026-04" today="2026-04-15" onOpenInspector={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("QuickFactInput", () => {
  beforeEach(() => {
    putFact.mockReset();
    putFact.mockResolvedValue({
      entry: {
        revision: "test-revision",
        date: "2026-04-15",
        value: true,
        met: true,
        note: "  Сохранить заметку  ",
        createdAt: 1,
        updatedAt: 2,
      },
    });
  });

  it("saves a check immediately and preserves the existing note", async () => {
    const user = userEvent.setup();
    renderQuickFact({ type: "check" });

    await user.click(screen.getByRole("checkbox", { name: /Отметить выполнение:/ }));

    await waitFor(() =>
      expect(putFact).toHaveBeenCalledWith(
        { goalId: "goal-1", date: "2026-04-15" },
        { completed: true, note: "  Сохранить заметку  ", expectedRevision: "test-revision" },
      ),
    );
  });

  it.each(["blur", "Enter"] as const)("saves a quantity draft on %s", async (trigger) => {
    const user = userEvent.setup();
    renderQuickFact({ type: "quantity", targetValue: 8, comparison: "atLeast", unit: "л" });

    expect(screen.getByText("л")).toBeInTheDocument();
    const input = screen.getByRole("spinbutton", { name: /Ввести факт/ });
    await user.clear(input);
    await user.type(input, "2.5");
    if (trigger === "Enter") {
      await user.keyboard("{Enter}");
    } else {
      fireEvent.blur(input);
    }

    await waitFor(() =>
      expect(putFact).toHaveBeenCalledWith(
        { goalId: "goal-1", date: "2026-04-15" },
        { value: 2.5, note: "  Сохранить заметку  ", expectedRevision: "test-revision" },
      ),
    );
  });
  it("pins a failed draft, revision and note to its original date across midnight and refetch", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const goal: GetApiPlansMonth200GoalsItem = {
      ...baseGoal,
      tracking: { type: "quantity", targetValue: 8, comparison: "atLeast" },
      entries: [{ ...baseGoal.entries[0]!, value: 8 }],
    };
    const content = (today: string, nextGoal = goal) => (
      <QueryClientProvider client={client}>
        <QuickFactInput goal={nextGoal} month="2026-04" today={today} onOpenInspector={vi.fn()} />
      </QueryClientProvider>
    );
    const view = render(content("2026-04-15"));
    const input = screen.getByRole("spinbutton", { name: /Ввести факт/ });
    await user.clear(input);
    await user.type(input, "9");
    putFact.mockRejectedValueOnce(new Error("offline"));
    fireEvent.blur(input);
    await screen.findByRole("button", { name: /Повторить сохранение факта/ });
    view.rerender(
      content("2026-04-16", {
        ...goal,
        entries: [{ ...goal.entries[0]!, value: 3, note: "external", revision: "external" }],
      }),
    );
    expect(input).toHaveValue(9);
    expect(input).toHaveAccessibleName(/15 апреля 2026/);
    await user.click(screen.getByRole("button", { name: /Повторить сохранение факта/ }));
    await waitFor(() =>
      expect(putFact).toHaveBeenLastCalledWith(
        { goalId: "goal-1", date: "2026-04-15" },
        { value: 9, note: "  Сохранить заметку  ", expectedRevision: "test-revision" },
      ),
    );
  });
  it("requires an explicit day for a past month instead of treating its last day as today", () => {
    const client = new QueryClient();
    const goal: GetApiPlansMonth200GoalsItem = { ...baseGoal, tracking: { type: "check" } };
    render(
      <QueryClientProvider client={client}>
        <QuickFactInput goal={goal} month="2026-04" today="2026-05-01" onOpenInspector={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(/В этом месяце нет сегодняшнего дня/)).toBeInTheDocument();
    expect(putFact).not.toHaveBeenCalled();
  });
});
