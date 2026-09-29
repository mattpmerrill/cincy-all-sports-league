import "server-only";
import { loadCachedLeagueData } from "@/data/league.cached";
import { createLeagueModelSource } from "@/data/league-model";
import { createStandingsService } from "./standings.service";

export const getLeaderboard = () =>
  createStandingsService({
    model: createLeagueModelSource({ loadData: loadCachedLeagueData }),
  }).getLeaderboard();
