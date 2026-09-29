import {
  fetchAthleteDirectory,
  fetchTeamDirectory,
  type DirectoryEntry as EspnDirectoryEntry,
  type DirectorySkip as EspnDirectorySkip,
  type EspnClientOptions,
} from "@/integrations/espn";
import { ok } from "@/lib/result";
import type { DirectoryEntry, DirectoryProvider, DirectorySkip } from "./results-provider";

const toEntry = (e: EspnDirectoryEntry): DirectoryEntry => ({
  externalId: e.espnId,
  name: e.name,
  shortName: e.shortName,
  logoUrl: e.logoUrl,
  primaryColor: e.primaryColor,
});

/** The ESPN implementation: ranked athlete sports read a ranking, every other sport a teams list. */
export function createEspnDirectoryProvider(options: EspnClientOptions = {}): DirectoryProvider {
  return {
    async fetchDirectory({ sport, season, knownExternalIds, athleteLimit }) {
      if (sport === "wta" || sport === "pga") {
        const athletes = await fetchAthleteDirectory(
          sport,
          season,
          { limit: athleteLimit, knownIds: knownExternalIds },
          options,
        );
        if (!athletes.ok) return athletes;
        return ok({ entries: athletes.value.map(toEntry), skipped: [] });
      }

      const skipped: DirectorySkip[] = [];
      const teams = await fetchTeamDirectory(sport, season, {
        ...options,
        onSkip: (s: EspnDirectorySkip) =>
          skipped.push({ externalId: s.espnId, name: s.name, reason: s.reason }),
      });
      if (!teams.ok) return teams;
      return ok({ entries: teams.value.map(toEntry), skipped });
    },
  };
}
