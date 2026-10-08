import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GetApiPlansMonth200GoalsItem } from "@/shared/api";

import { FactInspector } from "./fact-inspector";

const { putFact, deleteFact } = vi.hoisted(() => ({ putFact: vi.fn(), deleteFact: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return {
    ...actual,
    putApiGoalsGoalIdEntriesDate: putFact,
    deleteApiGoalsGoalIdEntriesDate: deleteFact,
  };
});

const goal = {
  id: "goal-1",
  ownerId: "owner-1",
  month: "2026-04",
  title: "Вода",
  description: null,
  tracking: { type: "quantity", targetValue: 8, comparison: "atLeast" },
  cadence: { period: "day" },
  deletedAt: null,
  createdAt: 1,
  updatedAt: 1,
  entries: [
    {
      revision: "base-revision",
      date: "2026-04-15",
      value: 2,
      met: false,
      note: "Было",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
} as GetApiPlansMonth200GoalsItem;

let overlay = true;
const layoutListeners = new Set<() => void>();

function resizeInspector(nextOverlay: boolean) {
  act(() => {
    overlay = nextOverlay;
    for (const listener of layoutListeners) listener();
  });
}

function InspectorHarness({ current = goal }: { current?: GetApiPlansMonth200GoalsItem }) {
  const [open, setOpen] = useState(true);
  return open ? (
    <FactInspector
      goal={current}
      date="2026-04-15"
      month="2026-04"
      today="2026-04-15"
      onDateChange={vi.fn()}
      onClose={() => setOpen(false)}
    />
  ) : null;
}

function renderInspector() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <InspectorHarness />
    </QueryClientProvider>,
  );
  return {
    rerenderGoal: (current: GetApiPlansMonth200GoalsItem) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <InspectorHarness current={current} />
        </QueryClientProvider>,
      ),
  };
}

