import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TextField } from "./text-field";

describe("TextField", () => {
  it("connects label, description and error to the native input", () => {
    render(
      <TextField
        label="Email"
        description="Рабочий адрес"
        error="Некорректный email"
        name="email"
      />,
    );

    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).toHaveAttribute("name", "email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain("description");
    expect(input.getAttribute("aria-describedby")).toContain("error");
    expect(screen.getByRole("alert")).toHaveTextContent("Некорректный email");
  });

  it("preserves native handlers and a caller aria-describedby without an error", () => {
    const onBlur = vi.fn();
    render(
      <>
        <p id="external-help">Внешняя подсказка</p>
        <TextField label="Имя" aria-describedby="external-help" onBlur={onBlur} />
      </>,
    );

    const input = screen.getByRole("textbox", { name: "Имя" });
    input.focus();
    input.blur();
    expect(onBlur).toHaveBeenCalledOnce();
    expect(input).toHaveAttribute("aria-describedby", "external-help");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("deduplicates caller and generated description ids in a stable order", () => {
    render(
      <TextField
        id="email"
        label="Email"
        description="Рабочий адрес"
        error="Некорректный email"
        aria-describedby="external-help email-description external-help"
      />,
    );

    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute(
      "aria-describedby",
      "external-help email-description email-error",
    );
  });

  it("does not expose ARIA error metadata for an empty error", () => {
    render(<TextField id="email" label="Email" error="" />);

    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
