import { easternWeekdayShort, formatEasternTime } from "@/domain/calendar";
import { opposite, type Game, type GameSideKey } from "./types";

export type GameLineTone =
  | "upcoming"
  | "live"
  | "win"
  | "loss"
  | "tie"
  /** Over, but no result we can read (a final with no scores). */
  | "final"
  /** Postponed or canceled: nothing will be played at this time. */
  | "off";

export type GameLine = {
  tone: GameLineTone;
  /** The headline: "1:00 PM", "24–17", "W 24–17", "Postponed". */
  text: string;
  /** The vendor's extra words, when they add something: "Q3 4:12", "Final/OT". */
  detail: string | null;
};

export type DescribeOptions = {
  /** Put the weekday in front of a start time ("Sun 1:00 PM"), for lists that span days. */
  withDay?: boolean;
};

const score = (home: number, away: number) => `${home}–${away}`;

function kickoff(game: Game, options: DescribeOptions): string {
  const startsAt = new Date(game.startsAt);
  const when = game.timeTbd ? "TBD" : formatEasternTime(startsAt);
  return options.withDay ? `${easternWeekdayShort(startsAt)} ${when}` : when;
}

/** W, L or T for one side, or null when the game has no readable result. */
export function outcomeFor(game: Game, side: GameSideKey): "win" | "loss" | "tie" | null {
  const mine = game[side];
  const theirs = game[opposite(side)];
  // The vendor's winner flag first: it is right for shootouts and penalty kicks, where the score
  // can be level. Scores only decide when no flag came through.
  if (mine.winner === true) return "win";
  if (theirs.winner === true) return "loss";
  if (mine.score === null || theirs.score === null) return null;
  if (mine.score === theirs.score) return "tie";
  return mine.score > theirs.score ? "win" : "loss";
}

/**
 * A game in words from nobody's point of view: the start time, the live clock, "Final". Used where
 * both sides are shown with their own scores.
 */
export function describeStatus(game: Game, options: DescribeOptions = {}): GameLine {
  switch (game.status) {
    case "scheduled":
      return { tone: "upcoming", text: kickoff(game, options), detail: null };
    case "in_progress":
      return { tone: "live", text: "Live", detail: game.statusDetail };
    case "final":
      // "Final/OT" says it all; "Final" followed by "Final/OT" would say it twice.
      return { tone: "final", text: finalDetail(game) ?? "Final", detail: null };
    case "postponed":
      return { tone: "off", text: "Postponed", detail: null };
    case "canceled":
      return { tone: "off", text: "Canceled", detail: null };
  }
}

/**
 * A game from one side's point of view, which is how a fantasy team reads it: "W 24–17" when the
 * pick won, "L 17–24" when it lost, the score so far while live, or the start time before.
 * Scores are always the pick's first.
 */
export function describeGame(
  game: Game,
  side: GameSideKey,
  options: DescribeOptions = {},
): GameLine {
  const mine = game[side].score;
  const theirs = game[opposite(side)].score;

  switch (game.status) {
    case "in_progress":
      return {
        tone: "live",
        text: mine !== null && theirs !== null ? score(mine, theirs) : "Live",
        detail: game.statusDetail,
      };
    case "final": {
      const outcome = outcomeFor(game, side);
      if (outcome === null) return describeStatus(game, options);
      const letter = outcome === "win" ? "W" : outcome === "loss" ? "L" : "T";
      return {
        tone: outcome,
        text: mine !== null && theirs !== null ? `${letter} ${score(mine, theirs)}` : letter,
        detail: finalDetail(game),
      };
    }
    default:
      return describeStatus(game, options);
  }
}

// "Final" alone adds nothing next to the word Final; "Final/OT" does.
function finalDetail(game: Game): string | null {
  const detail = game.statusDetail?.trim();
  return detail && detail.toLowerCase() !== "final" ? detail : null;
}
