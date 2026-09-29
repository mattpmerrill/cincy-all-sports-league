import "server-only";
import { loadCachedLeagueData } from "@/data/league.cached";
import { createLeagueModelSource } from "@/data/league-model";
import type { SportCode } from "@/domain/sports/sports";
import { createSportsService } from "./sports.service";

const service = () =>
  createSportsService({ model: createLeagueModelSource({ loadData: loadCachedLeagueData }) });

export const listSports = () => service().listSports();
export const getSportView = (code: SportCode) => service().getSportView(code);
