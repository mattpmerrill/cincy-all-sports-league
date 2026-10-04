import { formatPoints } from "@/domain/league/format";
import { rankMovement } from "@/domain/standings";
import { MESSAGE_MAX_LENGTH } from "./body";
import type {
  LeaguePayload,
  MatchupsWeekPayload,
  MatchupsWeekResult,
  MoverItem,
  MoversPayload,
  ScoreUpdateItem,
  ScoreUpdatePayload,
} from "./types";

/** The builders return their own payload type, so callers can read it without narrowing. */
export type LeaguePost<P extends LeaguePayload = LeaguePayload> = { body: string; payload: P };

const EPSILON = 1e-9;
const MAX_PAYLOAD_ITEMS = 40;
/** Leave room under the 500 character limit for the "and N more" tail. */
const BODY_BUDGET = MESSAGE_MAX_LENGTH - 24;

const signed = (n: number) => `${n > 0 ? "+" : "-"}${formatPoints(Math.abs(n))}`;

/** Adds pieces to a comma list until the budget runs out, then says how many were left out. */
function joinWithinBudget(
  prefix: string,
  pieces: readonly string[],
  budget: number = BODY_BUDGET,
): string {
  let text = prefix;
  let used = 0;
  for (const piece of pieces) {
    const next = `${used === 0 ? "" : ", "}${piece}`;
    if (text.length + next.length > budget && used > 0) break;
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
export function buildScoreUpdatePost(
  changes: readonly ScoreUpdateItem[],
): LeaguePost<ScoreUpdatePayload> | null {
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
): LeaguePost<MoversPayload> | null {
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

export type MatchupsWeekInput = Omit<MatchupsWeekPayload, "type">;

/**
 * Gains to show for a decided matchup. Two decimals read best, but a close finish can round to the
 * same text ("1.23 to 1.23") for a matchup somebody won; then it shows up to four decimals, the
 * precision points are stored at, until the two differ.
 */
function gainTexts(winnerGain: number, loserGain: number): [string, string] {
  for (const decimals of [2, 3, 4]) {
    const scale = 10 ** decimals;
    const [w, l] = [winnerGain, loserGain].map((g) => String(Math.round(g * scale) / scale));
    if (w !== l || winnerGain === loserGain) return [w as string, l as string];
  }
  return [formatPoints(winnerGain), formatPoints(loserGain)];
}

const resultPiece = (r: MatchupsWeekResult): string => {
  if (r.outcome === "tie") {
    return `${r.home.name} and ${r.away.name} tied at ${formatPoints(r.homeGain)}`;
  }
  const [winner, loser, winnerGain, loserGain] =
    r.outcome === "home"
      ? [r.home, r.away, r.homeGain, r.awayGain]
      : [r.away, r.home, r.awayGain, r.homeGain];
  const [winnerText, loserText] = gainTexts(winnerGain, loserGain);
  return `${winner.name} beat ${loser.name} ${winnerText} to ${loserText}`;
};

/** Cuts to `max` UTF-16 units (the unit the message limit counts) without splitting a surrogate pair. */
function cutAtCodePoints(text: string, max: number): string {
  let out = "";
  for (const char of text) {
    if (out.length + char.length > max) break;
    out += char;
  }
  return out;
}

/**
 * Splits a character budget between two parts that each want their full length: both fit when they
 * can, otherwise the shorter one keeps all of its text and the longer one gets the rest, and two
 * long ones share equally. Neither part ever starves the other.
 */
function splitBudget(total: number, first: number, second: number): [number, number] {
  if (first + second <= total) return [total, total];
  const half = Math.floor(total / 2);
  if (first <= half) return [first, total - first];
  if (second <= half) return [total - second, second];
  return [half, half];
}

/**
 * The Monday rollover post, e.g. "Last week: Sher Bear beat Papie 12.4 to 8, Coop Doggies and Dirk
 * tied at 0. This week: Sher Bear vs Coop Doggies, Papie vs Dirk." Results keep the order given, as
 * do pairings. Null when there is nothing to say, so a quiet no-op rollover stays silent.
 */
export function buildMatchupsWeekPost(
  input: MatchupsWeekInput,
): LeaguePost<MatchupsWeekPayload> | null {
  const results = input.results.slice(0, MAX_PAYLOAD_ITEMS);
  const pairings = input.pairings.slice(0, MAX_PAYLOAD_ITEMS);
  if (results.length === 0 && pairings.length === 0) return null;

  const resultPieces = results.map(resultPiece);
  const pairingPieces = pairings.map((p) => `${p.home.name} vs ${p.away.name}`);
  const RESULTS_PREFIX = "Last week: ";
  const PAIRINGS_PREFIX = "This week: ";

  // Two sentences share one message, so each gets a slice of the budget. The reserve for the
  // "and N more" tails already sits in BODY_BUDGET; the three characters here are the two full
  // stops and the space between the parts.
  const parts: string[] = [];
  const shared = BODY_BUDGET - 3;
  if (resultPieces.length > 0 && pairingPieces.length > 0) {
    const fullLength = (prefix: string, pieces: string[]) => (prefix + pieces.join(", ")).length;
    const [resultsBudget, pairingsBudget] = splitBudget(
      shared,
      fullLength(RESULTS_PREFIX, resultPieces),
      fullLength(PAIRINGS_PREFIX, pairingPieces),
    );
    parts.push(
      joinWithinBudget(RESULTS_PREFIX, resultPieces, resultsBudget),
      joinWithinBudget(PAIRINGS_PREFIX, pairingPieces, pairingsBudget),
    );
  } else if (resultPieces.length > 0) {
    parts.push(joinWithinBudget(RESULTS_PREFIX, resultPieces, shared));
  } else {
    parts.push(joinWithinBudget(PAIRINGS_PREFIX, pairingPieces, shared));
  }

  const body = `${parts.map((p) => `${p}.`).join(" ")}`;
  return {
    // Team names are free text, so even with the tail reserve a body of absurd names is cut to fit.
    body:
      body.length > MESSAGE_MAX_LENGTH ? `${cutAtCodePoints(body, MESSAGE_MAX_LENGTH - 1)}…` : body,
    payload: { type: "matchups_week", weekStart: input.weekStart, results, pairings },
  };
}
