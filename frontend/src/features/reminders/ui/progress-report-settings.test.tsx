import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ProgressReportState,
  postApiRemindersProgressReportsPreview,
  putApiRemindersProgressReports,
} from "@/shared/api";
import { ProgressReportSettings } from "./progress-report-settings";

let state: ProgressReportState;
vi.mock("@/shared/api", async (original) => ({
  ...(await original<typeof import("@/shared/api")>()),
  useGetApiRemindersProgressReports: () => ({ data: state, isPending: false, isError: false }),
  useGetApiRemindersSettings: () => ({ data: { deliveryIssues: 0 } }),
  putApiRemindersProgressReports: vi.fn(),
  postApiRemindersProgressReportsPreview: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  state = {
    settings: {
      ownerId: "owner",
      enabled: false,
      wednesdayTime: "21:00",
      sundayTime: "21:00",
      nextWednesdayAt: null,
      nextSundayAt: null,
      revision: 0,
    },
    startsOn: "2026-10-06",
    timeZone: "Asia/Yekaterinburg",
    quietStart: "23:00",
    quietEnd: "08:00",
    connection: "active",
    botAvailable: true,
    state: "disabled",
    nextRuns: [],
    goals: [
      { goalId: "a", title: "Чтение", included: false },
      { goalId: "b", title: "Прогулка", included: false },
    ],
  };
});
function open() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <MemoryRouter>
        <ProgressReportSettings month="2026-10" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
describe("progress report settings", () => {
  it("requires a selected goal for enabling and preserves explicit exclusions when saving", async () => {
    vi.mocked(putApiRemindersProgressReports).mockResolvedValue(state);
    const user = open();
    await user.click(screen.getByRole("checkbox", { name: "Получать отчёты" }));
    expect(screen.getByRole("button", { name: "Сохранить настройки отчётов" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Чтение" }));
    await user.click(screen.getByRole("button", { name: "Сохранить настройки отчётов" }));
    await waitFor(() =>
      expect(putApiRemindersProgressReports).toHaveBeenCalledWith({
        month: "2026-10",
        enabled: true,
        wednesdayTime: "21:00",
        sundayTime: "21:00",
        startsOn: "2026-10-06",
        goals: [
          { goalId: "a", included: true },
          { goalId: "b", included: false },
        ],
      }),
    );
  });
  it("previews unsaved choices without saving and clears stale preview after a draft change", async () => {
    vi.mocked(postApiRemindersProgressReportsPreview).mockResolvedValue({
      message: { text: "Черновик: Чтение", buttons: [] },
      reason: null,
      overview: {
        period: "week",
        requested: { from: "2026-10-05", to: "2026-10-11" },
        actual: { from: "2026-10-07", to: "2026-10-07" },
        today: "2026-10-07",
        asOf: 0,
        timeZone: "Asia/Yekaterinburg",
        startsOn: "2026-10-07",
        partial: true,
        state: "no-entries",
        summary: {
          met: 0,
          dailyRecords: 0,
          dailyDays: 1,
          dailyPercent: 0,
          daysWithEntries: 0,
          eligibleDays: 1,
        },
        goals: [],
      },
    });
    const user = open();
    await user.click(screen.getByRole("checkbox", { name: "Чтение" }));
    fireEvent.change(screen.getByLabelText("Учитывать прогресс с"), {
      target: { value: "2026-10-07" },
    });
    await user.click(screen.getByRole("button", { name: "Показать предпросмотр" }));
    expect(await screen.findByText("Черновик: Чтение")).toBeInTheDocument();
    expect(postApiRemindersProgressReportsPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        startsOn: "2026-10-07",
        slot: "wed",
        goals: [
          { goalId: "a", included: true },
          { goalId: "b", included: false },
        ],
      }),
    );
    expect(putApiRemindersProgressReports).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: "Прогулка" }));
    expect(screen.queryByText("Черновик: Чтение")).not.toBeInTheDocument();
  });
  it("keeps a failed save's draft and allows disabling after the chat disconnects", async () => {
    state.connection = "disconnected";
    state.settings.enabled = true;
    vi.mocked(putApiRemindersProgressReports).mockRejectedValueOnce(new Error("offline"));
    const user = open();
    await user.click(screen.getByRole("checkbox", { name: "Получать отчёты" }));
    await user.click(screen.getByRole("checkbox", { name: "Прогулка" }));
    await user.click(screen.getByRole("button", { name: "Сохранить настройки отчётов" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Черновик сохранён в форме");
    expect(screen.getByRole("checkbox", { name: "Прогулка" })).toBeChecked();
    expect(putApiRemindersProgressReports).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
    expect(screen.getByRole("checkbox", { name: "Получать отчёты" })).toBeDisabled();
  });
});
