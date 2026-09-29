import { describe, expect, it } from "vitest";
import { normalizeResultInput, type InputRule } from "./result-input";

const rule = (over: Partial<InputRule>): InputRule => ({
  kind: "per_win",
  rankFrom: null,
  rankTo: null,
  ...over,
});
const input = (quantity = "", eventLabel = "") => ({ quantity, eventLabel });

describe("normalizeResultInput", () => {
  it("takes wins and ties as whole counts", () => {
    expect(normalizeResultInput(rule({ kind: "per_win" }), input(" 12 "))).toEqual({
      ok: true,
      value: { quantity: 12, eventLabel: "" },
    });
    for (const bad of ["", "-1", "2.5", "abc", "1000"]) {
      expect(normalizeResultInput(rule({ kind: "per_tie" }), input(bad)).ok).toBe(false);
    }
  });

  it("forces a milestone to quantity 1 and drops any event label", () => {
    expect(
      normalizeResultInput(rule({ kind: "playoff_milestone" }), input("7", "ignored")),
    ).toEqual({ ok: true, value: { quantity: 1, eventLabel: "" } });
  });

  it("requires a named event for a major finish and trims it", () => {
    const major = rule({ kind: "major_finish" });
    expect(normalizeResultInput(major, input("", "  "))).toMatchObject({ ok: false });
    expect(normalizeResultInput(major, input("", " US Open "))).toEqual({
      ok: true,
      value: { quantity: 1, eventLabel: "US Open" },
    });
  });

  it("keeps a rank inside the band's range", () => {
    const band = rule({ kind: "final_rank_band", rankFrom: 6, rankTo: 10 });
    expect(normalizeResultInput(band, input("8"))).toEqual({
      ok: true,
      value: { quantity: 8, eventLabel: "" },
    });
    expect(normalizeResultInput(band, input("11"))).toMatchObject({
      ok: false,
      error: { message: "That rule covers ranks 6 to 10." },
    });
    expect(normalizeResultInput(band, input("0")).ok).toBe(false);
  });
});
