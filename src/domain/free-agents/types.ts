import type { ParticipantData } from "@/domain/league";
import type { SportCode } from "@/domain/sports/sports";
import type { TradeTeamRef } from "@/domain/trades";

/**
 * Every failure a free-agent move can return. Most are the message tokens `make_free_agent_move`
 * raises (same spelling on purpose, so the repository maps them one to one). `sport_locked` is the
 * one rule SQL cannot check, because it depends on season status the domain derives (ADR-004).
 * `busy` is the repository's answer to a deadlock or serialization failure, and `facts_unavailable`
 * is the service's answer when ESPN could not refresh the scores a move is priced on: in both
 * cases nothing was written and retrying is safe.
 */
export const FREE_AGENT_ERROR_CODES = [
  "not_owner",
  "invalid_sport",
  "same_participant",
  "stale_pick",
  "not_found",
  "not_free_agent",
  "missing_scores",
  "sport_locked",
  "busy",
  "facts_unavailable",
] as const;
export type FreeAgentErrorCode = (typeof FREE_AGENT_ERROR_CODES)[number];

export const isFreeAgentErrorCode = (value: string): value is FreeAgentErrorCode =>
  (FREE_AGENT_ERROR_CODES as readonly string[]).includes(value);

/** Same shape as `AppError` in `lib/result` (domain cannot import lib), so it can travel in a `Result`. */
export type FreeAgentError = { code: FreeAgentErrorCode; message: string };

/** Outcome of a pure pre-check. */
export type MoveCheck = { ok: true } | { ok: false; error: FreeAgentError };

/** One completed move, as "Recent moves" shows it. */
export type FreeAgentMove = {
  id: string;
  team: TradeTeamRef;
  sport: SportCode;
  dropped: ParticipantData;
  added: ParticipantData;
  createdAt: string;
};

/**
 * What a move quietly undoes, for the confirm dialog's warning. The two offer counts differ in
 * whose they are: `offersReceived` were made by other teams on a listing the move cancels, while
 * `offersMade` are the mover's own offers on other listings that give the dropped pick.
 */
export type MoveSideEffects = { listings: number; offersReceived: number; offersMade: number };
