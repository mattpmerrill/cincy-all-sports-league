import { describe, expect, it } from "vitest";
import { pairingSentence, resultSentence } from "./matchup-sentences";

const base = { home: "Sher Bear", away: "Papie" };

describe("resultSentence", () => {
  it("words the neutral result with the winner first, whichever side won", () => {
    expect(resultSentence({ ...base, homeGain: 12.4, awayGain: 8, leader: "home" })).toBe(
      "Sher Bear beat Papie 12.4 to 8",
    );
    expect(resultSentence({ ...base, homeGain: 3, awayGain: 5, leader: "away" })).toBe(
      "Papie beat Sher Bear 5 to 3",
    );
  });

  it("words a tie once, at the shared gain", () => {
    expect(resultSentence({ ...base, homeGain: 4, awayGain: 4, leader: "tied" })).toBe(
      "Sher Bear and Papie tied at 4",
    );
  });

  it("words the viewer's side, keeping the winner's number first in a loss", () => {
    const input = { ...base, homeGain: 12.4, awayGain: 8, leader: "home" } as const;
    expect(resultSentence({ ...input, viewer: "home" })).toBe("You beat Papie 12.4 to 8");
    expect(resultSentence({ ...input, viewer: "away" })).toBe("You lost to Sher Bear 12.4 to 8");
    expect(
      resultSentence({ ...input, leader: "tied", homeGain: 2, awayGain: 2, viewer: "away" }),
    ).toBe("You tied Sher Bear at 2");
  });

  it("widens a near-tie so the two numbers differ", () => {
    expect(resultSentence({ ...base, homeGain: 1.2349, awayGain: 1.2301, leader: "home" })).toBe(
      "Sher Bear beat Papie 1.235 to 1.23",
    );
  });
});

describe("pairingSentence", () => {
  it("names both teams, or the opponent for the owner of a side", () => {
    expect(pairingSentence("Sher Bear", "Papie")).toBe("Sher Bear vs Papie");
    expect(pairingSentence("Sher Bear", "Papie", "home")).toBe("You play Papie this week");
    expect(pairingSentence("Sher Bear", "Papie", "away")).toBe("You play Sher Bear this week");
  });
});
