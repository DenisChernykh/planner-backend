import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { putApiProgressSettings } from "@/shared/api";
import { ProgressStartDate } from "./progress-start-date";

vi.mock("@/shared/api", async (original) => ({
  ...(await original<typeof import("@/shared/api")>()),
  putApiProgressSettings: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());
function open() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProgressStartDate startsOn="2026-10-06" />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
describe("shared progress start date", () => {
  it("keeps the draft on failure, retries explicitly and closes only after saving", async () => {
    vi.mocked(putApiProgressSettings)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ startsOn: "2026-10-12", revision: 2 });
    const user = open();
    await user.click(screen.getByRole("button", { name: /Учитываем с/ }));
    fireEvent.change(screen.getByLabelText("Дата начала учёта"), {
      target: { value: "2026-10-12" },
    });
    expect(putApiProgressSettings).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось сохранить дату");
    expect(screen.getByLabelText("Дата начала учёта")).toHaveValue("2026-10-12");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(putApiProgressSettings).toHaveBeenLastCalledWith({ startsOn: "2026-10-12" });
  });
  it("cancels without writing and saves clearing as null", async () => {
    vi.mocked(putApiProgressSettings).mockResolvedValue({ startsOn: null, revision: 2 });
    const user = open();
    await user.click(screen.getByRole("button", { name: /Учитываем с/ }));
    await user.click(screen.getByRole("button", { name: "Учитывать всю историю" }));
    await user.click(screen.getByRole("button", { name: "Отмена" }));
    expect(putApiProgressSettings).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Учитываем с/ }));
    expect(screen.getByLabelText("Дата начала учёта")).toHaveValue("2026-10-06");
    await user.click(screen.getByRole("button", { name: "Учитывать всю историю" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(putApiProgressSettings).toHaveBeenCalledWith({ startsOn: null }));
  });
});
