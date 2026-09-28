import { describe, expect, it } from "vitest";
import { multiplyPoints, sumPoints } from "./points";

describe("exact point math", () => {
  it("does not drift where floats do", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the float drift we are avoiding
    expect(multiplyPoints(4.1, 4)).toBe(16.4);
    expect(multiplyPoints(0.3, 97)).toBe(29.1);
    expect(sumPoints([0.1, 0.2])).toBe(0.3);
  });

  it("handles fractional quantities and MLS draw rate", () => {
    expect(multiplyPoints(3, 1.5)).toBe(4.5);
    expect(multiplyPoints(0.2333, 3)).toBe(0.6999);
  });
});
