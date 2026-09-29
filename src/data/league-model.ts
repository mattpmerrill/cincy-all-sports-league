import { buildLeagueModel } from "@/domain/league";
import type { LeagueData, LeagueModel } from "@/domain/league";
import { easternDate } from "@/lib/time";

export type LeagueModelSource = () => Promise<LeagueModel | null>;

/**
 * Facts in, scored model out. Every league service takes one of these, so tests can hand in
 * hand-built data and the server files hand in the cached loader.
 */
export function createLeagueModelSource(deps: {
  loadData: () => Promise<LeagueData | null>;
  now?: () => Date;
}): LeagueModelSource {
  const now = deps.now ?? (() => new Date());
  return async () => {
    const data = await deps.loadData();
    return data ? buildLeagueModel(data, easternDate(now())) : null;
  };
}
