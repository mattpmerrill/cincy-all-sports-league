import "server-only";
import { loadCachedLeagueData } from "@/data/league.cached";
import { createLeagueModelSource } from "@/data/league-model";
import { createRulesService } from "./rules.service";

export const getRules = () =>
  createRulesService({
    model: createLeagueModelSource({ loadData: loadCachedLeagueData }),
    loadData: loadCachedLeagueData,
  }).getRules();
