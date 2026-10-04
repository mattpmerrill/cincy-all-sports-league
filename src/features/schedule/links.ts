/**
 * The Week page's address for a week and, optionally, one fantasy team or a pair of them (`vs` is
 * the second team and only means something next to `team`). Defaults are left out so the common
 * links stay clean: `/week` is the current week of everyone.
 */
export function weekHref(
  options: { week?: string | null; team?: string | null; vs?: string | null } = {},
): string {
  const params = new URLSearchParams();
  if (options.week) params.set("week", options.week);
  if (options.team) {
    params.set("team", options.team);
    if (options.vs) params.set("vs", options.vs);
  }
  const query = params.toString();
  return query ? `/week?${query}` : "/week";
}

/**
 * The games list for a pair of teams (a matchup), landing on the list itself. The week is left out
 * when it is the current one, like every other link here.
 */
export function pairGamesHref(options: {
  weekStart: string;
  currentWeek: string;
  teams: readonly [string, string];
}): string {
  const [team, vs] = options.teams;
  const week = options.weekStart === options.currentWeek ? null : options.weekStart;
  return `${weekHref({ week, team, vs })}#games`;
}
