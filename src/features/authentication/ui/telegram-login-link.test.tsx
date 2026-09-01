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
});
