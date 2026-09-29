import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FieldSeparator } from "./field";

describe("FieldSeparator", () => {
  it("does not render a raw zero when the child has no content", () => {
    const { container } = render(<FieldSeparator>{0}</FieldSeparator>);

    const separator = container.querySelector('[data-slot="field-separator"]');

    expect(separator).toHaveAttribute("data-content", "false");
    expect(separator).toHaveTextContent(/^$/);
  });
});
