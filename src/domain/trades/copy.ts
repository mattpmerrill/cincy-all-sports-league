import { SPORT_CODES, SPORTS } from "@/domain/sports/sports";
import type { TradeItem } from "./types";

/** Shared wording helpers for feed posts and emails. Plain text: no markup, no em dashes. */

/** "A", "A and B", "A, B and C". */
export function joinList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** "Chicago Bears (NFL)": the sport tag says which league a bare team name belongs to. */
export const withSport = ({ sport, participant }: TradeItem) =>
  `${participant.name} (${SPORTS[sport].shortLabel})`;

export const possessive = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);

/** Legs in catalog order so the same trade always reads the same. */
export function bySportOrder<T extends { sport: TradeItem["sport"] }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => SPORT_CODES.indexOf(a.sport) - SPORT_CODES.indexOf(b.sport));
}

const ELLIPSIS = "…";

/** Cuts at a word boundary where it can, and always ends inside `max` characters. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, Math.max(0, max - ELLIPSIS.length));
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}${ELLIPSIS}`;
}

/** Notes are free text: collapse line breaks and runs of spaces so a post body stays one line. */
export const tidyNote = (note: string | null): string | null => {
  const tidy = note?.replace(/\s+/g, " ").trim();
  return tidy ? tidy : null;
};
