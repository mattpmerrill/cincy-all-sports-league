import { easternDateOf } from "@/domain/calendar";
import {
  buildMatchupStandings,
  displayWeek,
  formatMatchupRecordWords,
  matchupStatus,
  pairingSentence,
  resultSentence,
  scoreMatchup,
} from "@/domain/matchups";
import type { Matchup, MatchupResult, MatchupSideKey } from "@/domain/matchups";
import { subtractDays } from "./week-window";

/** A team as the section needs it: the current name, and the season rank that orders the lists. */
export type MatchupsSectionTeam = { teamId: string; teamName: string; rank: number };

/** What the digest hands in beside the teams: the season's matchups and the Monday it is for. */
export type MatchupsSectionInput = {
  matchups: readonly Matchup[];
  /** The Monday the digest goes out for. "Last week" and "this week" are counted from it. */
  weekStart: string;
};

/**
 * One line of the section, already worded. `outcome` is set on the recipient's own finished
 * matchup (so the email can colour it) and null everywhere else, pairings included.
 */
export type DigestMatchupLine = { text: string; outcome: MatchupResult | null };

export type DigestMatchupBlock = {
  title: string;
  /** The recipient's own line first (null when they have no team or no matchup in that week). */
  mine: DigestMatchupLine | null;
  /** The other matchups, cut to the cap. */
  others: DigestMatchupLine[];
  /** How many other matchups the cap left out. */
  moreCount: number;
};

export type DigestMatchupsSection =
  | {
      /** The Monday rollover has not run: last week is still live, so nothing is a result yet. */
      state: "settling";
      message: string;
      linkLabel: string;
    }
  | {
      state: "ready";
      /** Results of the latest week that closed; null when there are none to report as final. */
      lastWeek: DigestMatchupBlock | null;
      /** The pairings the Monday rollover just opened; null when the week has none. */
      thisWeek: DigestMatchupBlock | null;
      /** "Your record: 2 wins, 1 loss, 0 ties"; null without a team or a finished week. */
      recordText: string | null;
      /** Matchups this week, or results when there is no current week: what the link counts. */
      total: number;
      /** What the link to the Week page says. */
      linkLabel: string;
    };

/**
 * How many other matchups each block shows. The recipient's own card comes on top of these, and a
 * 20-team league has ten of each, which pushes "Your team" off the first screen of a phone.
 */
export const OTHER_MATCHUPS_WITH_TEAM = 3;
export const OTHER_MATCHUPS_WITHOUT_TEAM = 4;

export const SETTLING_MESSAGE = "Last week's matchups are still being settled.";
const LIVE_LINK = "Follow the matchups live";
const RESULTS_LINK = "See the full results";

type Placed = { line: DigestMatchupLine; rank: number; mine: boolean };

/**
 * Own line first, then the rest by the better season rank of the pairing (the order the rollover's
 * feed post uses; the sort is stable, so equal ranks keep the repository's order), cut to `cap`.
 */
function toBlock(title: string, items: readonly Placed[], cap: number): DigestMatchupBlock | null {
  if (items.length === 0) return null;
  const others = items.filter((i) => !i.mine).sort((a, b) => a.rank - b.rank);
  return {
    title,
    mine: items.find((i) => i.mine)?.line ?? null,
    others: others.slice(0, cap).map((i) => i.line),
    moreCount: Math.max(0, others.length - cap),
  };
}

/**
 * The matchups section of the Monday digest, decided here so the email only prints it.
 *
 * - Rollover not run (an earlier week is still live and this week has no rows): a one-line
 *   notice, never a score.
 * - Results: the latest week before `weekStart` whose matchups are final AND were closed on or
 *   after `weekStart` (Eastern date). That is last week normally, and still the right week when a
 *   missed Monday meant the rollover closed an older one this morning. A week closed before this
 *   Monday is stale (the Monday after a season ends) and is left out.
 * - Pairings: the live matchups of `weekStart`.
 * - Null when there is nothing to say.
 *
 * Outcomes always come from `scoreMatchup`; nothing here compares totals itself.
 */
export function buildMatchupsSection(
  input: MatchupsSectionInput & {
    teams: readonly MatchupsSectionTeam[];
    recipientTeamId?: string | null;
  },
): DigestMatchupsSection | null {
  const { matchups, teams, weekStart, recipientTeamId } = input;
  if (displayWeek(weekStart, matchups).awaitingRollover) {
    return { state: "settling", message: SETTLING_MESSAGE, linkLabel: LIVE_LINK };
  }

  const byId = new Map(teams.map((t) => [t.teamId, t]));
  const noTotals: ReadonlyMap<string, number> = new Map();
  const cap = recipientTeamId ? OTHER_MATCHUPS_WITH_TEAM : OTHER_MATCHUPS_WITHOUT_TEAM;

  const closedThisMonday = matchups.filter(
    (m) =>
      m.weekStart < weekStart &&
      matchupStatus(m) === "final" &&
      m.finalizedAt !== null &&
      easternDateOf(new Date(m.finalizedAt)) >= weekStart,
  );
  const resultsWeek = closedThisMonday.reduce<string | null>(
    (max, m) => (max === null || m.weekStart > max ? m.weekStart : max),
    null,
  );

  const results: Placed[] = [];
  const pairings: Placed[] = [];
  for (const m of matchups) {
    const home = byId.get(m.home.teamId);
    const away = byId.get(m.away.teamId);
    // A team that left the league cannot be named; skip rather than print a blank.
    if (!home || !away) continue;
    const rank = Math.min(home.rank, away.rank);
    const viewer: MatchupSideKey | null =
      recipientTeamId === m.home.teamId
        ? "home"
        : recipientTeamId === m.away.teamId
          ? "away"
          : null;

    if (m.weekStart === resultsWeek && closedThisMonday.includes(m)) {
      const scored = scoreMatchup(m, noTotals);
      if (scored.state !== "final") continue;
      results.push({
        line: {
          text: resultSentence({
            home: home.teamName,
            away: away.teamName,
            homeGain: scored.home.gain,
            awayGain: scored.away.gain,
            leader: scored.leader,
            viewer,
          }),
          outcome: viewer ? scored[viewer].result : null,
        },
        rank,
        mine: viewer !== null,
      });
    } else if (m.weekStart === weekStart && matchupStatus(m) === "live") {
      pairings.push({
        line: { text: pairingSentence(home.teamName, away.teamName, viewer), outcome: null },
        rank,
        mine: viewer !== null,
      });
    }
  }

  const lastWeek = toBlock(
    resultsWeek === subtractDays(weekStart, 7) ? "Last week's matchups" : "Latest matchup results",
    results,
    cap,
  );
  const thisWeek = toBlock("This week's matchups", pairings, cap);
  if (!lastWeek && !thisWeek) return null;

  const row = recipientTeamId
    ? buildMatchupStandings(teams, matchups).find((r) => r.teamId === recipientTeamId)
    : undefined;
  const played = row ? row.wins + row.losses + row.ties : 0;
  const total = thisWeek ? pairings.length : results.length;
  const cut = (lastWeek?.moreCount ?? 0) + (thisWeek?.moreCount ?? 0) > 0;
  return {
    state: "ready",
    lastWeek,
    thisWeek,
    recordText:
      row && played > 0
        ? `Your record: ${formatMatchupRecordWords(row.wins, row.losses, row.ties)}`
        : null,
    total,
    linkLabel: cut ? `See all ${total} matchups` : thisWeek ? LIVE_LINK : RESULTS_LINK,
  };
}
