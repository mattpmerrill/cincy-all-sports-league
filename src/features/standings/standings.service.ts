import type { LeagueModelSource } from "@/data/league-model";
import type { OwnerData, SeasonStatus } from "@/domain/league";
import type { RankMovement } from "@/domain/standings";
import { SPORT_CODES } from "@/domain/sports/sports";
import type { SportCode } from "@/domain/sports/sports";

export type LeaderboardRow = {
  teamId: string;
  slug: string;
  name: string;
  owner: OwnerData | null;
  rank: number;
  rankLabel: string;
  isTied: boolean;
  total: number;
  movement: RankMovement;
  /** All 11 sports in catalog order, 0 where nothing has scored, so bars line up across rows. */
  sportPoints: { sport: SportCode; points: number }[];
};

export type Leaderboard = {
  seasonName: string;
  /** ISO time of the last successful sync, null before the first one. */
  updatedAt: string | null;
  progress: {
    total: number;
    inSeason: number;
    complete: number;
    /** One phase per sport in catalog order, for the segmented progress bar. */
    phases: SeasonStatus["phase"][];
  };
  /** Scale for the contribution bars: the biggest single-sport score anywhere on the board. */
  maxSportPoints: number;
  /** Teams with an owner, for the "N of 20 claimed" nudge shown to visitors. */
  claimedTeams: number;
  rows: LeaderboardRow[];
};

export function createStandingsService({ model }: { model: LeagueModelSource }) {
  return {
    /** Null when no season is set up yet. */
    async getLeaderboard(): Promise<Leaderboard | null> {
      const league = await model();
      if (!league) return null;

      const statuses = SPORT_CODES.map((code) => league.sports[code].status.phase);
      const rows = league.standings.map((team) => {
        const bySport = new Map(team.sportSubtotals.map((s) => [s.sport, s.points]));
        return {
          teamId: team.teamId,
          slug: team.slug,
          name: team.teamName,
          owner: team.owner,
          rank: team.rank,
          rankLabel: team.rankLabel,
          isTied: team.isTied,
          total: team.total,
          movement: team.movement,
          sportPoints: SPORT_CODES.map((sport) => ({ sport, points: bySport.get(sport) ?? 0 })),
        };
      });

      return {
        seasonName: league.seasonName,
        updatedAt: league.updatedAt,
        progress: {
          total: SPORT_CODES.length,
          inSeason: statuses.filter((p) => p === "in_season").length,
          complete: statuses.filter((p) => p === "complete").length,
          phases: statuses,
        },
        maxSportPoints: Math.max(0, ...rows.flatMap((r) => r.sportPoints.map((s) => s.points))),
        claimedTeams: rows.filter((r) => r.owner !== null).length,
        rows,
      };
    },
  };
}
