import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Container } from "./container";

describe("Container", () => {
  it("renders a div with the stable horizontal layout contract by default", () => {
    render(<Container data-testid="container">Контент</Container>);

    const container = screen.getByTestId("container");
    expect(container.tagName).toBe("DIV");
    expect(container).toHaveAttribute("data-slot", "container");
    expect(container).toHaveClass("container", "mx-auto", "px-4", "sm:px-6", "lg:px-8");
  });

  it("supports a semantic element, native props and class merging", () => {
    render(
      <Container as="main" aria-label="Основное" className="px-8 py-6">
        Контент
      </Container>,
    );

    const container = screen.getByRole("main", { name: "Основное" });
    expect(container).toHaveClass("px-8", "py-6");
    expect(container).not.toHaveClass("px-4");
  });
});
