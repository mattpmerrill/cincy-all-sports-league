import type { ParticipantScore, ScoreTotals } from "@/domain/scoring";
import { rankMovement, rankStandings, scoreFantasyTeam } from "@/domain/standings";
import type { RankMovement, RankedTeam, TeamScore } from "@/domain/standings";
import { SPORT_CODES } from "@/domain/sports/sports";
import type { SportCode } from "@/domain/sports/sports";
import { creditPick } from "./credit-pick";
import type { PickAdjustment } from "./credit-pick";
import { createParticipantScorer } from "./participant-scorer";
import { seasonStatus } from "./season-status";
import type { SeasonStatus } from "./season-status";
import type {
  LeagueData,
  OwnerData,
  ParticipantData,
  SnapshotData,
  SportSeasonData,
} from "./types";

export type ScoredPick = {
  sport: SportCode;
  participant: ParticipantData;
  /** The participant's full live score: its breakdown lines explain where points came from. */
  score: ParticipantScore;
  /** What the team is credited for this pick; team totals and rankings use this, never `score`. */
  credited: ScoreTotals;
  adjustment: PickAdjustment;
};

export type SportInfo = SportSeasonData & { status: SeasonStatus };

export type StandingRow = RankedTeam<
  TeamScore & { slug: string; owner: OwnerData | null; picks: ScoredPick[] }
> & { movement: RankMovement };

/** One team's pick in a sport, ranked against the other picks in that sport. */
export type SportPickRow = {
  rank: number;
  rankLabel: string;
  isTied: boolean;
  teamId: string;
  teamName: string;
  teamSlug: string;
  owner: OwnerData | null;
  participant: ParticipantData;
  score: ParticipantScore;
  /** What the team is credited for; the rows are ranked by `credited.total`. */
  credited: ScoreTotals;
  adjustment: PickAdjustment;
};

export type LeagueModel = {
  seasonName: string;
  updatedAt: string | null;
  sports: Record<SportCode, SportInfo>;
  standings: StandingRow[];
  /** Every team's pick per sport, ranked by that sport's points; duplicates stay one row per team. */
  sportPicks: Record<SportCode, SportPickRow[]>;
};

/** Ranks from the most recent snapshot day before `today`, so movement compares against the past. */
export function previousRanks(
  snapshots: readonly SnapshotData[],
  today: string,
): Map<string, number> {
  const earlier = snapshots.filter((s) => s.date < today);
  const latest = earlier.reduce<string | null>(
    (max, s) => (max === null || s.date > max ? s.date : max),
    null,
  );
  return new Map(earlier.filter((s) => s.date === latest).map((s) => [s.teamId, s.rank]));
}

/**
 * Scores the whole league from facts. Pure and cheap (20 teams x 11 picks), so the cache holds raw
 * data and every page derives its view from this one function.
 */
export function buildLeagueModel(data: LeagueData, today: string): LeagueModel {
  const championshipRuleSport = new Map<string, SportCode>();
  for (const { sport, rule } of data.rules)
    if (rule.isChampionship && rule.kind === "playoff_milestone")
      championshipRuleSport.set(rule.id, sport);

  const sportSeason = new Map(data.sports.map((s) => [s.code, s]));
  const sportOf = (code: SportCode) => {
    const found = sportSeason.get(code);
    if (!found) throw new Error(`Sport "${code}" has no season_sports row`);
    return found;
  };

  const championSports = new Set<SportCode>();
  // The rule knows its sport; going through picks would miss a champion nobody holds (a free agent).
  for (const r of data.results) {
    const sport = championshipRuleSport.get(r.ruleId);
    if (sport) championSports.add(sport);
  }

  const sports = Object.fromEntries(
    SPORT_CODES.map((code) => {
      const s = sportOf(code);
      return [
        code,
        { ...s, status: seasonStatus(s.startsOn, s.endsOn, today, championSports.has(code)) },
      ];
    }),
  ) as Record<SportCode, SportInfo>;

  const scorePick = createParticipantScorer(data);

  const teams = data.teams.map((team) => {
    const picks: ScoredPick[] = team.picks.map((p) => {
      const score = scorePick(p.sport, p.participant.id);
      return {
        sport: p.sport,
        participant: p.participant,
        score,
        ...creditPick(team, p, score),
      };
    });
    return {
      ...scoreFantasyTeam({
        id: team.id,
        name: team.name,
        picks: picks.map(({ sport, credited }) => ({ sport, score: credited })),
      }),
      slug: team.slug,
      owner: team.owner,
      picks,
    };
  });

  const previous = previousRanks(data.snapshots, today);
  const standings = rankStandings(teams).map((row) => ({
    ...row,
    movement: rankMovement(row.rank, previous.get(row.teamId)),
  }));

  const sportPicks = Object.fromEntries(
    SPORT_CODES.map((code) => {
      const rows = standings.flatMap((row) =>
        row.picks
          .filter((p) => p.sport === code)
          .map((p) => ({
            teamId: row.teamId,
            teamName: row.teamName,
            teamSlug: row.slug,
            owner: row.owner,
            participant: p.participant,
            score: p.score,
            credited: p.credited,
            adjustment: p.adjustment,
          })),
      );
      return [code, rankPicks(rows)];
    }),
  ) as Record<SportCode, SportPickRow[]>;

  return {
    seasonName: data.season.name,
    updatedAt: data.lastSyncAt,
    sports,
    standings,
    sportPicks,
  };
}

/** Competition ranking (1, 1, 3) by credited points, ties listed by team name. */
export function rankPicks(
  rows: Omit<SportPickRow, "rank" | "rankLabel" | "isTied">[],
): SportPickRow[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.credited.total - a.credited.total ||
      a.teamName.localeCompare(b.teamName, "en", { sensitivity: "base" }),
  );
  return sorted.map((row) => {
    const rank = sorted.filter((r) => r.credited.total > row.credited.total).length + 1;
    const isTied = sorted.filter((r) => r.credited.total === row.credited.total).length > 1;
    return { ...row, rank, isTied, rankLabel: `${isTied ? "T" : ""}${rank}` };
  });
}
