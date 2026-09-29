import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("merges conditional classes and lets the last Tailwind utility win", () => {
    expect(cn("px-2 text-sm", false, ["px-4", { "font-medium": true }])).toBe(
      "text-sm px-4 font-medium",
    );
  });
});
