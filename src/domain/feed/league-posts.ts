import { formatPoints } from "@/domain/league/format";
import { rankMovement } from "@/domain/standings";
import { MESSAGE_MAX_LENGTH } from "./body";
import type { MoverItem, ScoreUpdateItem, LeaguePayload } from "./types";

export type LeaguePost = { body: string; payload: LeaguePayload };

const EPSILON = 1e-9;
const MAX_PAYLOAD_ITEMS = 40;
/** Leave room under the 500 character limit for the "and N more" tail. */
const BODY_BUDGET = MESSAGE_MAX_LENGTH - 24;

const signed = (n: number) => `${n > 0 ? "+" : "-"}${formatPoints(Math.abs(n))}`;

/** Adds pieces to a comma list until the budget runs out, then says how many were left out. */
function joinWithinBudget(prefix: string, pieces: readonly string[]): string {
  let text = prefix;
  let used = 0;
  for (const piece of pieces) {
    const next = `${used === 0 ? "" : ", "}${piece}`;
    if (text.length + next.length > BODY_BUDGET && used > 0) break;
    text += next;
    used += 1;
  }
  const left = pieces.length - used;
  return left > 0 ? `${text} and ${left} more` : text;
}

/**
 * One batched post for a whole sync run: one entry per participant, listing the teams that own
 * them, e.g. "Scores update: Utah Utes +4.1 (Sher Bear), San Francisco 49ers +3 (Sher Bear, Papie)".
 * Null when nothing moved, so an unchanged sync stays silent.
 */
export function buildScoreUpdatePost(changes: readonly ScoreUpdateItem[]): LeaguePost | null {
  const items = changes.filter((c) => Math.abs(c.pointsDelta) > EPSILON);
  if (items.length === 0) return null;

  const groups = new Map<string, { name: string; delta: number; teams: string[] }>();
  for (const item of items) {
    const key = `${item.sport}:${item.participantName}`;
    const group = groups.get(key) ?? {
      name: item.participantName,
      delta: item.pointsDelta,
      teams: [],
    };
    group.teams.push(item.teamName);
    groups.set(key, group);
  }
  const pieces = [...groups.values()]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name))
    .map((g) => `${g.name} ${signed(g.delta)} (${g.teams.sort().join(", ")})`);

  const sorted = [...items].sort(
    (a, b) =>
      Math.abs(b.pointsDelta) - Math.abs(a.pointsDelta) ||
      a.participantName.localeCompare(b.participantName) ||
      a.teamName.localeCompare(b.teamName),
  );
  return {
    body: joinWithinBudget("Scores update: ", pieces),
    payload: { type: "score_update", items: sorted.slice(0, MAX_PAYLOAD_ITEMS) },
  };
}

export type RankedTeamRef = { teamId: string; rank: number };
export type CurrentRankedTeam = RankedTeamRef & { teamSlug: string; teamName: string };

/**
 * Daily rank movers, from two ranked standings, e.g. "Movers: Papie ▲2 to T1, Dirk's Sporting
 * Goods ▼1 to T4". Teams without a previous rank are new, not movers. Null when no rank changed.
 */
export function buildMoversPost(
  prev: readonly RankedTeamRef[],
  curr: readonly CurrentRankedTeam[],
  date: string | null = null,
): LeaguePost | null {
  const before = new Map(prev.map((t) => [t.teamId, t.rank]));
  const shared = (rank: number) => curr.filter((t) => t.rank === rank).length > 1;

  const items: MoverItem[] = curr.flatMap((team) => {
    const move = rankMovement(team.rank, before.get(team.teamId));
    if (move.direction === "same" || move.direction === "new") return [];
    return [
      {
        teamSlug: team.teamSlug,
        teamName: team.teamName,
        direction: move.direction,
        places: move.places,
        rank: team.rank,
        rankLabel: `${shared(team.rank) ? "T" : ""}${team.rank}`,
      },
    ];
  });
  if (items.length === 0) return null;

  items.sort(
    (a, b) => b.places - a.places || a.rank - b.rank || a.teamName.localeCompare(b.teamName),
  );
  const pieces = items.map(
    (i) => `${i.teamName} ${i.direction === "up" ? "▲" : "▼"}${i.places} to ${i.rankLabel}`,
  );
  return {
    body: joinWithinBudget("Movers: ", pieces),
    payload: { type: "movers", date, items: items.slice(0, MAX_PAYLOAD_ITEMS) },
  };
}

export type ScoreUpdateGroup = {
  sport: ScoreUpdateItem["sport"];
  participantName: string;
  pointsDelta: number;
  teams: { teamSlug: string; teamName: string }[];
};

/** One row per participant for display: the same real team scoring for three fantasy teams is one line. */
export function groupScoreUpdateItems(items: readonly ScoreUpdateItem[]): ScoreUpdateGroup[] {
  const groups = new Map<string, ScoreUpdateGroup>();
  for (const item of items) {
    const key = `${item.sport}:${item.participantName}`;
    const group = groups.get(key) ?? {
      sport: item.sport,
      participantName: item.participantName,
      pointsDelta: item.pointsDelta,
      teams: [],
    };
    if (!group.teams.some((t) => t.teamSlug === item.teamSlug)) {
      group.teams.push({ teamSlug: item.teamSlug, teamName: item.teamName });
    }
    groups.set(key, group);
  }
  return [...groups.values()];
}
