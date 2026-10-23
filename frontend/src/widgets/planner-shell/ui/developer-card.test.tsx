import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Sidebar, SidebarContent, SidebarProvider, SidebarTrigger } from "@/shared/ui";

import { DeveloperCard } from "./developer-card";

afterEach(() => vi.unstubAllGlobals());

function renderCard(mobile = false) {
  vi.stubGlobal("innerWidth", mobile ? 390 : 1440);
  vi.stubGlobal("matchMedia", () => ({
    matches: mobile,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  return render(
    <SidebarProvider>
      <SidebarTrigger aria-label="Открыть навигацию" />
      <Sidebar>
        <SidebarContent>
          <DeveloperCard />
        </SidebarContent>
      </Sidebar>
      <button type="button">Вне окна</button>
    </SidebarProvider>,
  );
}

describe("developer services", () => {
  it("opens an accessible modal, traps focus and returns it after Escape or close", async () => {
    const user = userEvent.setup();
    renderCard();
    const trigger = screen.getByRole("button", { name: "Обсудить проект" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Привет, я Денис" });
    const close = within(dialog).getByRole("button", { name: "Закрыть окно об авторе" });
    const contact = within(dialog).getByRole("link", { name: "Обсудить проект в Telegram" });
    expect(contact).toHaveAttribute("href", "https://t.me/ChernykDenis");
    expect(contact).toHaveAttribute("rel", "noopener noreferrer");
    await waitFor(() => expect(close).toHaveFocus());
    await user.tab({ shift: true });
    await waitFor(() => expect(contact).toHaveFocus());
    await user.tab();
    await waitFor(() => expect(close).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: "Закрыть окно об авторе" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes only the author dialog and returns to the mobile navigation", async () => {
    const user = userEvent.setup();
    renderCard(true);
    await user.click(screen.getByRole("button", { name: "Открыть навигацию" }));
    const navigation = await screen.findByRole("dialog", { name: "Навигация" });
    const trigger = within(navigation).getByRole("button", { name: "Обсудить проект" });
    await user.click(trigger);
    await screen.findByRole("dialog", { name: "Привет, я Денис" });
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Привет, я Денис" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog", { name: "Навигация" })).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
