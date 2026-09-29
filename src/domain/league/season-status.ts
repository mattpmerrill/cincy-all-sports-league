import { formatMonthDay } from "./format";

export type SeasonStatus =
  | { phase: "upcoming"; label: string }
  | { phase: "in_season"; label: string }
  | { phase: "complete"; label: string };

/**
 * Where a sport's season stands. Dates are ISO `YYYY-MM-DD` strings, which compare correctly as
 * text, so there is no time-zone arithmetic to get wrong. `complete` comes from the facts (a
 * champion was recorded), not the calendar: seasons have no reliable end date.
 */
export function seasonStatus(startsOn: string, today: string, hasChampion: boolean): SeasonStatus {
  if (hasChampion) return { phase: "complete", label: "Final" };
  if (today < startsOn) return { phase: "upcoming", label: `Starts ${formatMonthDay(startsOn)}` };
  return { phase: "in_season", label: "In season" };
}
