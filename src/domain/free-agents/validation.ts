import type { PickData } from "@/domain/league";
import { SPORTS } from "@/domain/sports/sports";
import type { SportCode } from "@/domain/sports/sports";
import { effectiveListingStatus } from "@/domain/trades";
import type { SportPhases, TradeListing } from "@/domain/trades";
import type { FreeAgentErrorCode, MoveCheck } from "./types";

/**
 * Friendly pre-checks that mirror `make_free_agent_move`, so the page can explain a problem before
 * calling it, plus the one rule SQL cannot apply: a sport whose season is complete is locked.
 * SQL still re-checks everything under row locks; nothing here is a substitute for that. Codes
 * match the SQL message tokens where the rules overlap.
 */

const pass: MoveCheck = { ok: true };
const fail = (code: FreeAgentErrorCode, message: string): MoveCheck => ({
  ok: false,
  error: { code, message },
});

/**
 * Checks run in this order so the reason a person sees is the most useful one: a closed sport
 * beats everything, then a stale page, then the choice of player.
 *
 * `add` is what the id resolved to: null when no such participant exists. A participant from
 * another sport reads as not found, the same as SQL, which looks the row up within the sport.
 */
export function validateMove(input: {
  sport: SportCode;
  sportStatuses: SportPhases;
  team: { picks: readonly Pick<PickData, "sport" | "participant">[] };
  /** The participant the person wants to drop; only a staleness check, never a target. */
  dropId: string;
  add: { id: string; sport: SportCode } | null;
  /** Ids held by any team in this sport. */
  heldIds: ReadonlySet<string>;
  allowsDuplicatePicks: boolean;
}): MoveCheck {
  const { sport, add } = input;
  // Upcoming is allowed: a move before the season costs nothing, and points start at zero.
  if (input.sportStatuses[sport].status.phase === "complete") {
    return fail("sport_locked", `The ${SPORTS[sport].name} season is over, so moves are closed.`);
  }
  const current = input.team.picks.find((p) => p.sport === sport);
  if (!current || current.participant.id !== input.dropId) {
    return fail(
      "stale_pick",
      "Your pick in this sport changed since you opened the page. Refresh and try again.",
    );
  }
  if (add?.id === input.dropId) return fail("same_participant", "That's already your pick.");
  if (!add || add.sport !== sport) return fail("not_found", "That player isn't in this sport.");
  if (!input.allowsDuplicatePicks && input.heldIds.has(add.id)) {
    return fail("not_free_agent", "Another team just picked them up. Choose another free agent.");
  }
  return pass;
}

/** What a move quietly undoes, for the confirm dialog's warning. */
export type MoveSideEffects = { listings: number; offers: number };

/**
 * Mirrors the SQL side effects: the team's live listings that include the sport are cancelled with
 * every pending offer on them, and the team's own pending offers elsewhere that give this sport's
 * pick are voided. Expired listings are ignored, as SQL leaves them alone.
 */
export function moveSideEffects(input: {
  teamId: string;
  sport: SportCode;
  /** Listings that might still be live; the ones past their window are ignored here. */
  openListings: readonly TradeListing[];
  now: Date;
}): MoveSideEffects {
  const { teamId, sport, now } = input;
  let listings = 0;
  let offers = 0;
  for (const listing of input.openListings) {
    if (effectiveListingStatus(listing, now) !== "open") continue;
    const pending = listing.offers.filter((o) => o.status === "pending");
    if (listing.ownerTeam.id === teamId) {
      if (!listing.items.some((i) => i.sport === sport)) continue;
      listings += 1;
      offers += pending.length;
    } else {
      offers += pending.filter(
        (o) => o.offeringTeam.id === teamId && o.legs.some((l) => l.sport === sport),
      ).length;
    }
  }
  return { listings, offers };
}
