import { describe, expect, it } from "vitest";
import { gainTexts } from "./gain-texts";

describe("gainTexts", () => {
  it("uses the short form when the two differ at two decimals", () => {
    expect(gainTexts(12.4, 8)).toEqual(["12.4", "8"]);
  });

  it("widens until a close finish reads as two different numbers", () => {
    expect(gainTexts(1.2349, 1.2301)).toEqual(["1.235", "1.23"]);
    expect(gainTexts(1.2344, 1.2341)).toEqual(["1.2344", "1.2341"]);
  });

  it("keeps equal gains equal", () => {
    expect(gainTexts(3, 3)).toEqual(["3", "3"]);
  });

  it("keeps the sign of a negative gain", () => {
    expect(gainTexts(-1, -2.5)).toEqual(["-1", "-2.5"]);
  });
});
