import type { TeamScore } from "./score-fantasy-team";

export type RankedTeam<T extends TeamScore = TeamScore> = T & {
  rank: number;
  isTied: boolean;
  /** "T1" when tied, otherwise "2". */
  rankLabel: string;
};

/**
 * Equal totals share a rank (competition ranking: 1, 1, 1, 4). Inside a tie the display order is
 * championships, postseason points, sports with points, then team name; those never split the rank.
 */
export function rankStandings<T extends TeamScore>(teams: readonly T[]): RankedTeam<T>[] {
  const sorted = [...teams].sort(
    (a, b) =>
      b.total - a.total ||
      b.championships - a.championships ||
      b.postseasonPoints - a.postseasonPoints ||
      b.sportsWithPoints - a.sportsWithPoints ||
      a.teamName.localeCompare(b.teamName, "en", { sensitivity: "base" }),
  );

  return sorted.map((team) => {
    const higher = sorted.filter((t) => t.total > team.total).length;
    const isTied = sorted.filter((t) => t.total === team.total).length > 1;
    const rank = higher + 1;
    return { ...team, rank, isTied, rankLabel: `${isTied ? "T" : ""}${rank}` };
  });
}

export type RankMovement =
  { direction: "up" | "down"; places: number } | { direction: "same" | "new"; places: 0 };

/** Lower rank number is better, so improving from 5 to 3 is "up" by 2. No previous rank means "new". */
export function rankMovement(
  currentRank: number,
  previousRank: number | null | undefined,
): RankMovement {
  if (previousRank == null) return { direction: "new", places: 0 };
  if (currentRank === previousRank) return { direction: "same", places: 0 };
  return currentRank < previousRank
    ? { direction: "up", places: previousRank - currentRank }
    : { direction: "down", places: currentRank - previousRank };
}
