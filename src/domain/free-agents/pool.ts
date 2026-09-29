/**
 * Which directory entries become new `participants` rows. Pure: the sync feature fetches the
 * entries and the existing rows, this decides what is safe to insert.
 */

/** How many of the best-ranked WTA and PGA athletes join the pool. */
export const FREE_AGENT_ATHLETE_POOL_SIZE = 100;

/** A team or athlete a vendor lists, in the shape of a participants row. */
export type PoolCandidate = {
  espnId: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  primaryColor: string | null;
};

/** What the database already holds for the sport. `espnId` is null for e.g. an amateur golfer. */
export type PoolExisting = { name: string; espnId: string | null };

/** A candidate held back because someone else already owns its name in this sport. */
export type PoolNameCollision = {
  espnId: string;
  name: string;
  /** True when the earlier holder is another row in the same batch, not the database. */
  withinBatch: boolean;
};

export type PoolPlan = { inserts: PoolCandidate[]; nameCollisions: PoolNameCollision[] };

/** Case, accent and punctuation-insensitive: "Ludvig Åberg" and "Ludvig Aberg" are one person. */
const nameKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/**
 * Insert-only and idempotent: feeding the plan's own inserts back in as `existing` yields an
 * empty plan. It never renames or removes anything.
 *
 * - A candidate whose vendor id is already stored is skipped without a word: that is the normal
 *   case on every run after the first, and a rename on ESPN's side is deliberately not followed.
 * - A candidate whose name is already taken by a row with a different or no vendor id is skipped
 *   and reported. `participants` is unique on (sport, name), so inserting it would fail the whole
 *   batch, and it is most likely the same person under a row entered by hand (an amateur golfer
 *   with no ESPN id) who must not appear twice.
 * - Repeats inside one batch collapse to the first; a second, different id with the same name is
 *   reported like any other name collision.
 */
export function planPoolInserts(
  existing: readonly PoolExisting[],
  candidates: readonly PoolCandidate[],
): PoolPlan {
  const knownIds = new Set(existing.flatMap((p) => (p.espnId ? [p.espnId] : [])));
  const storedNames = new Set(existing.map((p) => nameKey(p.name)));
  const batchIds = new Set<string>();
  const batchNames = new Set<string>();

  const inserts: PoolCandidate[] = [];
  const nameCollisions: PoolNameCollision[] = [];
  for (const candidate of candidates) {
    if (knownIds.has(candidate.espnId) || batchIds.has(candidate.espnId)) continue;

    const key = nameKey(candidate.name);
    const storedHolder = storedNames.has(key);
    if (storedHolder || batchNames.has(key)) {
      nameCollisions.push({
        espnId: candidate.espnId,
        name: candidate.name,
        withinBatch: !storedHolder,
      });
      continue;
    }
    batchIds.add(candidate.espnId);
    batchNames.add(key);
    inserts.push(candidate);
  }
  return { inserts, nameCollisions };
}
