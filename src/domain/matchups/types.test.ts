import { describe, expect, it } from "vitest";
import { MATCHUP_ERROR_CODES, MATCHUP_MESSAGES, isMatchupErrorCode, opposite } from "./types";

describe("matchup errors", () => {
  it("has a plain message for every code, and none of them uses an em dash", () => {
    for (const code of MATCHUP_ERROR_CODES) {
      expect(MATCHUP_MESSAGES[code].length).toBeGreaterThan(0);
      expect(MATCHUP_MESSAGES[code]).not.toContain("—");
    }
  });

  it("recognizes only the tokens the database function raises", () => {
    expect(isMatchupErrorCode("duplicate_team")).toBe(true);
    expect(isMatchupErrorCode("permission denied")).toBe(false);
  });
});

describe("opposite", () => {
  it("flips the side", () => {
    expect(opposite("home")).toBe("away");
    expect(opposite("away")).toBe("home");
  });
});
