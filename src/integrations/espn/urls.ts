import type { Sport } from "@/domain/sports/sports";

const SITE = "https://site.api.espn.com/apis/site/v2/sports";
// Standings live under /apis/v2, not /apis/site/v2 (the site variant returns an empty shell).
const SITE_V2 = "https://site.api.espn.com/apis/v2/sports";
const CORE = "https://sports.core.api.espn.com/v2/sports";

const path = (s: Pick<Sport, "espnSport" | "espnLeague">) => `${s.espnSport}/${s.espnLeague}`;

export const espnUrls = {
  /** Every team the league lists. `limit=1000` because the default page is far smaller. */
  teams: (s: Sport) => `${SITE}/${path(s)}/teams?limit=1000`,
  coreGroupTeams: (s: Sport, season: number, groupId: number) =>
    `${CORE}/${s.espnSport}/leagues/${s.espnLeague}/seasons/${season}/types/2/groups/${groupId}/teams?limit=1000`,
  coreAthlete: (s: Sport, season: number, athleteId: string) =>
    `${CORE}/${s.espnSport}/leagues/${s.espnLeague}/seasons/${season}/athletes/${encodeURIComponent(athleteId)}`,
  standings: (s: Sport, season: number) => `${SITE_V2}/${path(s)}/standings?season=${season}`,
  teamSchedule: (s: Sport, teamId: string, season: number) =>
    `${SITE}/${path(s)}/teams/${encodeURIComponent(teamId)}/schedule?season=${season}`,
  /** `query` is ESPN's own filter string, e.g. `dates=202604` (a month) or `dates=20260420` (a day). */
  scoreboard: (s: Sport, query: string) => `${SITE}/${path(s)}/scoreboard?${query}&limit=1000`,
  /** One day's games: an ISO date (`2026-10-04`) becomes ESPN's `dates=20261004`. */
  scoreboardDay: (s: Sport, isoDate: string) =>
    `${SITE}/${path(s)}/scoreboard?dates=${isoDate.replaceAll("-", "")}&limit=1000`,
  wtaRankings: (s: Sport) => `${SITE}/${path(s)}/rankings`,
  /** Overall (id 0) FedExCup table for the season. */
  fedexCupStandings: (s: Sport, season: number) =>
    `${CORE}/${s.espnSport}/leagues/${s.espnLeague}/seasons/${season}/types/2/standings/0`,
};
