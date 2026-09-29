import "server-only";
import { loadCachedLeagueData } from "@/data/league.cached";
import { createLeagueModelSource } from "@/data/league-model";
import { createFantasyTeamsService } from "./fantasy-teams.service";

export const getTeamDetail = (slug: string) =>
  createFantasyTeamsService({
    model: createLeagueModelSource({ loadData: loadCachedLeagueData }),
  }).getTeamDetail(slug);
