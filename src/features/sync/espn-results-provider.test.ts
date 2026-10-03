import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SportCode } from "@/domain/sports/sports";
import { ok } from "@/lib/result";

const adapter = vi.hoisted(() => ({
  fetchTeamRecords: vi.fn(),
  fetchPostseasonStages: vi.fn(),
}));

vi.mock("@/integrations/espn", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/espn")>()),
  ...adapter,
}));

import { createEspnResultsProvider } from "./espn-results-provider";

describe("createEspnResultsProvider", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts a bye as reaching the earlier rounds (NFL #1 seed that skipped Wild Card)", async () => {
    adapter.fetchTeamRecords.mockResolvedValue(
      ok([{ espnTeamId: "12", wins: 14, losses: 3, ties: 1, otLosses: 2 }]),
    );
    adapter.fetchPostseasonStages.mockResolvedValue(
      ok([
        { espnTeamId: "12", stage: "divisional" },
        { espnTeamId: "12", stage: "conference_championship" },
      ]),
    );

    const result = await createEspnResultsProvider().fetchFacts({
      sport: "nfl",
      season: 2026,
      externalIds: ["12"],
    });
    if (!result.ok) throw new Error("expected facts");

    expect(result.value.stages?.map((s) => s.stage)).toEqual([
      "wild_card",
      "divisional",
      "conference_championship",
    ]);
    expect(result.value.records).toEqual([
      { externalId: "12", wins: 14, losses: 3, ties: 1, otLosses: 2 },
    ]);
    expect(adapter.fetchTeamRecords).toHaveBeenCalledWith(
      "nfl",
      2026,
      expect.objectContaining({ espnTeamIds: ["12"] }),
    );
  });

  it("only college sports cost one ESPN call per participant", () => {
    const provider = createEspnResultsProvider();
    const college: SportCode[] = ["ncaaf", "ncaab", "ncaasb"];
    const leagueWide: SportCode[] = ["nfl", "mlb", "wnba", "wta", "pga"];
    expect(college.map((s) => provider.fetchesPerParticipant(s))).toEqual([true, true, true]);
    expect(leagueWide.every((s) => !provider.fetchesPerParticipant(s))).toBe(true);
  });

  it("returns the adapter's error unchanged so one failing feed fails the sport", async () => {
    adapter.fetchTeamRecords.mockResolvedValue({
      ok: false,
      error: { code: "espn_shape", message: "changed" },
    });
    const result = await createEspnResultsProvider().fetchFacts({
      sport: "nfl",
      season: 2026,
      externalIds: [],
    });
    expect(result).toEqual({ ok: false, error: { code: "espn_shape", message: "changed" } });
    expect(adapter.fetchPostseasonStages).not.toHaveBeenCalled();
  });
});
