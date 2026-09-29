import { describe, expect, it } from "vitest";
import { possessive, sideEffectsWarning } from "./copy";

describe("possessive", () => {
  it("adds only an apostrophe after an s", () => {
    expect(possessive("St. Louis Cardinals")).toBe("St. Louis Cardinals'");
    expect(possessive("Iga Swiatek")).toBe("Iga Swiatek's");
  });
});

describe("sideEffectsWarning", () => {
  it("says nothing when no trade is touched", () => {
    expect(sideEffectsWarning("Texas Rangers", { listings: 0, offers: 0 })).toBeNull();
  });

  it("words listings and offers together, as in the plan", () => {
    expect(sideEffectsWarning("Texas Rangers", { listings: 1, offers: 1 })).toBe(
      "This also cancels 1 trade listing and withdraws 1 offer that include Texas Rangers.",
    );
  });

  it("names only what is affected and agrees the verb", () => {
    expect(sideEffectsWarning("Texas Rangers", { listings: 2, offers: 0 })).toBe(
      "This also cancels 2 trade listings that include Texas Rangers.",
    );
    expect(sideEffectsWarning("Texas Rangers", { listings: 0, offers: 1 })).toBe(
      "This also withdraws 1 offer that includes Texas Rangers.",
    );
  });
});
