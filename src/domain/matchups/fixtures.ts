import type { Matchup } from "./types";

/**
 * Hand-built matchups for tests. Test-only; nothing in the app imports it. A matchup with no
 * `end` is live; `end: [home, away]` makes it final.
 */
let nextId = 1;

export function matchup(
  weekStart: string,
  homeTeamId: string,
  awayTeamId: string,
  options: { start?: [number, number]; end?: [number, number] | null } = {},
): Matchup {
  const [homeStart, awayStart] = options.start ?? [0, 0];
  const end = options.end ?? null;
  return {
    id: `m${nextId++}`,
    seasonId: "season-1",
    weekStart,
    home: { teamId: homeTeamId, startPoints: homeStart, endPoints: end ? end[0] : null },
    away: { teamId: awayTeamId, startPoints: awayStart, endPoints: end ? end[1] : null },
    finalizedAt: end ? `${weekStart}T11:00:00.000Z` : null,
  };
}
