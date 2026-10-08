import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getGetApiRemindersGoalsMonthQueryKey,
  getGetApiRemindersSettingsQueryKey,
  postApiRemindersTelegramConnect,
  putApiRemindersGoalsGoalId,
  putApiRemindersSettings,
} from "@/shared/api";
import { ExternalNavigationContext } from "@/shared/lib/runtime";
import { GeneralSettings } from "./general-settings";
import { GoalReminder } from "./goal-reminder";
import { ReminderSettings } from "./reminder-settings";
import { TelegramConnection } from "./telegram-connection";

vi.mock("@/shared/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/api")>()),
  putApiRemindersSettings: vi.fn().mockResolvedValue({}),
  putApiRemindersGoalsGoalId: vi.fn().mockResolvedValue({}),
  postApiRemindersTelegramConnect: vi.fn().mockResolvedValue({
    url: "https://t.me/ritm_test_bot?start=connect_test",
    expiresAt: 1_800_000_000_000,
  }),
}));
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}
beforeEach(() => vi.clearAllMocks());
describe("reminder settings", () => {
  it("opens Telegram through the embedded host and reports rejected navigation", async () => {
    const user = userEvent.setup();
    const navigateExternal = vi.fn().mockResolvedValue(undefined);
    render(
      <ExternalNavigationContext value={navigateExternal}>
        <TelegramConnection
          state={{
            connection: "disconnected",
            botAvailable: true,
            deliveryIssues: 0,
            settings: {
              ownerId: "owner",
              nextEveningAt: null,
              enabled: false,
              timeZone: "UTC",
              quietStart: "23:00",
              quietEnd: "08:00",
              eveningTime: "21:00",
            },
          }}
        />
      </ExternalNavigationContext>,
      { wrapper },
    );
    await user.click(screen.getByRole("button", { name: "Подключить Telegram" }));
    const link = await screen.findByRole("link", { name: "Открыть бота в Telegram" });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => {
      link.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(navigateExternal).toHaveBeenCalledWith("https://t.me/ritm_test_bot?start=connect_test");
    expect(postApiRemindersTelegramConnect).toHaveBeenCalledTimes(1);

    navigateExternal.mockRejectedValueOnce(new Error("The host rejected the request"));
    await user.click(link);
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось открыть Telegram");
    expect(postApiRemindersTelegramConnect).toHaveBeenCalledTimes(1);
  });
  it("preserves unsaved fields when Telegram connects and disconnects", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const state = {
      settings: {
        ownerId: "owner",
        enabled: false,
        timeZone: "Asia/Yekaterinburg",
        quietStart: "23:00",
        quietEnd: "08:00",
        eveningTime: "21:00",
        nextEveningAt: null,
      },
      connection: "disconnected",
      botAvailable: true,
      deliveryIssues: 0,
    };
    client.setQueryData(getGetApiRemindersSettingsQueryKey(), state);
    client.setQueryData(getGetApiRemindersGoalsMonthQueryKey({ month: "2026-09" }), { goals: [] });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["?tab=reminders"]}>
          <ReminderSettings month="2026-09" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("checkbox", { name: "Напоминания о заполнении" }));
    await user.clear(screen.getByLabelText("Часовой пояс"));
    await user.type(screen.getByLabelText("Часовой пояс"), "Europe/Moscow");
    for (const connection of ["active", "disconnected"]) {
      await act(async () => {
        client.setQueryData(getGetApiRemindersSettingsQueryKey(), { ...state, connection });
      });
      await waitFor(() =>
        expect(
          screen.getByRole("button", {
            name: connection === "active" ? "Отключить Telegram" : "Подключить Telegram",
          }),
        ).toBeInTheDocument(),
      );
      expect(screen.getByLabelText("Часовой пояс")).toHaveValue("Europe/Moscow");
      expect(screen.getByRole("checkbox", { name: "Напоминания о заполнении" })).toBeChecked();
    }
  });
  it("submits the chosen timezone and times without read-only response fields", async () => {
    const user = userEvent.setup();
    render(
      <GeneralSettings
        initial={{
          enabled: false,
          timeZone: "Asia/Yekaterinburg",
          quietStart: "23:00",
          quietEnd: "08:00",
          eveningTime: "21:00",
        }}
      />,
      { wrapper },
    );
    await user.click(screen.getByRole("checkbox", { name: "Напоминания о заполнении" }));
    await user.clear(screen.getByLabelText("Часовой пояс"));
    await user.type(screen.getByLabelText("Часовой пояс"), "Europe/Moscow");
    await user.click(screen.getByRole("button", { name: "Сохранить настройки" }));
    await waitFor(() =>
      expect(putApiRemindersSettings).toHaveBeenCalledWith({
        enabled: true,
        timeZone: "Europe/Moscow",
        quietStart: "23:00",
        quietEnd: "08:00",
        eveningTime: "21:00",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Настройки сохранены");
  });
  it("saves per-goal weekdays and prevents a schedule without any days", async () => {
    const user = userEvent.setup();
    render(
      <GoalReminder
        month="2026-09"
        goal={{
          goalId: "goal-a",
          title: "Пробуждение",
          mode: "scheduled",
          time: "09:00",
          weekdays: [1, 2],
          nextRunAt: null,
        }}
      />,
      { wrapper },
    );
    await user.click(screen.getByRole("checkbox", { name: "Вт" }));
    await user.click(screen.getByRole("button", { name: "Сохранить напоминание" }));
    await waitFor(() =>
      expect(putApiRemindersGoalsGoalId).toHaveBeenCalledWith(
        { goalId: "goal-a" },
        { mode: "scheduled", time: "09:00", weekdays: [1] },
      ),
    );
    await user.click(screen.getByRole("checkbox", { name: "Пн" }));
    expect(screen.getByRole("button", { name: "Сохранить напоминание" })).toBeDisabled();
  });
  it("explains when the bot is disabled and does not offer a broken connection", () => {
    render(
      <TelegramConnection
        state={{
          connection: "disconnected",
          botAvailable: false,
          deliveryIssues: 0,
          settings: {
            ownerId: "owner",
            nextEveningAt: null,
            enabled: false,
            timeZone: "UTC",
            quietStart: "23:00",
            quietEnd: "08:00",
            eveningTime: "21:00",
          },
        }}
      />,
      { wrapper },
    );
    expect(screen.getByRole("button", { name: "Подключить Telegram" })).toBeDisabled();
    expect(
      screen.getByText("Бот пока не включён. Настройки можно сохранить заранее."),
    ).toBeInTheDocument();
  });
});
