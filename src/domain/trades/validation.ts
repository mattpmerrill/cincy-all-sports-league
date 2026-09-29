import type { PickData, SeasonStatus } from "@/domain/league";
import { SPORT_CODES, SPORTS } from "@/domain/sports/sports";
import type { SportCode } from "@/domain/sports/sports";
import { effectiveListingStatus } from "./status";
import type { TradeCheck, TradeErrorCode, TradeListing, TradeOffer, TradeTeamRef } from "./types";

/**
 * Friendly pre-checks that mirror the SQL functions, so the UI can explain a problem before
 * calling them, plus the one rule SQL cannot apply: a sport whose season is complete is locked.
 * SQL still re-checks everything under row locks; nothing here is a substitute for that.
 * Codes match the SQL message tokens where the rules overlap.
 */

/** `LeagueModel["sports"]` satisfies this as is. */
export type SportPhases = Readonly<Record<SportCode, { status: Pick<SeasonStatus, "phase"> }>>;

type PickRef = Pick<PickData, "sport" | "participant">;
/** A team with what it currently holds. */
export type TradingTeam = Pick<TradeTeamRef, "id"> & { picks: readonly PickRef[] };

const pass: TradeCheck = { ok: true };
const fail = (code: TradeErrorCode, message: string, listingId?: string): TradeCheck => ({
  ok: false,
  error: listingId ? { code, message, listingId } : { code, message },
});

const sportName = (sport: SportCode) => SPORTS[sport].name;

/** Sports where the team holds a pick and the season is not complete, in catalog order. */
export function tradeableSports(
  picks: readonly Pick<PickData, "sport">[],
  sportStatuses: SportPhases,
): SportCode[] {
  const held = new Set(picks.map((p) => p.sport));
  return SPORT_CODES.filter(
    (code) => held.has(code) && sportStatuses[code].status.phase !== "complete",
  );
}

/** Non-empty and no repeats; every later check assumes it. */
function checkSportList(sports: readonly SportCode[]): TradeCheck {
  if (sports.length === 0) return fail("invalid_sports", "Pick at least one sport.");
  if (new Set(sports).size !== sports.length) {
    return fail("invalid_sports", "Each sport can only be picked once.");
  }
  return pass;
}

function checkNotLocked(sports: readonly SportCode[], statuses: SportPhases): TradeCheck {
  const locked = sports.find((s) => statuses[s].status.phase === "complete");
  return locked
    ? fail("sport_locked", `The ${sportName(locked)} season is over, so it can't be traded.`)
    : pass;
}

const heldIn = (team: TradingTeam, sport: SportCode) => team.picks.find((p) => p.sport === sport);

/** The live listing, if any, that already offers one of these participants for the team. */
function blockingListing(
  teamId: string,
  participantIds: ReadonlySet<string>,
  listings: readonly TradeListing[],
  now: Date,
): TradeListing | undefined {
  return listings.find(
    (l) =>
      l.ownerTeam.id === teamId &&
      effectiveListingStatus(l, now) === "open" &&
      l.items.some((i) => participantIds.has(i.participant.id)),
  );
}

const alreadyListed = (listing: TradeListing) =>
  fail("already_listed", "One of those players is already up for trade.", listing.id);

const participantIdsIn = (team: TradingTeam, sports: readonly SportCode[]) =>
  new Set(sports.flatMap((s) => heldIn(team, s)?.participant.id ?? []));

/** Put your own players on the trading block. */
export function validateListingRequest(input: {
  sports: readonly SportCode[];
  team: TradingTeam;
  sportStatuses: SportPhases;
  /** Listings that might still be live; expired ones are ignored. */
  listings: readonly TradeListing[];
  now: Date;
}): TradeCheck {
  const { sports, team } = input;
  const list = checkSportList(sports);
  if (!list.ok) return list;
  if (sports.some((s) => !heldIn(team, s))) {
    return fail("invalid_sports", "Your team doesn't have a pick in one of those sports.");
  }
  const locked = checkNotLocked(sports, input.sportStatuses);
  if (!locked.ok) return locked;

  const blocker = blockingListing(
    team.id,
    participantIdsIn(team, sports),
    input.listings,
    input.now,
  );
  return blocker ? alreadyListed(blocker) : pass;
}

