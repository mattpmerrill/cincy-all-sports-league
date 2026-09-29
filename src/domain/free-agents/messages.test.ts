import { describe, expect, it } from "vitest";
import { moveWarning } from "./messages";

describe("moveWarning", () => {
  const none = { listings: 0, offersReceived: 0, offersMade: 0 };

  it("says nothing when no trade is touched", () => {
    expect(moveWarning("Texas Rangers", none)).toBeNull();
  });

  it("names the listing, the offers on it and the mover's own offers separately", () => {
    expect(moveWarning("Texas Rangers", { listings: 1, offersReceived: 2, offersMade: 1 })).toBe(
      "This also cancels 1 trade listing that includes Texas Rangers (and the 2 offers on it) and withdraws your 1 offer that gives Texas Rangers.",
    );
  });

  it("leaves out zero parts and agrees the grammar with each count", () => {
    expect(moveWarning("Texas Rangers", { ...none, listings: 1 })).toBe(
      "This also cancels 1 trade listing that includes Texas Rangers.",
    );
    expect(moveWarning("Texas Rangers", { ...none, listings: 2, offersReceived: 1 })).toBe(
      "This also cancels 2 trade listings that include Texas Rangers (and the 1 offer on them).",
    );
    expect(moveWarning("Texas Rangers", { ...none, offersMade: 2 })).toBe(
      "This also withdraws your 2 offers that give Texas Rangers.",
    );
  });
});
