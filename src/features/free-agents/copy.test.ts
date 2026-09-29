import { describe, expect, it } from "vitest";
import { possessive } from "./copy";

describe("possessive", () => {
  it("adds only an apostrophe after an s", () => {
    expect(possessive("St. Louis Cardinals")).toBe("St. Louis Cardinals'");
    expect(possessive("Iga Swiatek")).toBe("Iga Swiatek's");
  });
});
