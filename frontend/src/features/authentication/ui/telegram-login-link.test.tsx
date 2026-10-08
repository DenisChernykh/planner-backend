import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TelegramLoginLink } from "./telegram-login-link";

describe("TelegramLoginLink", () => {
  it("starts the documented Hono Telegram login endpoint", () => {
    render(<TelegramLoginLink />);

    expect(screen.getByRole("link", { name: "Войти через Telegram" })).toHaveAttribute(
      "href",
      "/api/auth/telegram/start",
    );
  });
  it("preserves a local report destination in the login request", () => {
    const returnTo = "/plans/2026-10/progress?period=week&anchor=2026-10-05";
    render(<TelegramLoginLink returnTo={returnTo} />);
    const href =
      screen.getByRole("link", { name: "Войти через Telegram" }).getAttribute("href") ?? "";
    expect(new URL(href, "https://planner.test").searchParams.get("returnTo")).toBe(returnTo);
  });
  it("ignores an external destination", () => {
    render(<TelegramLoginLink returnTo="//evil.example" />);
    expect(screen.getByRole("link", { name: "Войти через Telegram" })).toHaveAttribute(
      "href",
      "/api/auth/telegram/start",
    );
  });
});
