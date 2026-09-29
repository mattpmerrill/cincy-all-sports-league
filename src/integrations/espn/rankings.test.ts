import { describe, expect, it } from "vitest";
import fedex from "./__fixtures__/fedex-standings-2026.json";
import { fetchPgaSeasonStandings, rankByPoints } from "./rankings";
import { jsonResponse, scriptedFetch } from "./test-utils";

describe("rankByPoints", () => {
  it("gives tied athletes the same rank and skips the next (1, 2, 2, 4)", () => {
    const ranked = rankByPoints([
      { espnAthleteId: "a", points: 100 },
      { espnAthleteId: "b", points: 300 },
      { espnAthleteId: "c", points: 300 },
      { espnAthleteId: "d", points: 200 },
    ]);
    expect(ranked).toEqual([
      { espnAthleteId: "b", rank: 1 },
      { espnAthleteId: "c", rank: 1 },
      { espnAthleteId: "d", rank: 3 },
      { espnAthleteId: "a", rank: 4 },
    ]);
  });
});

describe("fetchPgaSeasonStandings", () => {
  it("ranks by FedExCup points, taking ids from the athlete ref and dropping unranked players", async () => {
    // Fixture has three scorers plus one player on 0 points and one with no cupPoints stat.
    const { fetchImpl, calls } = scriptedFetch(() => jsonResponse(fedex));
    const result = await fetchPgaSeasonStandings(2026, { fetchImpl });

    expect(calls[0]).toContain("/seasons/2026/types/2/standings/0");
    expect(result).toEqual({
      ok: true,
      value: [
        { espnAthleteId: "9478", rank: 1 },
        { espnAthleteId: "9037", rank: 2 },
        { espnAthleteId: "11119", rank: 3 },
      ],
    });
  });
});
