const ZONE = "America/New_York";

/** Monday 08:00 Eastern, after the weekend's games are final. */
export const SEND_HOUR_ET = 8;

export type WeekWindow = {
  /** ISO date (YYYY-MM-DD) of the Monday that starts the Eastern week containing `now`. */
  weekStart: string;
  /** True from Monday 08:00 Eastern onward (the rest of that week counts as late, not early). */
  pastSendTime: boolean;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

/**
 * Derived from Eastern wall-clock parts, never from a fixed UTC offset, so it holds across the
 * daylight-saving changes. That matters because two pg_cron jobs (12:00 and 13:00 UTC) cover
 * 08:00 in both EDT and EST: in winter the 12:00 UTC firing is 07:00 Eastern and must be a no-op.
 */
export function weekWindow(now: Date): WeekWindow {
  const parts = Object.fromEntries(formatter.formatToParts(now).map((p) => [p.type, p.value]));
  const isoWeekday = WEEKDAYS.indexOf(parts.weekday as (typeof WEEKDAYS)[number]); // Mon = 0
  const hour = Number(parts.hour);

  // Calendar arithmetic on the Eastern date, done in UTC so no offset can shift the day.
  const monday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  monday.setUTCDate(monday.getUTCDate() - isoWeekday);

  return {
    weekStart: monday.toISOString().slice(0, 10),
    pastSendTime: isoWeekday > 0 || hour >= SEND_HOUR_ET,
  };
}

/** ISO date minus whole days ("2026-09-28", 7 -> "2026-09-21"). */
export function subtractDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
