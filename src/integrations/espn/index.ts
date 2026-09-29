/**
 * The ESPN adapter's public surface. Everything returned here is a vendor-neutral fact; no ESPN
 * response type, URL or field name is exported. Features import from "@/integrations/espn" only.
 */
export { fetchTeamRecords, type TeamRecordsOptions } from "./records";
export { fetchPostseasonStages } from "./postseason";
export { fetchWtaRankings, fetchPgaSeasonStandings } from "./rankings";
export { fetchMajorResults, TENNIS_MAJOR_LABELS, GOLF_MAJOR_LABELS } from "./majors";
export {
  POSTSEASON_STAGES,
  isPostseasonSport,
  withImpliedEarlierStages,
  type PostseasonAppearance,
  type PostseasonSport,
  type PostseasonStage,
  type PostseasonStageOf,
} from "./stages";
export type {
  GolfFinish,
  GolfMajorResult,
  RankedAthlete,
  TeamRecord,
  TennisFinish,
  TennisMajorResult,
} from "./facts";
export type { EspnClientOptions, EspnError, EspnErrorCode } from "./http";
