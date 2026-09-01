import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateGoalForm } from "./create-goal-form";

const { mutationControl } = vi.hoisted(() => ({
  mutationControl: {
    behavior: "success" as "success" | "error",
    mutate: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock("@/shared/api", async (importOriginal) => {
  const React = await import("react");
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return {
    ...actual,
    usePostApiPlansMonthGoals: (options?: {
      mutation?: { onSuccess?: () => Promise<void> | void };
    }) => {
      const [state, setState] = React.useState({ isPending: false, isError: false });
      return {
        ...state,
        reset: () => {
          mutationControl.reset();
          setState({ isPending: false, isError: false });
        },
        mutate: (variables: unknown) => {
          mutationControl.mutate(variables);
          setState({ isPending: true, isError: false });
          if (mutationControl.behavior === "error") {
            queueMicrotask(() => setState({ isPending: false, isError: true }));
            return;
          }
          void Promise.resolve(options?.mutation?.onSuccess?.()).then(() => {
            setState({ isPending: false, isError: false });
          });
        },
      };
    },
  };
});

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Текущий адрес">{`${location.pathname}${location.hash}`}</output>;
}

function renderForm(
  queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
) {
  const router = createMemoryRouter(
    [
      { path: "/plans/:month/goals/new", element: <CreateGoalForm month="2026-04" /> },
      { path: "/plans/:month", element: <LocationProbe /> },
    ],
    { initialEntries: ["/plans/2026-04/goals/new"] },
  );

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { queryClient, router };
}

describe("CreateGoalForm", () => {
  beforeEach(() => {
    mutationControl.behavior = "success";
    mutationControl.mutate.mockReset();
    mutationControl.reset.mockReset();
  });

  it("switches branches, clears hidden values and posts the exact payload", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByRole("textbox", { name: /Название цели/i }), "  Сон  ");
    await user.click(screen.getByRole("radio", { name: "Количество" }));
    await user.type(screen.getByRole("spinbutton", { name: "Значение" }), "8");
    await user.type(screen.getByRole("textbox", { name: "Единица" }), " часов ");
    await user.click(screen.getByRole("radio", { name: "Время" }));

    expect(screen.queryByRole("spinbutton", { name: "Значение" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Не раньше/i), "22:00");
    await user.click(screen.getByRole("radio", { name: /За неделю/i }));
    await user.type(screen.getByRole("spinbutton", { name: "Повторений" }), "5");
    await user.click(screen.getByRole("button", { name: "Создать цель" }));

    await waitFor(() => expect(mutationControl.mutate).toHaveBeenCalledOnce());
    expect(mutationControl.mutate).toHaveBeenCalledWith({
      pathParams: { month: "2026-04" },
      data: {
        title: "Сон",
        tracking: { type: "time", targetStart: "22:00" },
        cadence: { period: "week", targetOccurrences: 5 },
      },
    });
  });

  it("shows an accessible error and preserves entered values", async () => {
    mutationControl.behavior = "error";
    const user = userEvent.setup();
    renderForm();

    const title = screen.getByRole("textbox", { name: /Название цели/i });
    await user.type(title, "Чтение");
    await user.click(screen.getByRole("button", { name: "Создать цель" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось создать цель");
    expect(title).toHaveValue("Чтение");
  });

  it("keeps the form pending until invalidation and then navigates with a one-time notice", async () => {
    let finishInvalidation: () => void = () => undefined;
    const invalidation = new Promise<void>((resolve) => {
      finishInvalidation = resolve;
    });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    vi.spyOn(queryClient, "invalidateQueries").mockReturnValue(invalidation);
    const user = userEvent.setup();
    renderForm(queryClient);

    await user.type(screen.getByRole("textbox", { name: /Название цели/i }), "Зарядка");
    await user.click(screen.getByRole("button", { name: "Создать цель" }));
    expect(await screen.findByRole("button", { name: "Создаём цель" })).toBeDisabled();
    expect(screen.queryByLabelText("Текущий адрес")).not.toBeInTheDocument();

    await act(async () => finishInvalidation());
    expect(await screen.findByLabelText("Текущий адрес")).toHaveTextContent(
      "/plans/2026-04#notice=goal-created",
    );
  });
});
