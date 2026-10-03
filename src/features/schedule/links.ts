/**
 * The Week page's address for a week and, optionally, one fantasy team. Defaults are left out so
 * the common links stay clean: `/week` is the current week of everyone.
 */
export function weekHref(options: { week?: string | null; team?: string | null } = {}): string {
  const params = new URLSearchParams();
  if (options.week) params.set("week", options.week);
  if (options.team) params.set("team", options.team);
  const query = params.toString();
  return query ? `/week?${query}` : "/week";
}
