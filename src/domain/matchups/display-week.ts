import { matchupStatus } from "./score-matchup";
import type { Matchup } from "./types";

export type DisplayWeek = {
  /** The Monday of the week whose matchups to show. */
  weekStart: string;
  /**
   * True when `weekStart` is an earlier week standing in for the current one, because the Monday
   * rollover has not opened the current week yet (early Monday, or a Monday the job missed).
   */
  awaitingRollover: boolean;
};

/**
 * Which week "this week" means for the pages. A week stays live until the next rollover closes
 * it, so between Monday 00:00 Eastern and the rollover (and for as long as a missed Monday goes
 * uncaught) the calendar's current week has no rows while last week's matchups are still being
 * played out. Showing "nothing this week" then would be wrong.
 *
 * - The current week, when it has any matchup.
 * - Otherwise the latest EARLIER week that still has a live matchup (`awaitingRollover`).
 * - Otherwise the current week, which is then genuinely empty.
 *
 * This is the one owner of "which week is live": the Week page and the matchup table both use it.
 */
export function displayWeek(currentWeekStart: string, matchups: readonly Matchup[]): DisplayWeek {
  if (matchups.some((m) => m.weekStart === currentWeekStart)) {
    return { weekStart: currentWeekStart, awaitingRollover: false };
  }
  const earlierLive = matchups
    .filter((m) => m.weekStart < currentWeekStart && matchupStatus(m) === "live")
    .reduce<string | null>(
      (max, m) => (max === null || m.weekStart > max ? m.weekStart : max),
      null,
    );
  return earlierLive === null
    ? { weekStart: currentWeekStart, awaitingRollover: false }
    : { weekStart: earlierLive, awaitingRollover: true };
}
