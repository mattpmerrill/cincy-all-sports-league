/** How many weeks back an opponent still counts as "recent" for the rematch guard. */
export const REMATCH_WEEKS = 3;

/** Two team ids that met in a recent week; the order inside the pair does not matter. */
export type RecentPair = readonly [string, string];

/** The better-ranked team is home. */
export type Pairing = { homeTeamId: string; awayTeamId: string };

export type PairingResult = {
  /** In pairing order, which is rank order of each pair's home team. */
  pairs: Pairing[];
  /** The one team left over when the count is odd, otherwise null. */
  bye: string | null;
};

// A separator that cannot appear in a uuid keeps "a|bc" and "ab|c" apart.
const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Pairs a ranked field by standings neighbors with a rematch guard. The top unpaired team plays
 * the nearest unpaired team below it that it has not met within `REMATCH_WEEKS` weeks; when every
 * team left is a recent opponent it plays the nearest one anyway, so a small or stagnant field
 * still gets a full slate. Without the guard, standings that barely move would repeat 1 v 2 every
 * week.
 *
 * `rankedTeams` is already in standings order (rankStandings settles ties deterministically), and
 * the walk depends on nothing else, so the order of `recentPairs` cannot change the result. A team
 * listed twice is paired once, and recent pairs naming teams outside the field are ignored.
 */
export function pairByStandings(
  rankedTeams: readonly { teamId: string }[],
  recentPairs: readonly RecentPair[],
): PairingResult {
  const recent = new Set(recentPairs.map(([a, b]) => pairKey(a, b)));
  const ids = [...new Set(rankedTeams.map((t) => t.teamId))];
  const taken = new Set<string>();
  const pairs: Pairing[] = [];
  let bye: string | null = null;

  for (const [index, home] of ids.entries()) {
    if (taken.has(home)) continue;
    taken.add(home);
    const below = ids.slice(index + 1).filter((id) => !taken.has(id));
    const away = below.find((id) => !recent.has(pairKey(home, id))) ?? below[0];
    if (away === undefined) {
      // Nobody is left below, so only the last unpaired team of an odd field gets here.
      bye = home;
      break;
    }
    taken.add(away);
    pairs.push({ homeTeamId: home, awayTeamId: away });
  }

  return { pairs, bye };
}