describe("FactInspector", () => {
  beforeEach(() => {
    overlay = true;
    layoutListeners.clear();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 1023px)" && overlay,
      media: query,
      addEventListener: (_event: string, listener: () => void) => {
        if (query === "(max-width: 1023px)") layoutListeners.add(listener);
      },
      removeEventListener: (_event: string, listener: () => void) => {
        layoutListeners.delete(listener);
      },
    }));
    putFact.mockReset();
    deleteFact.mockReset();
    deleteFact.mockResolvedValue(undefined);
    putFact.mockImplementation(async (_path, input) => ({
      entry: {
        ...goal.entries[0],
        revision: "saved-revision",
        value: input.value ?? input.completed,
        note: input.note ?? null,
      },
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("preserves unsaved value and note across mobile and desktop layouts", async () => {
    const user = userEvent.setup();
    renderInspector();
    await user.clear(screen.getByLabelText(/Факт за день:/));
    await user.type(screen.getByLabelText(/Факт за день:/), "3");
    await user.clear(screen.getByLabelText("ЗАМЕТКА"));
    await user.type(screen.getByLabelText("ЗАМЕТКА"), "Черновик");

    resizeInspector(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Факт за день:/)).toHaveValue(3);
    expect(screen.getByLabelText("ЗАМЕТКА")).toHaveValue("Черновик");

    resizeInspector(true);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/Факт за день:/)).toHaveValue(3);
    expect(screen.getByLabelText("ЗАМЕТКА")).toHaveValue("Черновик");
  });

  it("asks before Escape dismisses a dirty note and saves only after confirmation", async () => {
    const user = userEvent.setup();
    renderInspector();
    await user.clear(screen.getByLabelText("ЗАМЕТКА"));
    await user.type(screen.getByLabelText("ЗАМЕТКА"), "Новая заметка");
    await user.keyboard("{Escape}");
    expect(putFact).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Сохранить и выйти" }));

    await waitFor(() => {
      expect(putFact).toHaveBeenCalledWith(
        { goalId: "goal-1", date: "2026-04-15" },
        { value: 2, note: "Новая заметка", expectedRevision: "base-revision" },
      );
    });
    await waitFor(() => expect(screen.queryByRole("complementary")).not.toBeInTheDocument());
  });

  it("keeps both draft fields when closing is cancelled, and discards only on an explicit choice", async () => {
    const user = userEvent.setup();
    renderInspector();
    await user.clear(screen.getByLabelText(/Факт за день:/));
    await user.type(screen.getByLabelText(/Факт за день:/), "12");
    await user.clear(screen.getByLabelText("ЗАМЕТКА"));
    await user.type(screen.getByLabelText("ЗАМЕТКА"), "Draft note");
    await user.click(screen.getByRole("button", { name: "Закрыть инспектор" }));
    await user.click(screen.getByRole("button", { name: "Продолжить редактирование" }));
    expect(screen.getByLabelText(/Факт за день:/)).toHaveValue(12);
    expect(screen.getByLabelText("ЗАМЕТКА")).toHaveValue("Draft note");
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await user.click(screen.getByRole("button", { name: "Закрыть инспектор" }));
    await user.click(screen.getByRole("button", { name: "Отказаться от изменений" }));
    expect(putFact).not.toHaveBeenCalled();
  });

  it("preserves a draft through refetch and save failure, and retries with its original revision", async () => {
    const user = userEvent.setup();
    const view = renderInspector();
    await user.clear(screen.getByLabelText(/Факт за день:/));
    await user.type(screen.getByLabelText(/Факт за день:/), "12");
    view.rerenderGoal({
      ...goal,
      entries: [{ ...goal.entries[0]!, value: 40, revision: "external-revision" }],
    });
    expect(screen.getByLabelText(/Факт за день:/)).toHaveValue(12);
    putFact.mockRejectedValueOnce(new Error("offline"));
    await user.click(screen.getByRole("button", { name: "Сохранить результат и заметку" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Черновик сохранён");
    expect(screen.getByLabelText(/Факт за день:/)).toHaveValue(12);
    await user.click(screen.getByRole("button", { name: "Сохранить результат и заметку" }));
    await waitFor(() => expect(putFact).toHaveBeenCalledTimes(2));
    expect(putFact.mock.calls[1]?.[1]).toEqual({
      value: 12,
      note: "Было",
      expectedRevision: "base-revision",
    });
  });

  it("offers an explicit merge of the current value with the draft note after a conflict", async () => {
    const user = userEvent.setup();
    const view = renderInspector();
    await user.clear(screen.getByLabelText("ЗАМЕТКА"));
    await user.type(screen.getByLabelText("ЗАМЕТКА"), "My note");
    view.rerenderGoal({
      ...goal,
      entries: [{ ...goal.entries[0]!, value: 40, revision: "external-revision" }],
    });
    putFact.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { code: "ENTRY_CONFLICT" } },
    });
    await user.click(screen.getByRole("button", { name: "Сохранить результат и заметку" }));
    await user.click(
      await screen.findByRole("button", { name: "Оставить актуальный результат и мою заметку" }),
    );
    expect(screen.getByLabelText(/Факт за день:/)).toHaveValue(40);
    expect(screen.getByLabelText("ЗАМЕТКА")).toHaveValue("My note");
    await user.click(screen.getByRole("button", { name: "Сохранить результат и заметку" }));
    await waitFor(() =>
      expect(putFact).toHaveBeenLastCalledWith(
        { goalId: "goal-1", date: "2026-04-15" },
        { value: 40, note: "My note", expectedRevision: "external-revision" },
      ),
    );
  });

  it("confirms deletion of the result and note and leaves the entry unchanged on cancellation or failure", async () => {
    const user = userEvent.setup();
    renderInspector();
    await user.click(screen.getByRole("button", { name: /^Удалить результат и заметку:/ }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("15 апреля 2026");
    expect(deleteFact).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.getByLabelText("ЗАМЕТКА")).toHaveValue("Было");
    await user.click(screen.getByRole("button", { name: /^Удалить результат и заметку:/ }));
    deleteFact.mockRejectedValueOnce(new Error("offline"));
    await user.click(screen.getByRole("button", { name: "Удалить результат и заметку" }));
    await waitFor(() =>
      expect(deleteFact).toHaveBeenCalledWith(
        { goalId: "goal-1", date: "2026-04-15" },
        { expectedRevision: "base-revision" },
      ),
    );
    await user.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.getByLabelText("ЗАМЕТКА")).toHaveValue("Было");
  });
});
