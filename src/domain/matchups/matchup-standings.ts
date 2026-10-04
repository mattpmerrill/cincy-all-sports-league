import { fromUnits, toUnits } from "@/domain/scoring";
import { matchupStatus, scoreMatchup } from "./score-matchup";
import type { Matchup, MatchupResult } from "./types";
import { MATCHUP_SIDES, opposite } from "./types";

/** A team as the matchup table needs it: its season rank only breaks ties, it never scores. */
export type MatchupStandingTeam = { teamId: string; teamName: string; rank: number };

export type Streak = {
  result: MatchupResult;
  /** Consecutive identical results, counting back from the most recent final week. */
  length: number;
  /** "W3", "L1", "T2". */
  label: string;
};

export type MatchupStandingRow = {
  teamId: string;
  teamName: string;
  /** The team's season standings rank, shown beside the record and used as a tiebreaker. */
  seasonRank: number;
  wins: number;
  losses: number;
  ties: number;
  /** Total weekly points gained across final matchups. Negative when corrections outweigh gains. */
  pointsGained: number;
  /** Null until the team has a final matchup. */
  streak: Streak | null;
  /** The opponent in the live matchup of `currentWeekStart`, or null when there is none. */
  currentOpponentId: string | null;
  rank: number;
  isTied: boolean;
  /** "T1" when tied, otherwise "2". */
  rankLabel: string;
};

const RESULT_LETTER: Record<MatchupResult, string> = { win: "W", loss: "L", tie: "T" };

const NO_TOTALS: ReadonlyMap<string, number> = new Map();

type Played = { weekStart: string; result: MatchupResult; gainUnits: number };
type Tally = { played: Played[]; currentOpponentId: string | null };

/** The streak of a team's results, newest week first. */
function streakOf(newestFirst: readonly Played[]): Streak | null {
  const latest = newestFirst[0];
  if (!latest) return null;
  const length = newestFirst.findIndex((p) => p.result !== latest.result);
  const count = length === -1 ? newestFirst.length : length;
  return { result: latest.result, length: count, label: `${RESULT_LETTER[latest.result]}${count}` };
}

/**
 * The matchup table: W-L-T from final matchups only, the current streak, and the opponent of the
 * live week named by `currentWeekStart` (pass null or omit it when no week is live). Order: more
 * wins, then fewer losses, then more weekly points gained, then better season rank, then name.
 *
 * Positions are shared the way the season standings share them (competition ranking: 1, 1, 3):
 * teams level on wins, losses and points gained share a rank, and season rank and name only order
 * the display inside the tie. A team with no final matchup is 0-0-0 and shares the first rank with
 * every other team in that state, so the page should show an empty state rather than a ranking
 * until a week has closed.
 *
 * Matchup sides naming a team outside `teams` are ignored.
 */
export function buildMatchupStandings(
  teams: readonly MatchupStandingTeam[],
  matchups: readonly Matchup[],
  options: { currentWeekStart?: string | null } = {},
): MatchupStandingRow[] {
  const tallies = new Map<string, Tally>(
    teams.map((t) => [t.teamId, { played: [], currentOpponentId: null }]),
  );

  for (const matchup of matchups) {
    if (matchupStatus(matchup) === "final") {
      const scored = scoreMatchup(matchup, NO_TOTALS);
      if (scored.state !== "final") continue;
      for (const key of MATCHUP_SIDES) {
        const side = scored[key];
        tallies.get(side.teamId)?.played.push({
          weekStart: matchup.weekStart,
          result: side.result,
          gainUnits: toUnits(side.gain),
        });
      }
    } else if (matchup.weekStart === options.currentWeekStart) {
      for (const key of MATCHUP_SIDES) {
        const tally = tallies.get(matchup[key].teamId);
        if (tally) tally.currentOpponentId = matchup[opposite(key)].teamId;
      }
    }
  }

  const rows = teams.map((team) => {
    const { played, currentOpponentId } = tallies.get(team.teamId) ?? {
      played: [],
      currentOpponentId: null,
    };
    const count = (result: MatchupResult) => played.filter((p) => p.result === result).length;
    const gainUnits = played.reduce((sum, p) => sum + p.gainUnits, 0);
    return {
      row: {
        teamId: team.teamId,
        teamName: team.teamName,
        seasonRank: team.rank,
        wins: count("win"),
        losses: count("loss"),
        ties: count("tie"),
        pointsGained: fromUnits(gainUnits),
        streak: streakOf([...played].sort((a, b) => b.weekStart.localeCompare(a.weekStart))),
        currentOpponentId,
      },
      gainUnits,
    };
  });

  /** Negative when `a` is the better record: the part of the order that decides a shared rank. */
  const byRecord = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    b.row.wins - a.row.wins || a.row.losses - b.row.losses || b.gainUnits - a.gainUnits;

  const sorted = [...rows].sort(
    (a, b) =>
      byRecord(a, b) ||
      a.row.seasonRank - b.row.seasonRank ||
      a.row.teamName.localeCompare(b.row.teamName, "en", { sensitivity: "base" }) ||
      a.row.teamId.localeCompare(b.row.teamId),
  );

  return sorted.map((entry) => {
    const rank = sorted.filter((other) => byRecord(other, entry) < 0).length + 1;
    const isTied = sorted.some((other) => other !== entry && byRecord(other, entry) === 0);
    return { ...entry.row, rank, isTied, rankLabel: `${isTied ? "T" : ""}${rank}` };
  });
}
