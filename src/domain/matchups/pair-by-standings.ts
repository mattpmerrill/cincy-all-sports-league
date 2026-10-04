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
 * A ceiling on how many search nodes `pairByStandings` explores before it gives up and takes the
 * greedy slate. A 20-team week took at most 66 nodes in a 30-week simulation (54 with a frozen
 * table), so the cap is about 300 times what the league ever needs; it exists only so a
 * pathological input (hundreds of teams, an almost fully connected recent history) cannot make a
 * cron run spin.
 */
export const MAX_SEARCH_NODES = 20_000;

/**
 * Today's neighbor walk: each top unpaired team plays the nearest unpaired team below it that it
 * has not met recently, or just the nearest one when there is none. It always yields a full slate,
 * but it can strand the bottom of the table: the last teams are left with whoever remains.
 */
function greedySlate(ids: readonly string[], recent: ReadonlySet<string>): PairingResult {
  const taken = new Set<string>();
  const pairs: Pairing[] = [];
  let bye: string | null = null;

  for (const [index, home] of ids.entries()) {
    if (taken.has(home)) continue;
    taken.add(home);
    const below = ids.slice(index + 1).filter((id) => !taken.has(id));
    const away = below.find((id) => !recent.has(pairKey(home, id))) ?? below[0];
    if (away === undefined) {
      bye = home;
      break;
    }
    taken.add(away);
    pairs.push({ homeTeamId: home, awayTeamId: away });
  }

  return { pairs, bye };
}

/**
 * Depth-first search for the first complete slate with no rematch. The top unpaired team tries
 * its opponents nearest-first; when a team has no fresh opponent left, the search backs up and
 * gives the previous team its next-nearest fresh candidate. Because candidates are tried in
 * standings order, the first slate found is the one closest to plain neighbors, and the result
 * depends on nothing but the ranking and the set of recent pairs.
 *
 * Returns the slate (null when none exists, or the node cap was hit) and the nodes explored.
 */
export function searchRematchFreeSlate(
  ids: readonly string[],
  recent: ReadonlySet<string>,
): { slate: PairingResult | null; nodes: number } {
  let nodes = 0;
  let exhausted = false;
  const pairs: Pairing[] = [];

  const visit = (remaining: readonly string[]): PairingResult | null => {
    const [home, ...rest] = remaining;
    // Fewer than two teams left: done. An odd field leaves exactly one, the bye.
    if (home === undefined || rest.length === 0) return { pairs: [...pairs], bye: home ?? null };
    nodes += 1;
    if (nodes > MAX_SEARCH_NODES) {
      exhausted = true;
      return null;
    }
    for (const [index, away] of rest.entries()) {
      if (recent.has(pairKey(home, away))) continue;
      pairs.push({ homeTeamId: home, awayTeamId: away });
      const found = visit([...rest.slice(0, index), ...rest.slice(index + 1)]);
      if (found || exhausted) return found;
      pairs.pop();
    }
    return null;
  };

  return { slate: visit(ids), nodes };
}

/**
 * Pairs a ranked field by standings neighbors, with no rematch inside the last `REMATCH_WEEKS`
 * weeks whenever that is possible. The top unpaired team plays the nearest team below it that it
 * has not met recently; if that leaves a later team with no fresh opponent, the search backs up
 * and gives the earlier team its next-nearest fresh opponent, and the first rematch-free slate it
 * reaches wins. Plain nearest-first greed would leave the bottom of the table with rematches
 * (and the same opponent two weeks running) while the top never saw one.
 *
 * Only when no rematch-free slate exists (two teams that just met, four who have all met), or the
 * search hits `MAX_SEARCH_NODES`, does it fall back to the greedy walk, which takes the nearest
 * team even if it is a recent opponent so everyone still plays.
 *
 * An odd field leaves one team without a matchup: the one the walk reaches last with nobody left
 * below it. Usually that is the bottom team, but when the guard moves a neighbor away it can be
 * a mid-table team. The bye is part of the same deterministic search, never a separate choice.
 *
 * `rankedTeams` is already in standings order (rankStandings settles ties deterministically), so
 * the order of `recentPairs` cannot change the result. A team listed twice is paired once, and
 * recent pairs naming teams outside the field are ignored.
 */
export function pairByStandings(
  rankedTeams: readonly { teamId: string }[],
  recentPairs: readonly RecentPair[],
): PairingResult {
  const recent = new Set(recentPairs.map(([a, b]) => pairKey(a, b)));
  const ids = [...new Set(rankedTeams.map((t) => t.teamId))];
  return searchRematchFreeSlate(ids, recent).slate ?? greedySlate(ids, recent);
}
