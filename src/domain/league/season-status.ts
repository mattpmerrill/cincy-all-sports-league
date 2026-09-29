import { formatMonthDay } from "./format";

export type SeasonStatus =
  | { phase: "upcoming"; label: string }
  | { phase: "in_season"; label: string }
  | { phase: "complete"; label: string };

/**
 * Where a sport's season stands. Dates are ISO `YYYY-MM-DD` strings, which compare correctly as
 * text, so there is no time-zone arithmetic to get wrong. `complete` means a champion was
 * recorded or the sport's own end date has passed (a truncated season, like MLS's spring sprint,
 * has no champion to record). Without an end date only the champion decides.
 */
export function seasonStatus(
  startsOn: string,
  endsOn: string | null,
  today: string,
  hasChampion: boolean,
): SeasonStatus {
  if (hasChampion || (endsOn !== null && today > endsOn))
    return { phase: "complete", label: "Final" };
  if (today < startsOn) return { phase: "upcoming", label: `Starts ${formatMonthDay(startsOn)}` };
  return { phase: "in_season", label: "In season" };
}
