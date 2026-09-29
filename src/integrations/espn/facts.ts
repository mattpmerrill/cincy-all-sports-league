/** Vendor-neutral facts. Nothing in this file (or its consumers) knows ESPN's response shapes. */

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
