import { easternClock, mondayOf, seasonWeeks, stepWeek } from "@/domain/calendar/week";

/**
 * Monday 06:30 Eastern. The weekend's games are final and the 30-minute sync has had its last
 * Sunday-night run, and it is early enough that the rollover lands before the 8 am digest. The
 * pg_cron jobs fire at 06:45 Eastern in both daylight and standard time, so there is a quarter
 * hour of margin on either side.
 */
export const ROLLOVER_HOUR_ET = 6;
export const ROLLOVER_MINUTE_ET = 30;

export type RolloverWindow = {
  /** ISO date (YYYY-MM-DD) of the Monday that starts the Eastern week containing `now`. */
  weekStart: string;
  /** True from Monday 06:30 Eastern onward (every later day of that week counts as due). */
  due: boolean;
};

/**
 * Derived from Eastern wall-clock parts (see `domain/calendar/week`), never from a fixed UTC
 * offset, so it holds across the daylight-saving changes: the same UTC firing is 06:45 in summer
 * and 05:45 in winter, and the winter one must be a no-op. The rest of the week counts as due so
 * a Monday the job missed is caught up by the next daily run.
 */
export function rolloverWindow(now: Date): RolloverWindow {
  const { date, hour, minute, weekday } = easternClock(now);
  const afterCutoff =
    hour > ROLLOVER_HOUR_ET || (hour === ROLLOVER_HOUR_ET && minute >= ROLLOVER_MINUTE_ET);
  return { weekStart: mondayOf(date), due: weekday > 0 || afterCutoff };
}

type SeasonDays = { firstDay: string; lastDay: string };

/** True when `weekStart` is one of the weeks a season covers (see `seasonWeeks`), ends included. */
export function isSeasonWeek(weekStart: string, season: SeasonDays): boolean {
  const { first, last } = seasonWeeks(season.firstDay, season.lastDay);
  return weekStart >= first && weekStart <= last;
}

/**
 * What a rollover for a week should do:
 * - `pair`: the week is one of the season's weeks. Close the previous week and open this one.
 * - `close_only`: the Monday after the season's last week. Close the last week and open nothing.
 * - `skip`: outside the season, or later than the one closing Monday.
 */
export type RolloverAction = "pair" | "close_only" | "skip";

export function rolloverAction(weekStart: string, season: SeasonDays): RolloverAction {
  if (isSeasonWeek(weekStart, season)) return "pair";
  const { last } = seasonWeeks(season.firstDay, season.lastDay);
  return weekStart === stepWeek(last, 1) ? "close_only" : "skip";
}
