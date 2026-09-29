import { SPORTS } from "@/domain/sports/sports";
import type { SportCode } from "@/domain/sports/sports";
import type { FreeAgentErrorCode, MoveSideEffects } from "./types";

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

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * The confirm dialog's warning about the trades a move quietly undoes, or null when it touches
 * none. Zero parts are left out, and verbs agree with what they count. The offers on a cancelled
 * listing are other teams' (they go with the listing); the mover's own offers are withdrawn.
 */
export function moveWarning(
  dropped: string,
  { listings, offersReceived, offersMade }: MoveSideEffects,
): string | null {
  const acts: string[] = [];
  if (listings > 0) {
    const verb = listings === 1 ? "includes" : "include";
    const onIt =
      offersReceived > 0
        ? ` (and the ${count(offersReceived, "offer")} on ${listings === 1 ? "it" : "them"})`
        : "";
    acts.push(`cancels ${count(listings, "trade listing")} that ${verb} ${dropped}${onIt}`);
  }
  if (offersMade > 0) {
    acts.push(
      `withdraws your ${count(offersMade, "offer")} that ${offersMade === 1 ? "gives" : "give"} ${dropped}`,
    );
  }
  return acts.length === 0 ? null : `This also ${acts.join(" and ")}.`;
}
