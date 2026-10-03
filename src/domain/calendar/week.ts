import { formatMonthDay } from "@/domain/league/format";

/**
 * The single owner of "the league week": a Monday-to-Sunday span of Eastern calendar days. The
 * league lives in Cincinnati, so every date here is an Eastern wall-clock date, never a UTC one.
 *
 * Dates travel as ISO `YYYY-MM-DD` strings and all day arithmetic runs on UTC calendar fields, so
 * no offset can shift a day. The only time-zone work is `easternClock`, which asks Intl for
 * Eastern wall-clock parts instead of applying a fixed offset: that is what keeps a game at
 * 11:30 pm on the November fall-back Sunday on the right day.
 */

export const LEAGUE_TIME_ZONE = "America/New_York";
export const DAYS_PER_WEEK = 7;

const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAYS_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const clockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: LEAGUE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  // h23, not hour12: some engines print midnight as "24" under h24 and break the arithmetic.
  hourCycle: "h23",
  weekday: "short",
});

export type EasternClock = {
  /** The Eastern calendar date, `YYYY-MM-DD`. */
  date: string;
  /** 0-23 Eastern wall-clock hour. */
  hour: number;
  minute: number;
  /** Monday is 0, Sunday is 6. */
  weekday: number;
};

/**
 * What the clock on an Eastern wall reads at `instant`. Throws a RangeError for an invalid Date,
 * like Intl does; callers hold validated instants.
 */
export function easternClock(instant: Date): EasternClock {
  const parts = Object.fromEntries(
    clockFormat.formatToParts(instant).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS_SHORT.indexOf(parts.weekday as (typeof WEEKDAYS_SHORT)[number]),
  };
}

/** The Eastern calendar date of an instant: which league day a game at that moment belongs to. */
export const easternDateOf = (instant: Date): string => easternClock(instant).date;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const utcMidnight = (isoDate: string): Date => new Date(`${isoDate}T00:00:00Z`);
const toIso = (date: Date): string => date.toISOString().slice(0, 10);

/** True for a real calendar date in `YYYY-MM-DD` form ("2026-02-31" is not one). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = utcMidnight(value);
  return !Number.isNaN(date.getTime()) && toIso(date) === value;
}

/** Whole days added to an ISO date; negative steps back. */
export function addDays(isoDate: string, days: number): string {
  const date = utcMidnight(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/** 0 for Monday through 6 for Sunday. */
export function weekdayIndex(isoDate: string): number {
  return (utcMidnight(isoDate).getUTCDay() + 6) % 7;
}

/** The Monday on or before an ISO date. */
export const mondayOf = (isoDate: string): string => addDays(isoDate, -weekdayIndex(isoDate));

/** The Monday that starts the Eastern week containing `instant`. */
export const easternWeekStart = (instant: Date): string => mondayOf(easternDateOf(instant));

/** The Monday `weeks` weeks after (or, negative, before) a week start. */
export const stepWeek = (weekStart: string, weeks: number): string =>
  addDays(weekStart, weeks * DAYS_PER_WEEK);

/** The seven ISO dates of a week, Monday first. */
export function weekDays(weekStart: string): string[] {
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) => addDays(weekStart, i));
}

/** The first and last week starts a season covers: the Mondays on or before its first and last day. */
export const seasonWeeks = (
  firstDay: string,
  lastDay: string,
): { first: string; last: string } => ({
  first: mondayOf(firstDay),
  last: mondayOf(lastDay),
});

/**
 * Pulls a week start into the weeks a season covers: no earlier than the week of its first day
 * and no later than the week of its last. The Week page uses it so a hand-edited `?week=` cannot
 * walk off into years with no games (and, because each week is a cache entry, cannot grow the
 * cache without bound).
 */
export function clampWeekStart(weekStart: string, firstDay: string, lastDay: string): string {
  const { first, last } = seasonWeeks(firstDay, lastDay);
  if (weekStart < first) return first;
  if (weekStart > last) return last;
  return weekStart;
}

/** True when `value` is a real date that falls on a Monday: the only valid `?week=` value. */
export const isWeekStart = (value: string): boolean =>
  isIsoDate(value) && weekdayIndex(value) === 0;

/**
 * The first instant of an Eastern calendar day. Midnight is never skipped or repeated by a
 * daylight-saving change (those happen at 2 am), so it is 04:00 UTC in daylight time and 05:00 UTC
 * otherwise; whichever one reads 00:00 on the Eastern wall is the answer.
 */
export function easternMidnight(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  for (const utcHour of [4, 5]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, utcHour));
    const clock = easternClock(candidate);
    if (clock.date === isoDate && clock.hour === 0 && clock.minute === 0) return candidate;
  }
  throw new RangeError(`"${isoDate}" is not a calendar date`);
}

/**
 * The half-open span `[from, to)` of instants a week covers, from Monday's first Eastern moment
 * to the next Monday's. A week is 167, 168 or 169 hours long around a clock change.
 */
export function weekInstants(weekStart: string): { from: Date; to: Date } {
  return { from: easternMidnight(weekStart), to: easternMidnight(stepWeek(weekStart, 1)) };
}

export const weekdayShort = (isoDate: string): string =>
  WEEKDAYS_SHORT[weekdayIndex(isoDate)] ?? "";
export const weekdayLong = (isoDate: string): string => WEEKDAYS_LONG[weekdayIndex(isoDate)] ?? "";

/** "Monday, Oct 5": a day section heading. */
export const formatDayHeading = (isoDate: string): string =>
  `${weekdayLong(isoDate)}, ${formatMonthDay(isoDate)}`;

/**
 * "Oct 5 – 11, 2026", "Sep 28 – Oct 4, 2026" or "Dec 28, 2026 – Jan 3, 2027": the year shows once
 * when the week stays inside it and on both ends when it straddles New Year.
 */
export function formatWeekRange(weekStart: string): string {
  const last = addDays(weekStart, DAYS_PER_WEEK - 1);
  const [startYear, startMonth] = weekStart.split("-");
  const [endYear, endMonth] = last.split("-");
  if (startYear !== endYear) {
    return `${formatMonthDay(weekStart)}, ${startYear} – ${formatMonthDay(last)}, ${endYear}`;
  }
  const end = startMonth === endMonth ? String(Number(last.slice(8))) : formatMonthDay(last);
  return `${formatMonthDay(weekStart)} – ${end}, ${startYear}`;
}

/**
 * "1:00 PM" on the Eastern wall. Assembled by hand rather than with Intl's time style, which
 * puts a narrow no-break space before "PM" in current engines and differs between runtimes.
 */
export function formatEasternTime(instant: Date): string {
  const { hour, minute } = easternClock(instant);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** "Sun" for the Eastern day an instant falls on. */
export const easternWeekdayShort = (instant: Date): string =>
  WEEKDAYS_SHORT[easternClock(instant).weekday] ?? "";
