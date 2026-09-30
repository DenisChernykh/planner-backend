import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GetApiPlansMonth200GoalsItem } from "@/shared/api";

import { FactInspector } from "./fact-inspector";

const { putFact } = vi.hoisted(() => ({ putFact: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, putApiGoalsGoalIdEntriesDate: putFact };
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
  entries: [{ date: "2026-04-15", value: 2, met: false, note: "Было", createdAt: 1, updatedAt: 1 }],
} as GetApiPlansMonth200GoalsItem;

let overlay = true;
const layoutListeners = new Set<() => void>();

function resizeInspector(nextOverlay: boolean) {
  act(() => {
    overlay = nextOverlay;
    for (const listener of layoutListeners) listener();
  });
}

function InspectorHarness() {
  const [open, setOpen] = useState(true);
  return open ? (
    <FactInspector
      goal={goal}
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
  render(
    <QueryClientProvider client={client}>
      <InspectorHarness />
    </QueryClientProvider>,
  );
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
    putFact.mockResolvedValue({ entry: goal.entries[0] });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("preserves unsaved value and note across mobile and desktop layouts", async () => {
    const user = userEvent.setup();
    renderInspector();
    await user.clear(screen.getByLabelText("Факт за день"));
    await user.type(screen.getByLabelText("Факт за день"), "3");
    await user.clear(screen.getByLabelText("ЗАМЕТКА"));
    await user.type(screen.getByLabelText("ЗАМЕТКА"), "Черновик");

    resizeInspector(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Факт за день")).toHaveValue(3);
    expect(screen.getByLabelText("ЗАМЕТКА")).toHaveValue("Черновик");

    resizeInspector(true);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Факт за день")).toHaveValue(3);
    expect(screen.getByLabelText("ЗАМЕТКА")).toHaveValue("Черновик");
  });

  it("saves the focused note before Escape dismisses the sheet", async () => {
    const user = userEvent.setup();
    renderInspector();
    await user.clear(screen.getByLabelText("ЗАМЕТКА"));
    await user.type(screen.getByLabelText("ЗАМЕТКА"), "Новая заметка");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(putFact).toHaveBeenCalledWith(
        { goalId: "goal-1", date: "2026-04-15" },
        { value: 2, note: "Новая заметка" },
      );
    });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});
