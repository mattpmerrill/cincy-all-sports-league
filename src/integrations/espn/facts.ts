/** Vendor-neutral facts. Nothing in this file (or its consumers) knows ESPN's response shapes. */
import type { GameStatus } from "@/domain/schedule";

export type TeamRecord = {
  espnTeamId: string;
  wins: number;
  losses: number;
  /** NFL ties and MLS draws. Always 0 for sports without them. */
  ties: number;
};

export type RankedAthlete = {
  espnAthleteId: string;
  rank: number;
};

export type TennisFinish =
  | "champion"
  | "runner_up"
  | "semifinal"
  | "quarterfinal"
  | "round_of_16"
  | "round_of_32"
  | "earlier";

export type GolfFinish =
  "champion" | "runner_up" | "top_5" | "top_10" | "top_20" | "made_cut" | "missed_cut";

type MajorResultBase<Finish> = {
  /** Canonical league label (see MAJOR_LABELS), stable across seasons: the DB's event_label. */
  eventName: string;
  espnAthleteId: string;
  finish: Finish;
  /** False while the event is still being played; tennis finishes can still improve. */
  eventCompleted: boolean;
};

export type TennisMajorResult = MajorResultBase<TennisFinish>;
export type GolfMajorResult = MajorResultBase<GolfFinish>;

/**
 * Someone or something ESPN lists for a sport, in league vocabulary: what a `participants` row
 * needs. Says nothing about how they are doing.
 */
export type DirectoryEntry = {
  espnId: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  /** `#rrggbb` lowercase, or null when ESPN has none we can trust. */
  primaryColor: string | null;
};

/** One team's end of a scheduled game. */
export type ScheduledGameSide = {
  espnTeamId: string;
  name: string;
  /** A compact label for a row ("CIN"): the team's abbreviation when ESPN has one. */
  shortName: string;
  /** Null until the game has begun. */
  score: number | null;
  /** True or false once the game is decided, null before. */
  winner: boolean | null;
};

/**
 * A game as ESPN reports it, in league vocabulary: who plays, when, and how it stands. Says
 * nothing about which of our participants these teams are; the data layer maps the ids.
 */
export type ScheduledGame = {
  espnEventId: string;
  startsAt: Date;
  /** The day is known but the kickoff is not: `startsAt` is ESPN's placeholder. */
  timeTbd: boolean;
  status: GameStatus;
  /** ESPN's short status text ("Q3 4:12", "Final/OT"); null before the game starts. */
  statusDetail: string | null;
  /** The event's headline ("World Series - Game 1"). */
  note: string | null;
  neutralSite: boolean;
  home: ScheduledGameSide;
  away: ScheduledGameSide;
};
