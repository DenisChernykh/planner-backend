import { describe, expect, it } from "vitest";

import compiledCss from "./index.css?inline";

const semanticUtilities = [".border-border", ".bg-background", ".text-primary"];

describe("Tailwind Vite integration", () => {
  it("compiles utilities and leaves no Tailwind directives in browser CSS", () => {
    expect(compiledCss).toContain(".min-h-screen");
    expect(compiledCss).not.toMatch(/@(tailwind|theme)\b/);
  });

  it("compiles the shadcn semantic color utilities for consumers", () => {
    for (const utility of semanticUtilities) {
      expect(compiledCss).toContain(utility);
    }
  });

  it("does not retain legacy hard-coded page colors", () => {
    expect(compiledCss).not.toContain("#18181b");
    expect(compiledCss).not.toContain("#fafafa");
  });
});
