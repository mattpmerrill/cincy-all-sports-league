import { describe, expect, it } from "vitest";
import { standingsSearchSchema } from "./schemas";

describe("standingsSearchSchema", () => {
  it("defaults to the season table", () => {
    expect(standingsSearchSchema.parse({})).toEqual({ view: "season" });
  });

  it("accepts the two views", () => {
    expect(standingsSearchSchema.parse({ view: "matchups" })).toEqual({ view: "matchups" });
    expect(standingsSearchSchema.parse({ view: "season" })).toEqual({ view: "season" });
  });

  it("falls back to the season table for anything else", () => {
    for (const view of ["Matchups", "all", "", ["matchups", "season"], null, 3]) {
      expect(standingsSearchSchema.parse({ view }), String(view)).toEqual({ view: "season" });
    }
  });
});
