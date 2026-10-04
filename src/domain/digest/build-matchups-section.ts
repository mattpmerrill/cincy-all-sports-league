import { formatPoints } from "@/domain/league/format";
import {
  buildMatchupStandings,
  formatMatchupRecord,
  gainTexts,
  matchupStatus,
  scoreMatchup,
} from "@/domain/matchups";
import type { Matchup, MatchupResult } from "@/domain/matchups";
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

/** The recipient's own line first (null when they have no team or no matchup in that week). */
export type DigestMatchupBlock = { mine: DigestMatchupLine | null; others: DigestMatchupLine[] };

export type DigestMatchupsSection = {
  /** Results of the week that just closed; null when there are none to report as final. */
  lastWeek: DigestMatchupBlock | null;
  /** The pairings the Monday rollover just opened; null when the week has none. */
  thisWeek: DigestMatchupBlock | null;
  /** "Your matchup record: 2-1-0 (wins, losses, ties)"; null without a team or a finished week. */
  recordText: string | null;
  /** What the link to the Week page says. */
  linkLabel: string;
};

type Placed<T> = { line: T; rank: number; tie: string; mine: boolean };

/** Better-ranked pairing first, then by the home team's name so the order never depends on input. */
function ordered(items: readonly Placed<DigestMatchupLine>[]): DigestMatchupBlock | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort(
    (a, b) => a.rank - b.rank || a.tie.localeCompare(b.tie, "en", { sensitivity: "base" }),
  );
  return {
    mine: sorted.find((i) => i.mine)?.line ?? null,
    others: sorted.filter((i) => !i.mine).map((i) => i.line),
  };
}

/**
 * The matchups section of the Monday digest, decided here so the email only prints it.
 *
 * Last week is exactly the week before `weekStart`, and only its finished matchups. If the Monday
 * rollover has not run, that week is still live and its numbers are not results: it is left out,
 * and with no current week either there is nothing to say (null). Looking only at the week
 * immediately before also keeps a stale result from an old week from posing as "last week" once a
 * season has ended. This week is the live matchups of `weekStart`.
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
  const byId = new Map(teams.map((t) => [t.teamId, t]));
  const lastWeekStart = subtractDays(weekStart, 7);
  const noTotals: ReadonlyMap<string, number> = new Map();

  const lastWeek: Placed<DigestMatchupLine>[] = [];
  const thisWeek: Placed<DigestMatchupLine>[] = [];

  for (const m of matchups) {
    const home = byId.get(m.home.teamId);
    const away = byId.get(m.away.teamId);
    // A team that left the league cannot be named; skip rather than print a blank.
    if (!home || !away) continue;
    const isFinal = matchupStatus(m) === "final";
    const rank = Math.min(home.rank, away.rank);
    const mine = recipientTeamId === m.home.teamId || recipientTeamId === m.away.teamId;
    const me = recipientTeamId === m.home.teamId ? home : away;
    const them = me === home ? away : home;

    if (m.weekStart === lastWeekStart && isFinal) {
      const scored = scoreMatchup(m, noTotals);
      if (scored.state !== "final") continue;
      let line: DigestMatchupLine;
      if (scored.leader === "tied") {
        line = {
          text: mine
            ? `You tied ${them.teamName} at ${formatPoints(scored.home.gain)}`
            : `${home.teamName} and ${away.teamName} tied at ${formatPoints(scored.home.gain)}`,
          outcome: mine ? "tie" : null,
        };
      } else {
        const homeWon = scored.leader === "home";
        const [winner, loser] = homeWon ? [home, away] : [away, home];
        const [winnerGain, loserGain] = homeWon
          ? [scored.home.gain, scored.away.gain]
          : [scored.away.gain, scored.home.gain];
        const [winnerText, loserText] = gainTexts(winnerGain, loserGain);
        const score = `${winnerText} to ${loserText}`;
        if (!mine) {
          line = { text: `${winner.teamName} beat ${loser.teamName} ${score}`, outcome: null };
        } else if (winner === me) {
          line = { text: `You beat ${them.teamName} ${score}`, outcome: "win" };
        } else {
          line = { text: `You lost to ${them.teamName} ${score}`, outcome: "loss" };
        }
      }
      lastWeek.push({ line, rank, tie: home.teamName, mine });
    } else if (m.weekStart === weekStart && !isFinal) {
      thisWeek.push({
        line: {
          text: mine
            ? `You play ${them.teamName} this week`
            : `${home.teamName} vs ${away.teamName}`,
          outcome: null,
        },
        rank,
        tie: home.teamName,
        mine,
      });
    }
  }

  const lastBlock = ordered(lastWeek);
  const thisBlock = ordered(thisWeek);
  if (!lastBlock && !thisBlock) return null;

  const row = recipientTeamId
    ? buildMatchupStandings(teams, matchups).find((r) => r.teamId === recipientTeamId)
    : undefined;
  const played = row ? row.wins + row.losses + row.ties : 0;
  return {
    lastWeek: lastBlock,
    thisWeek: thisBlock,
    recordText:
      row && played > 0
        ? `Your matchup record: ${formatMatchupRecord(row.wins, row.losses, row.ties)} (wins, losses, ties)`
        : null,
    linkLabel: thisBlock ? "Follow the matchups live" : "See the full results",
  };
}
