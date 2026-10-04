/**
 * The single owner of a weekly head-to-head matchup: its shape, its states and its outcomes.
 * Matchups are bragging rights only. They read season totals but never feed back into scoring or
 * standings (ADR-001), so nothing in `domain/scoring` or `domain/standings` may import this module.
 */

/** Which side of a matchup a team is on. The better-ranked team at pairing time is "home". */
export const MATCHUP_SIDES = ["home", "away"] as const;
export type MatchupSideKey = (typeof MATCHUP_SIDES)[number];

export const opposite = (side: MatchupSideKey): MatchupSideKey =>
  side === "home" ? "away" : "home";

/** A matchup is live until the next Monday rollover writes end points, then final. */
export type MatchupStatus = "live" | "final";

/** One team's outcome in a final matchup. */
export const MATCHUP_RESULTS = ["win", "loss", "tie"] as const;
export type MatchupResult = (typeof MATCHUP_RESULTS)[number];

/** One team's end of a matchup, as stored: season totals frozen at the rollovers. */
export type MatchupSide = {
  teamId: string;
  /** The team's season total when the week opened. */
  startPoints: number;
  /** The team's season total when the week closed, or null while the matchup is live. */
  endPoints: number | null;
};

/**
 * A matchup as the pages read it. Plain JSON-safe values only, because the cached read hands
 * these across Next's data cache. The database keeps both end totals set or both null, so a
 * matchup is final exactly when the end points exist.
 */
export type Matchup = {
  id: string;
  seasonId: string;
  /** ISO date (YYYY-MM-DD) of the Monday that opens the week. */
  weekStart: string;
  home: MatchupSide;
  away: MatchupSide;
  /** ISO instant the week closed, or null while live. */
  finalizedAt: string | null;
};

/**
 * Every failure `roll_matchup_week` can return. These are the message tokens the function raises
 * (same spelling on purpose, so the repository maps them one to one). The service builds the
 * arguments from validated data, so most of them mean a bug or a race rather than a user mistake;
 * the messages are safe to log or show.
 */
export const MATCHUP_ERROR_CODES = [
  "invalid_week_start",
  "season_not_found",
  "week_out_of_order",
  "invalid_pairings",
  "duplicate_team",
  "invalid_finals",
  "missing_final",
] as const;
export type MatchupErrorCode = (typeof MATCHUP_ERROR_CODES)[number];

export const isMatchupErrorCode = (value: string): value is MatchupErrorCode =>
  (MATCHUP_ERROR_CODES as readonly string[]).includes(value);

/** Same shape as `AppError` in `lib/result` (domain cannot import lib), so it can travel in a `Result`. */
export type MatchupError = { code: MatchupErrorCode; message: string };

export const MATCHUP_MESSAGES: Record<MatchupErrorCode, string> = {
  invalid_week_start: "That week does not start on a Monday.",
  season_not_found: "That season does not exist.",
  week_out_of_order: "A later week already has matchups, so an earlier one cannot be added.",
  invalid_pairings: "The pairings were not in the shape the database expects.",
  duplicate_team: "A team can only play one matchup a week.",
  invalid_finals: "The closing totals were not in the shape the database expects.",
  missing_final: "An open matchup has no closing total for one of its teams.",
};
