import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/result";

const adapter = vi.hoisted(() => ({
  fetchTeamDirectory: vi.fn(),
  fetchAthleteDirectory: vi.fn(),
}));

vi.mock("@/integrations/espn", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/espn")>()),
  ...adapter,
}));

import { createEspnDirectoryProvider } from "./espn-directory-provider";

const espnEntry = {
  espnId: "29",
  name: "Arizona Diamondbacks",
  shortName: "Diamondbacks",
  logoUrl: null,
  primaryColor: "#aa182c",
};

describe("createEspnDirectoryProvider", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renames the vendor id and reports the rows the adapter left out", async () => {
    adapter.fetchTeamDirectory.mockImplementation(async (_sport, _season, options) => {
      options.onSkip({ espnId: "1195", name: "TBD", reason: "placeholder" });
      return ok([espnEntry]);
    });

    const result = await createEspnDirectoryProvider().fetchDirectory({
      sport: "ncaasb",
      season: 2026,
      knownExternalIds: new Set(),
      athleteLimit: 100,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        entries: [
          {
            externalId: "29",
            name: "Arizona Diamondbacks",
            shortName: "Diamondbacks",
            logoUrl: null,
            primaryColor: "#aa182c",
          },
        ],
        skipped: [{ externalId: "1195", name: "TBD", reason: "placeholder" }],
      },
    });
    expect(adapter.fetchAthleteDirectory).not.toHaveBeenCalled();
  });

  it("sends ranked athlete sports to the athlete directory with the limit and known ids", async () => {
    adapter.fetchAthleteDirectory.mockResolvedValue(ok([]));
    const known = new Set(["9478"]);

    await createEspnDirectoryProvider({ timeoutMs: 5000 }).fetchDirectory({
      sport: "pga",
      season: 2027,
      knownExternalIds: known,
      athleteLimit: 100,
    });

    expect(adapter.fetchAthleteDirectory).toHaveBeenCalledWith(
      "pga",
      2027,
      { limit: 100, knownIds: known },
      { timeoutMs: 5000 },
    );
    expect(adapter.fetchTeamDirectory).not.toHaveBeenCalled();
  });

  it("returns the adapter's error unchanged", async () => {
    const error = { ok: false, error: { code: "espn_timeout", message: "ESPN request failed" } };
    adapter.fetchTeamDirectory.mockResolvedValue(error);
    expect(
      await createEspnDirectoryProvider().fetchDirectory({
        sport: "mlb",
        season: 2026,
        knownExternalIds: new Set(),
        athleteLimit: 100,
      }),
    ).toEqual(error);
  });
});
