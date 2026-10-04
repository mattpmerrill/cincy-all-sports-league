import { describe, expect, it } from "vitest";
import { formatGain, formatMonthDay, formatPoints } from "./format";

describe("format", () => {
  it("trims points to two decimals", () => {
    expect(formatPoints(25.4)).toBe("25.4");
    expect(formatPoints(12)).toBe("12");
    expect(formatPoints(0.23333)).toBe("0.23");
  });
  it("signs a gain: plus when up, nothing extra at zero or below", () => {
    expect(formatGain(12.5)).toBe("+12.5");
    expect(formatGain(0)).toBe("0");
    expect(formatGain(-3)).toBe("-3");
    expect(formatGain(0.001)).toBe("0");
    expect(formatGain(-0.001)).toBe("0");
  });
  it("formats a month and day without time-zone drift", () => {
    expect(formatMonthDay("2026-10-20")).toBe("Oct 20");
    expect(formatMonthDay("2027-01-01")).toBe("Jan 1");
  });
});
