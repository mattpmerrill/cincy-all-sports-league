/** How many free agents show before "Show more": the biggest pool is a few hundred rows. */
export const PAGE_SIZE = 40;

/** Lowercase without accents, so "swiatek" finds "Świątek" and "Jose" finds "José". */
const fold = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    // Letters that NFD does not decompose.
    .replace(/ł/gi, "l")
    .replace(/ø/gi, "o")
    .replace(/đ/gi, "d")
    .toLowerCase();

/**
 * Filters by name only (never by stat line or points), ignoring case, accents and extra spaces.
 * The list is server-provided and small enough that this runs on every keystroke, so there is no
 * search request.
 */
export function filterByName<T extends { name: string }>(rows: readonly T[], query: string): T[] {
  const needle = fold(query).trim().replace(/\s+/g, " ");
  if (needle === "") return [...rows];
  return rows.filter((row) => fold(row.name).replace(/\s+/g, " ").includes(needle));
}
