/** Points to at most two decimals with no trailing zeros: 25.4, 12, 0.23. */
export function formatPoints(points: number): string {
  return String(Math.round(points * 100) / 100);
}

/** Points gained over a stretch, signed: "+12.5", "0", "-3". Sign follows the rounded value. */
export function formatGain(points: number): string {
  const text = formatPoints(points);
  return Number(text) > 0 ? `+${text}` : text;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "2026-10-20" -> "Oct 20". Parses the string directly so time zones can't shift the day. */
export function formatMonthDay(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  const name = MONTHS[(month ?? 1) - 1];
  return `${name ?? "?"} ${day ?? "?"}`;
}
