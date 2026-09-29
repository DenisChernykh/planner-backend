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
        date: "2026-04-15",
        value: true,
        met: true,
        note: "Сохранить заметку",
        createdAt: 1,
        updatedAt: 2,
      },
    });
  });

  it("saves a check immediately and preserves the existing note", async () => {
    const user = userEvent.setup();
    renderQuickFact({ type: "check" });

    await user.click(screen.getByRole("checkbox", { name: "Отметить выполнение" }));

    await waitFor(() =>
      expect(putFact).toHaveBeenCalledWith(
        { goalId: "goal-1", date: "2026-04-15" },
        { completed: true, note: "Сохранить заметку" },
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
        { value: 2.5, note: "Сохранить заметку" },
      ),
    );
  });
});
