import { describe, expect, it } from "vitest";
import type { NewParticipant, StoredParticipant } from "@/data/participants.repository";
import { createLogger } from "@/lib/logger";
import { err, ok } from "@/lib/result";
import { refreshRoster, type RosterDeps } from "./roster";
import type { DirectoryEntry, DirectoryRequest } from "./results-provider";

const entry = (externalId: string, name: string): DirectoryEntry => ({
  externalId,
  name,
  shortName: name.split(" ")[0] ?? name,
  logoUrl: null,
  primaryColor: "#aa182c",
});

const TARGET = { sportId: "sport-mlb", sport: "mlb", espnSeason: 2026 } as const;

/** A tiny in-memory participants table, so a second run sees what the first one wrote. */
function world(
  entries: DirectoryEntry[],
  skipped: { externalId: string; name: string; reason: string }[] = [],
) {
  const table: StoredParticipant[] = [];
  const requests: DirectoryRequest[] = [];
  const deps: RosterDeps = {
    directory: {
      fetchDirectory: async (request) => {
        requests.push(request);
        return ok({ entries, skipped });
      },
    },
    participants: {
      listForSport: async () => [...table],
      insertMany: async (rows: readonly NewParticipant[]) => {
        for (const r of rows)
          table.push({ id: `id-${table.length}`, name: r.name, espnId: r.espnId });
        return rows.length;
      },
    },
    logger: createLogger({ test: true }),
  };
  return { deps, table, requests };
}

describe("refreshRoster", () => {
  it("inserts what ESPN lists and nobody stores, reporting deliberate skips", async () => {
    const w = world(
      [entry("29", "Arizona Diamondbacks"), entry("1", "Baltimore Orioles")],
      [{ externalId: "1195", name: "TBD", reason: "placeholder" }],
    );
    const result = await refreshRoster(w.deps, TARGET);

    expect(result).toEqual({ ok: true, value: { inserted: 2, skipped: 1 } });
    expect(w.table.map((p) => p.espnId)).toEqual(["29", "1"]);
  });

  it("is idempotent: a second run inserts nothing", async () => {
    const w = world([entry("29", "Arizona Diamondbacks"), entry("1", "Baltimore Orioles")]);
    await refreshRoster(w.deps, TARGET);
    const second = await refreshRoster(w.deps, TARGET);

    expect(second).toEqual({ ok: true, value: { inserted: 0, skipped: 0 } });
    expect(w.table).toHaveLength(2);
  });

  it("never renames a stored team and counts a name clash as skipped, not inserted", async () => {
    const w = world([entry("29", "Arizona D-backs"), entry("77", "Texas Rangers")]);
    w.table.push(
      { id: "a", name: "Arizona Diamondbacks", espnId: "29" },
      { id: "b", name: "Texas Rangers", espnId: null },
    );
    const result = await refreshRoster(w.deps, TARGET);

    expect(result).toEqual({ ok: true, value: { inserted: 0, skipped: 1 } });
    expect(w.table.map((p) => p.name)).toEqual(["Arizona Diamondbacks", "Texas Rangers"]);
  });

  it("asks the vendor to skip ids we store, and for the top 100 athletes", async () => {
    const w = world([]);
    w.table.push(
      { id: "a", name: "Known", espnId: "9478" },
      { id: "b", name: "Amateur", espnId: null },
    );
    await refreshRoster(w.deps, { sportId: "s", sport: "pga", espnSeason: 2027 });

    expect(w.requests).toEqual([
      { sport: "pga", season: 2027, knownExternalIds: new Set(["9478"]), athleteLimit: 100 },
    ]);
  });

  it("passes a vendor failure through and writes nothing", async () => {
    const w = world([]);
    w.deps.directory.fetchDirectory = async () => err("espn_shape", "ESPN response changed shape");
    const result = await refreshRoster(w.deps, TARGET);

    expect(result).toEqual({
      ok: false,
      error: { code: "espn_shape", message: "ESPN response changed shape" },
    });
    expect(w.table).toEqual([]);
  });
});