/** Offer another team a trade: you give your pick in each sport for theirs. */
export function validateDirectRequest(input: {
  sports: readonly SportCode[];
  team: TradingTeam;
  target: TradingTeam & Pick<TradeTeamRef, "owner">;
  sportStatuses: SportPhases;
  listings: readonly TradeListing[];
  now: Date;
}): TradeCheck {
  const { sports, team, target } = input;
  if (target.id === team.id) return fail("own_listing", "You can't trade with your own team.");
  if (!target.owner) return fail("team_unowned", "That team doesn't have an owner yet.");
  const list = checkSportList(sports);
  if (!list.ok) return list;
  if (sports.some((s) => !heldIn(team, s) || !heldIn(target, s))) {
    return fail("invalid_sports", "Both teams need a pick in every sport you choose.");
  }
  const locked = checkNotLocked(sports, input.sportStatuses);
  if (!locked.ok) return locked;

  // The WNBA is the one sport where two teams can hold the same participant.
  const same = sports.find(
    (s) => heldIn(team, s)?.participant.id === heldIn(target, s)?.participant.id,
  );
  if (same) return fail("same_participant", `You both have the same ${sportName(same)} pick.`);

  const blocker = blockingListing(
    target.id,
    participantIdsIn(target, sports),
    input.listings,
    input.now,
  );
  return blocker ? alreadyListed(blocker) : pass;
}

/** Add an offer to a listing: your pick in each sport you name, for the listing's pick. */
export function validateOfferRequest(input: {
  listing: TradeListing;
  sports: readonly SportCode[];
  team: TradingTeam;
  sportStatuses: SportPhases;
  now: Date;
}): TradeCheck {
  const { listing, sports, team } = input;
  if (listing.ownerTeam.id === team.id) {
    return fail("own_listing", "You can't make an offer on your own listing.");
  }
  if (effectiveListingStatus(listing, input.now) !== "open") {
    return fail("listing_closed", "This listing is closed.");
  }
  const list = checkSportList(sports);
  if (!list.ok) return list;
  const listed = new Map(listing.items.map((i) => [i.sport, i.participant.id]));
  if (sports.some((s) => !listed.has(s) || !heldIn(team, s))) {
    return fail(
      "invalid_sports",
      "An offer can only cover sports on the listing where your team has a pick.",
    );
  }
  if (listing.offers.some((o) => o.offeringTeam.id === team.id && o.status === "pending")) {
    return fail("duplicate_offer", "You already have an offer on this listing. Withdraw it first.");
  }
  const locked = checkNotLocked(sports, input.sportStatuses);
  if (!locked.ok) return locked;

  const same = sports.find((s) => heldIn(team, s)?.participant.id === listed.get(s));
  return same ? fail("same_participant", `You both have the same ${sportName(same)} pick.`) : pass;
}

/**
 * Accept an offer. SQL owns who may accept and re-checks status and window under locks; this adds
 * what it cannot: a sport whose season is complete is locked, and the friendly reasons come first.
 */
export function validateAcceptRequest(input: {
  listing: TradeListing;
  offer: Pick<TradeOffer, "status" | "legs">;
  sportStatuses: SportPhases;
  now: Date;
}): TradeCheck {
  if (input.offer.status !== "pending") {
    return fail("offer_not_pending", "That offer was already answered or withdrawn.");
  }
  if (effectiveListingStatus(input.listing, input.now) !== "open") {
    return fail("listing_closed", "This listing is closed.");
  }
  return checkNotLocked(
    input.offer.legs.map((l) => l.sport),
    input.sportStatuses,
  );
}
