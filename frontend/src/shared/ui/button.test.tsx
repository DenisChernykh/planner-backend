import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("renders the ordinary label without busy state", () => {
    render(<Button>Сохранить</Button>);

    const button = screen.getByRole("button", { name: "Сохранить" });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("type", "button");
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button.querySelector('[data-slot="spinner"]')).not.toBeInTheDocument();
  });

  it("shows only a spinner visually while preserving width and accessibility", () => {
    render(
      <Button isLoading loadingLabel="Сохраняем">
        Сохранить
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Сохраняем" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector('[data-slot="spinner"]')).toBeInTheDocument();
    const content = within(button).getByText("Сохранить");
    expect(content).toHaveClass("invisible");
    expect(content).not.toHaveAttribute("style");
    expect(button).not.toHaveAttribute("isloading");
    expect(button).not.toHaveAttribute("loadinglabel");
  });

  it("keeps an explicitly disabled ordinary button disabled", () => {
    render(<Button disabled>Удалить</Button>);

    expect(screen.getByRole("button", { name: "Удалить" })).toBeDisabled();
  });

  it("evaluates a state class callback and merges it with registry and loading classes", () => {
    const stateClassName = vi.fn((state: { disabled: boolean }) =>
      state.disabled ? "state-disabled" : "state-enabled",
    );
    const { rerender } = render(<Button className={stateClassName}>Сохранить</Button>);

    expect(screen.getByRole("button", { name: "Сохранить" })).toHaveClass(
      "bg-primary",
      "relative",
      "state-enabled",
    );
    expect(stateClassName).toHaveBeenCalledWith({ disabled: false });

    rerender(
      <Button isLoading loadingLabel="Сохраняем" className={stateClassName}>
        Сохранить
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Сохраняем" })).toHaveClass(
      "bg-primary",
      "relative",
      "state-disabled",
    );
    expect(stateClassName).toHaveBeenCalledWith({ disabled: true });
  });

  it.each([
    { name: "default", size: undefined, expectedGap: "gap-1.5" },
    { name: "compact", size: "xs" as const, expectedGap: "gap-1" },
  ])("keeps icon and label in the outer $name size gap", ({ size, expectedGap }) => {
    render(
      <Button size={size}>
        <svg data-testid="button-icon" aria-hidden="true" />
        <span>Продолжить</span>
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Продолжить" });
    const content = within(button).getByText("Продолжить").parentElement;
    expect(button).toHaveClass(expectedGap);
    expect(content).toHaveAttribute("data-slot", "button-content");
    expect(content).toHaveClass("contents");
    expect(content).toContainElement(screen.getByTestId("button-icon"));
  });

  it("preserves Base UI custom render and non-native keyboard behavior", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button render={<div />} nativeButton={false} onClick={onClick}>
        Открыть
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Открыть" });
    expect(button.tagName).toBe("DIV");
    button.focus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });
});
