import { SPORT_CODES } from "@/domain/sports/sports";
import type { SportCode } from "@/domain/sports/sports";
import type { LeagueData, ResultData, SnapshotData, TeamData } from "./types";

type TeamSpec = {
  id: string;
  /** Sports where this team picks the given participant id instead of its own. */
  sharedPicks?: Partial<Record<SportCode, string>>;
  owner?: TeamData["owner"];
};

/**
 * Small hand-built league for tests: every sport has a 2-point "win" rule, NFL also has a champion
 * milestone, and each team picks its own participant per sport unless `sharedPicks` says otherwise.
 * Test-only; nothing in the app imports it.
 */
export function leagueData(opts: {
  teams: TeamSpec[];
  results?: ResultData[];
  snapshots?: SnapshotData[];
  startsOn?: Partial<Record<SportCode, string>>;
}): LeagueData {
  return {
    season: {
      id: "s1",
      name: "2026-27",
      startsOn: "2026-08-27",
      endsOn: "2027-11-15",
      playoffScoringMode: "cumulative",
    },
    sports: SPORT_CODES.map((code) => ({
      code,
      startsOn: opts.startsOn?.[code] ?? "2026-08-27",
      endsOn: null,
      majorPointsCap: null,
      allowsDuplicatePicks: code === "wnba",
    })),
    rules: [
      ...SPORT_CODES.map((sport, i) => ({
        sport,
        code: "win",
        sortOrder: i,
        rule: {
          kind: "per_win" as const,
          id: `${sport}-win`,
          label: "Win",
          points: 2,
          isChampionship: false,
        },
      })),
      {
        sport: "nfl" as const,
        code: "champion",
        sortOrder: 0,
        rule: {
          kind: "playoff_milestone" as const,
          id: "nfl-champion",
          label: "Super Bowl champion",
          points: 50,
          isChampionship: true,
        },
      },
    ],
    teams: opts.teams.map((t) => ({
      id: t.id,
      slug: t.id,
      name: t.id,
      owner: t.owner ?? null,
      picks: SPORT_CODES.map((sport) => {
        const id = t.sharedPicks?.[sport] ?? `${t.id}-${sport}`;
        return {
          sport,
          participant: { id, name: id, shortName: id, logoUrl: null, primaryColor: null },
        };
      }),
    })),
    results: opts.results ?? [],
    snapshots: opts.snapshots ?? [],
    lastSyncAt: null,
  };
}

/** `wins("a-nfl", 3)` is three wins; a shared id needs the sport: `wins("shared", 5, "wnba")`. */
export const wins = (
  participantId: string,
  quantity: number,
  sport: string = participantId.split("-").pop() ?? "",
): ResultData => ({
  participantId,
  ruleId: `${sport}-win`,
  quantity,
  eventLabel: "",
});
