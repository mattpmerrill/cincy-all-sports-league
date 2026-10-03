import { addDays, easternClock, mondayOf } from "@/domain/calendar/week";

/** Monday 08:00 Eastern, after the weekend's games are final. */
export const SEND_HOUR_ET = 8;

export type WeekWindow = {
  /** ISO date (YYYY-MM-DD) of the Monday that starts the Eastern week containing `now`. */
  weekStart: string;
  /** True from Monday 08:00 Eastern onward (the rest of that week counts as late, not early). */
  pastSendTime: boolean;
};

/**
 * Derived from Eastern wall-clock parts (see `domain/calendar/week`), never from a fixed UTC
 * offset, so it holds across the daylight-saving changes. That matters because two pg_cron jobs
 * (12:00 and 13:00 UTC) cover 08:00 in both EDT and EST: in winter the 12:00 UTC firing is 07:00
 * Eastern and must be a no-op.
 */
export function weekWindow(now: Date): WeekWindow {
  const { date, hour, weekday } = easternClock(now);
  return {
    weekStart: mondayOf(date),
    pastSendTime: weekday > 0 || hour >= SEND_HOUR_ET,
  };
}

/** ISO date minus whole days ("2026-09-28", 7 -> "2026-09-21"). */
export const subtractDays = (isoDate: string, days: number): string => addDays(isoDate, -days);
