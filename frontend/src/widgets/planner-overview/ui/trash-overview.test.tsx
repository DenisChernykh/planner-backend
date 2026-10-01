import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import {
  configureApiAdapter,
  getGetApiPlansMonthQueryKey,
  getGetApiRemindersGoalsMonthQueryKey,
} from "@/shared/api";
import { TrashOverview } from "./trash-overview";

const request = vi.fn();
const month = "2026-10";
const goal = {
  id: "00000000-0000-4000-8000-000000000002",
  title: "Вода",
  description: "Два литра в день",
  deletedAt: Date.parse("2026-10-01"),
  entries: [{ date: "2026-10-01", value: 900, note: "После прогулки" }],
};
beforeEach(() => {
  request.mockReset();
  configureApiAdapter(async (config) => ({
    data: await request(config),
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  }));
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(getGetApiPlansMonthQueryKey({ month }), { goals: [] });
  client.setQueryData(getGetApiRemindersGoalsMonthQueryKey({ month }), { goals: [] });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TrashOverview month={month} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

it("restores a listed goal and refreshes trash, plan and reminder data", async () => {
  let goals = [goal];
  request.mockImplementation(async ({ method }: { method: string }) => {
    if (method === "post") {
      goals = [];
      return undefined;
    }
    return { month, goals };
  });
  const client = setup();
  expect(await screen.findByRole("heading", { name: "Вода" })).toBeInTheDocument();
  expect(screen.getByText(/Сохранённых результатов: 1/)).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "Восстановить цель «Вода»" }));
  expect(await screen.findByText("Корзина пуста.")).toBeInTheDocument();
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({ url: `/api/goals/${goal.id}/restore`, method: "post" }),
  );
  expect(client.getQueryState(getGetApiPlansMonthQueryKey({ month }))?.isInvalidated).toBe(true);
  expect(client.getQueryState(getGetApiRemindersGoalsMonthQueryKey({ month }))?.isInvalidated).toBe(
    true,
  );
  client.clear();
});

it("keeps the goal visible when restore fails and lets the user refresh the trash", async () => {
  request.mockImplementation(async ({ method }: { method: string }) => {
    if (method === "post") throw new Error("Unavailable");
    return { month, goals: [goal] };
  });
  const client = setup();
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: "Восстановить цель «Вода»" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось восстановить цель.");
  expect(screen.getByRole("heading", { name: "Вода" })).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "Обновить корзину" }));
  await waitFor(() =>
    expect(request.mock.calls.filter(([config]) => config.method === "get")).toHaveLength(2),
  );
  expect(request.mock.calls.filter(([config]) => config.method === "post")).toHaveLength(1);
  client.clear();
});
