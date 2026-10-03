import { SPORT_LIST, type SportCode } from "@/domain/sports/sports";

/**
 * The single owner of a game's lifecycle. The database enum `game_status` and the ESPN adapter's
 * mapping both mirror this list; add a state here first and let the compiler and the pgTAP test
 * point at the rest.
 */
export const GAME_STATUSES = [
  "scheduled",
  "in_progress",
  "final",
  "postponed",
  "canceled",
] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

/**
 * Sports that play head-to-head games, derived from the catalog so a new team sport shows up
 * here by itself. Golf and tennis are tournaments with a field, not games, and are not on the
 * weekly schedule.
 */
export const GAME_SPORTS: readonly SportCode[] = SPORT_LIST.filter(
  (sport) => sport.participantKind === "team",
).map((sport) => sport.code);

export const isGameSport = (sport: SportCode): boolean => GAME_SPORTS.includes(sport);

/** Which side of a game a team plays on. A neutral-site game still names a home side. */
export type GameSideKey = "home" | "away";

export const opposite = (side: GameSideKey): GameSideKey => (side === "home" ? "away" : "home");

/** One team's end of a game, as stored. */
export type GameSide = {
  /** The vendor's team id; always present, even when no participant row matches it. */
  externalId: string;
  /** Our `participants.id`, or null for a team the league has no row for. */
  participantId: string | null;
  name: string;
  shortName: string;
  logoUrl: string | null;
  /** Null before the game has a score. */
  score: number | null;
  /** True or false once the game is decided, null before. */
  winner: boolean | null;
};

/**
 * A game as the pages read it. Plain JSON-safe values only (`startsAt` is an ISO instant), because
 * the cached read hands these across Next's data cache.
 */
export type Game = {
  id: string;
  sport: SportCode;
  /** The vendor's event id: with the sport, the game's natural key. */
  externalId: string;
  /** ISO instant. For a game whose time is not set yet it is a placeholder; see `timeTbd`. */
  startsAt: string;
  /** True when the vendor has a date but no kickoff time yet ("Time TBD"). */
  timeTbd: boolean;
  status: GameStatus;
  /** The vendor's short status text: "Q3 4:12", "Final/OT", "Postponed". */
  statusDetail: string | null;
  /** The event's headline: "World Series - Game 1". */
  note: string | null;
  neutralSite: boolean;
  home: GameSide;
  away: GameSide;
};
