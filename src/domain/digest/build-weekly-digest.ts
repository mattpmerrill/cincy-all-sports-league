import { fromUnits, toUnits } from "@/domain/scoring";
import { rankMovement, rankStandings } from "@/domain/standings";
import type { RankMovement, TeamScore } from "@/domain/standings";

/** A team as the digest sees it: scored (with tiebreaker facts) plus a name for its owner. */
export type DigestTeamInput = TeamScore & { ownerName: string | null };

/** The ranks and totals a team had in the snapshot from about a week ago. */
export type WeekAgoRow = { teamId: string; rank: number; totalPoints: number };

export type DigestTeamRow = {
  teamId: string;
  teamName: string;
  ownerName: string | null;
  rank: number;
  rankLabel: string;
  total: number;
  movement: RankMovement;
  /** Points added since the week-ago snapshot; null when the team has no earlier snapshot. */
  pointsGained: number | null;
};

export type WeeklyDigest = {
  /** False when there is no week-ago snapshot at all: no movement can be reported. */
  hasHistory: boolean;
  top5: DigestTeamRow[];
  risers: DigestTeamRow[];
  fallers: DigestTeamRow[];
  /** Present only when the recipient owns a team. */
  recipient: DigestTeamRow | null;
  leagueTotals: { teams: number; totalPoints: number; pointsGained: number | null };
};

const MOVER_LIMIT = 3;
const TOP_LIMIT = 5;

const round2 = (n: number) => Math.round(n * 100) / 100;
const byRank = (a: DigestTeamRow, b: DigestTeamRow) => a.rank - b.rank;

/**
 * Biggest movers first. Ties on places go to whoever also gained more points, then to the better
 * current rank, so the order never depends on input order.
 */
function topMovers(rows: readonly DigestTeamRow[], direction: "up" | "down"): DigestTeamRow[] {
  return rows
    .filter((r) => r.movement.direction === direction)
    .sort(
      (a, b) =>
        b.movement.places - a.movement.places ||
        (b.pointsGained ?? 0) - (a.pointsGained ?? 0) ||
        byRank(a, b) ||
        a.teamName.localeCompare(b.teamName, "en", { sensitivity: "base" }),
    )
    .slice(0, MOVER_LIMIT);
}

export function buildWeeklyDigest(input: {
  current: readonly DigestTeamInput[];
  weekAgo: readonly WeekAgoRow[] | null;
  recipientTeamId?: string | null;
}): WeeklyDigest {
  const { current, weekAgo, recipientTeamId } = input;
  const owners = new Map(current.map((t) => [t.teamId, t.ownerName]));
  const before = new Map((weekAgo ?? []).map((r) => [r.teamId, r]));
  const hasHistory = before.size > 0;

  const rows: DigestTeamRow[] = rankStandings(current).map((team) => {
    const earlier = before.get(team.teamId);
    return {
      teamId: team.teamId,
      teamName: team.teamName,
      ownerName: owners.get(team.teamId) ?? null,
      rank: team.rank,
      rankLabel: team.rankLabel,
      total: team.total,
      movement: rankMovement(team.rank, earlier?.rank),
      pointsGained: earlier
        ? round2(fromUnits(toUnits(team.total) - toUnits(earlier.totalPoints)))
        : null,
    };
  });

  // A brand-new team has no earlier row, so it is excluded from the movers on purpose.
  const gains = rows.flatMap((r) => (r.pointsGained === null ? [] : [r.pointsGained]));
  return {
    hasHistory,
    top5: rows.slice(0, TOP_LIMIT),
    risers: hasHistory ? topMovers(rows, "up") : [],
    fallers: hasHistory ? topMovers(rows, "down") : [],
    recipient: (recipientTeamId && rows.find((r) => r.teamId === recipientTeamId)) || null,
    leagueTotals: {
      teams: rows.length,
      totalPoints: round2(fromUnits(rows.reduce((sum, r) => sum + toUnits(r.total), 0))),
      pointsGained: hasHistory ? round2(gains.reduce((sum, g) => sum + g, 0)) : null,
    },
  };
}

/**
 * The one-line story for the subject: someone reaching the top spot beats a bigger climb lower
 * down, then the biggest climb, then simply who leads.
 */
export function digestHeadline(digest: WeeklyDigest): string {
  const name = (r: DigestTeamRow) => r.teamName;
  const leader = digest.top5[0];
  if (!leader) return "Standings update";
  const toTop = digest.risers.find((r) => r.rank === 1);
  if (toTop) return `${name(toTop)} climbs to ${toTop.rankLabel}`;
  const best = digest.risers[0];
  if (best) return `${name(best)} climbs to ${best.rankLabel}`;
  return `${name(leader)} leads at ${leader.rankLabel}`;
}
