import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PasswordField } from "./password-field";

describe("PasswordField", () => {
  it("toggles password visibility without losing the value or focus", async () => {
    const user = userEvent.setup();
    render(<PasswordField label="Пароль" autoComplete="current-password" />);

    const input = screen.getByLabelText("Пароль");
    await user.type(input, "secret");
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Показать пароль" }));
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("secret");
    expect(input).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Скрыть пароль" }));
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue("secret");
  });

  it("deduplicates caller and generated description ids in a stable order", () => {
    render(
      <PasswordField
        id="password"
        label="Пароль"
        description="Не менее восьми символов"
        error="Пароль слишком короткий"
        aria-describedby="external-help password-error external-help"
      />,
    );

    expect(screen.getByLabelText("Пароль")).toHaveAttribute(
      "aria-describedby",
      "external-help password-error password-description",
    );
  });

  it("keeps a callback ref stable and forwards its React cleanup", () => {
    const cleanupRef = vi.fn();
    const inputRef = vi.fn(() => cleanupRef);
    const { rerender, unmount } = render(<PasswordField ref={inputRef} label="Пароль" />);

    expect(inputRef).toHaveBeenCalledOnce();

    rerender(<PasswordField ref={inputRef} label="Пароль" />);
    expect(inputRef).toHaveBeenCalledOnce();

    unmount();
    expect(cleanupRef).toHaveBeenCalledOnce();
    expect(inputRef).toHaveBeenCalledOnce();
  });
});
