import { SPORTS } from "@/domain/sports/sports";
import type { SportCode } from "@/domain/sports/sports";
import type { FreeAgentErrorCode } from "./types";

/**
 * What a person sees for each code, written once. Never the SQL token, message or detail: those
 * stay in logs. The record covers the whole union so a new code cannot ship without a message.
 * `sport_locked` is worded per sport by `sportLockedMessage`, so its entry is the generic form.
 */
export const FREE_AGENT_MESSAGES: Record<FreeAgentErrorCode, string> = {
  not_owner: "You need an approved team in this league to make moves.",
  invalid_sport: "That sport isn't part of this season.",
  not_found: "That player isn't in this sport.",
  stale_pick: "Your pick in this sport changed since you opened the page. Refresh and try again.",
  same_participant: "That's already your pick.",
  not_free_agent: "Another team just picked them up. Choose another free agent.",
  missing_scores: "Something went wrong working out the points. Try again.",
  sport_locked: "That sport's season is over, so moves are closed.",
  busy: "Someone else was making a move at the same moment. Try again.",
  facts_unavailable:
    "We couldn't get the latest scores from ESPN, so nothing changed. Try again in a minute.",
};

/** `sport_locked` names the sport, which the record cannot. */
export const sportLockedMessage = (sport: SportCode): string =>
  `The ${SPORTS[sport].name} season is over, so moves are closed.`;

/** Carried by `invalid_sport` when there is no season at all, as trades words it. */
export const NO_ACTIVE_SEASON_MESSAGE = "There isn't an active season right now.";
