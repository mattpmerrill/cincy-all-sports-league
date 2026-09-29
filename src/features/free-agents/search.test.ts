import { describe, expect, it } from "vitest";
import { filterByName } from "./search";

const rows = [
  { name: "St. Louis Cardinals" },
  { name: "Iga Świątek" },
  { name: "Ludvig Åberg" },
  { name: "Texas Rangers" },
];

describe("filterByName", () => {
  it("returns every row for an empty or blank query", () => {
    expect(filterByName(rows, "")).toHaveLength(4);
    expect(filterByName(rows, "   ")).toHaveLength(4);
  });

  it("matches part of a name without regard to case or extra spaces", () => {
    expect(filterByName(rows, "  LOUIS   card ")).toEqual([{ name: "St. Louis Cardinals" }]);
  });

  it("finds accented names from plain letters, including ones that do not decompose", () => {
    expect(filterByName(rows, "swiatek")).toEqual([{ name: "Iga Świątek" }]);
    expect(filterByName(rows, "aberg")).toEqual([{ name: "Ludvig Åberg" }]);
  });

  it("matches on the name alone and returns nothing when there is no match", () => {
    expect(filterByName(rows, "cardinals texas")).toEqual([]);
  });
});
