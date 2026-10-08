import { describe, expect, it } from "vitest";
import { clockAxis } from "./time-axis";

describe("clock chart coordinates", () => {
  it("places 23:50 and 00:10 twenty minutes apart without an average or success criterion", () => {
    const axis = clockAxis(["23:50", "00:10"]);
    expect(axis.unwrap("00:10") - axis.unwrap("23:50")).toBe(20);
    expect(axis.max - axis.min).toBeLessThanOrEqual(120);
    expect(axis.bands).toEqual([]);
  });
  it("keeps a midnight-crossing interval continuous and clips target bands to the visible clock", () => {
    const axis = clockAxis(["23:50", "00:10", "22:30"], "23:00", "01:00");
    expect(axis.unwrap("00:10") - axis.unwrap("23:50")).toBe(20);
    expect(axis.bands).toEqual([
      { from: 1380, to: 1440 },
      { from: 1440, to: 1500 },
    ]);
  });
  it("preserves the meaning of a one-sided limit on both sides of midnight", () => {
    const axis = clockAxis(["23:20", "00:10"], undefined, "23:30");
    expect(
      axis.bands.some(
        (band) => axis.unwrap("23:20") >= band.from && axis.unwrap("23:20") <= band.to,
      ),
    ).toBe(true);
    expect(
      axis.bands.some(
        (band) => axis.unwrap("00:10") >= band.from && axis.unwrap("00:10") <= band.to,
      ),
    ).toBe(true);
    expect(
      axis.bands.some(
        (band) => axis.unwrap("23:50") >= band.from && axis.unwrap("23:50") <= band.to,
      ),
    ).toBe(false);
  });
});
