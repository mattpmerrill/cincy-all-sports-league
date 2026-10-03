export { GAME_SPORTS, GAME_STATUSES, isGameSport, opposite } from "./types";
export type { Game, GameSide, GameSideKey, GameStatus } from "./types";
export { describeGame, describeStatus, outcomeFor } from "./describe-game";
export type { DescribeOptions, GameLine, GameLineTone } from "./describe-game";
export { buildWeekSlate, filterSlateToTeam, teamGames, teamSide } from "./build-week-slate";
export type {
  SlateDay,
  SlateGame,
  SlateOwner,
  SlateTeam,
  Stake,
  TeamGameCount,
  WeekSlate,
} from "./build-week-slate";
