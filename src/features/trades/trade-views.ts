import type { TeamRef } from "@/data/fantasy-teams.repository";
import type { ParticipantData } from "@/domain/league";
import { SPORT_CODES } from "@/domain/sports/sports";
import type { SportCode } from "@/domain/sports/sports";
import {
  effectiveListingStatus,
  effectiveOfferStatus,
  formatTimeLeft,
  timeLeft,
  validateDirectRequest,
  validateListingRequest,
  validateOfferRequest,
} from "@/domain/trades";
import type {
  EffectiveListingStatus,
  EffectiveOfferStatus,
  SportPhases,
  TradeCheck,
  TradeListing,
  TradeOffer,
  TradeOfferWithListing,
  TradeTeamRef,
  TradingTeam,
} from "@/domain/trades";

/**
 * Read models for the Trades screens, built from one `now` so every status and countdown on a page
 * agrees. Pure: the service loads the data, these shape it, the pages only render it.
 */

/** How long a resolved listing or offer stays in "your listings" and "your offers". */
export const RECENT_DAYS = 7;
const RECENT_MS = RECENT_DAYS * 24 * 60 * 60 * 1000;

export type ListingCard = {
  listing: TradeListing;
  status: EffectiveListingStatus;
  /** "23h 12m", or "Closed" once the window ended. */
  timeLeft: string;
  /** Offers still waiting for an answer. */
  pendingOffers: number;
  /** The viewer's team owns it. */
  isMine: boolean;
};

export type OfferView = {
  offer: TradeOffer;
  status: EffectiveOfferStatus;
  /** The viewer's team made it. */
  isMine: boolean;
  canAccept: boolean;
  canReject: boolean;
  canWithdraw: boolean;
};

export type MyOfferCard = {
  offer: TradeOfferWithListing;
  status: EffectiveOfferStatus;
  listingStatus: EffectiveListingStatus;
  timeLeft: string;
  canWithdraw: boolean;
};

export type TradesArea = {
  /** Null when signed out or the member has no approved team. */
  myTeam: TeamRef | null;
  /** Your open listings that have pending offers, soonest to close first. */
  waitingOnYou: { listing: ListingCard; offers: OfferView[] }[];
  /** Open ones, plus recently resolved (accepted, cancelled or expired). */
  myListings: ListingCard[];
  /** Pending ones, plus recently resolved. */
  myOffers: MyOfferCard[];
  /** Every open, unexpired listing, soonest to close first. */
  block: ListingCard[];
  /** Completed trades, most recent first. */
  recent: ListingCard[];
};

/** One sport of a proposed trade from the viewer's side. */
export type TradeChoice = {
  sport: SportCode;
  youGive: ParticipantData;
  youGet: ParticipantData;
  tradeable: boolean;
  /** Why not, in words a member can read; set when `tradeable` is false. */
  reason?: string;
  /** Set with `already_listed`: the listing that holds this player. */
  blockingListingId?: string;
};

/** One of the viewer's own picks as a candidate for the trading block. */
export type BlockChoice = {
  sport: SportCode;
  participant: ParticipantData;
  tradeable: boolean;
  reason?: string;
  blockingListingId?: string;
};

export type NewTradeOptions = {
  myTeam: TeamRef;
  myPicks: BlockChoice[];
  /** Every other owned team, by name, with a choice per sport both hold. */
  teams: { team: TradeTeamRef; choices: TradeChoice[] }[];
};

export type ViewerRole = "owner" | "bidder" | "spectator" | "signed_out";

export type ListingView = {
  listing: TradeListing;
  status: EffectiveListingStatus;
  timeLeft: string;
  role: ViewerRole;
  viewerTeam: TeamRef | null;
  /** Every offer, oldest first, with what the viewer may do to each. */
  offers: OfferView[];
  /** The viewer's own pending offer on this listing. */
  myOffer: OfferView | null;
  /** The owner may cancel while the listing is open. */
  canCancel: boolean;
  /** Bidders only: one entry per listed sport. Empty when `offerBlockedReason` is set. */
  offerChoices: TradeChoice[];
  /** Why a bidder cannot offer right now (closed, or an offer is already waiting). */
  offerBlockedReason: string | null;
};

// ===== areas =====

const asTime = (iso: string | null) => (iso ? Date.parse(iso) : Number.NaN);
const isRecent = (iso: string | null, now: Date) => now.getTime() - asTime(iso) <= RECENT_MS;

const pendingCount = (listing: TradeListing, now: Date) =>
  listing.offers.filter((o) => effectiveOfferStatus(o, listing, now) === "pending").length;

export function listingCard(
  listing: TradeListing,
  viewerTeamId: string | null,
  now: Date,
): ListingCard {
  return {
    listing,
    status: effectiveListingStatus(listing, now),
    timeLeft: formatTimeLeft(timeLeft(listing, now)),
    pendingOffers: pendingCount(listing, now),
    isMine: viewerTeamId !== null && listing.ownerTeam.id === viewerTeamId,
  };
}

export function offerView(
  offer: TradeOffer,
  listing: Pick<TradeListing, "status" | "closesAt" | "ownerTeam">,
  viewerTeamId: string | null,
  now: Date,
): OfferView {
  const status = effectiveOfferStatus(offer, listing, now);
  const pending = status === "pending";
  const isOwner = viewerTeamId !== null && listing.ownerTeam.id === viewerTeamId;
  const isMine = viewerTeamId !== null && offer.offeringTeam.id === viewerTeamId;
  return {
    offer,
    status,
    isMine,
    canAccept: isOwner && pending,
    canReject: isOwner && pending,
    canWithdraw: isMine && pending,
  };
}

/** When a listing stopped being live: its resolution, or the end of its window when it expired. */
const endedAt = (listing: Pick<TradeListing, "resolvedAt" | "closesAt">, status: string) =>
  status === "expired" ? listing.closesAt : listing.resolvedAt;

export function buildTradesArea(input: {
  now: Date;
  myTeam: TeamRef | null;
  open: readonly TradeListing[];
  completed: readonly TradeListing[];
  mine: readonly TradeListing[];
  myOffers: readonly TradeOfferWithListing[];
}): TradesArea {
  const { now, myTeam } = input;
  const teamId = myTeam?.id ?? null;
  const card = (l: TradeListing) => listingCard(l, teamId, now);

  const myCards = input.mine.map(card);
  const waitingOnYou = myCards
    .filter((c) => c.status === "open" && c.pendingOffers > 0)
    .sort((a, b) => a.listing.closesAt.localeCompare(b.listing.closesAt))
    .map((c) => ({
      listing: c,
      offers: c.listing.offers
        .map((o) => offerView(o, c.listing, teamId, now))
        .filter((o) => o.status === "pending"),
    }));

  return {
    myTeam,
    waitingOnYou,
    myListings: myCards.filter(
      (c) => c.status === "open" || isRecent(endedAt(c.listing, c.status), now),
    ),
    myOffers: input.myOffers.flatMap((offer) => {
      const status = effectiveOfferStatus(offer, offer.listing, now);
      const listingStatus = effectiveListingStatus(offer.listing, now);
      const recent = isRecent(
        status === "expired" ? offer.listing.closesAt : offer.resolvedAt,
        now,
      );
      if (status !== "pending" && !recent) return [];
      return [
        {
          offer,
          status,
          listingStatus,
          timeLeft: formatTimeLeft(timeLeft(offer.listing, now)),
          canWithdraw: status === "pending",
        },
      ];
    }),
    block: input.open.map(card).filter((c) => c.status === "open"),
    recent: input.completed.map(card),
  };
}

// ===== choices =====

const failed = (check: TradeCheck) => (check.ok ? null : check.error);

/** Only the fields that are set, so a tradeable choice carries no `reason: undefined`. */
const verdict = (check: TradeCheck) => {
  const error = failed(check);
  return error
    ? {
        tradeable: false,
        reason: error.message,
        ...(error.listingId ? { blockingListingId: error.listingId } : {}),
      }
    : { tradeable: true };
};

/** The viewer's picks as trading-block candidates, in catalog order. */
export function blockChoices(input: {
  team: TradingTeam;
  sportStatuses: SportPhases;
  listings: readonly TradeListing[];
  now: Date;
}): BlockChoice[] {
  return SPORT_CODES.flatMap((sport) => {
    const pick = input.team.picks.find((p) => p.sport === sport);
    if (!pick) return [];
    return [
      {
        sport,
        participant: pick.participant,
        ...verdict(validateListingRequest({ ...input, sports: [sport] })),
      },
    ];
  });
}

/** One choice per sport where both teams hold a pick, judged as a request for that sport alone. */
export function directChoices(input: {
  team: TradingTeam;
  target: TradingTeam & Pick<TradeTeamRef, "owner">;
  sportStatuses: SportPhases;
  listings: readonly TradeListing[];
  now: Date;
}): TradeChoice[] {
  return SPORT_CODES.flatMap((sport) => {
    const mine = input.team.picks.find((p) => p.sport === sport);
    const theirs = input.target.picks.find((p) => p.sport === sport);
    if (!mine || !theirs) return [];
    return [
      {
        sport,
        youGive: mine.participant,
        youGet: theirs.participant,
        ...verdict(validateDirectRequest({ ...input, sports: [sport] })),
      },
    ];
  });
}

/** Codes that say the whole listing is off limits to this bidder, not just one sport. */
const LISTING_LEVEL = new Set(["listing_closed", "duplicate_offer", "own_listing"]);

/** One choice per listed sport. A listing-level refusal replaces them all with one reason. */
export function offerChoices(input: {
  listing: TradeListing;
  team: TradingTeam;
  sportStatuses: SportPhases;
  now: Date;
}): { choices: TradeChoice[]; blockedReason: string | null } {
  const rows = input.listing.items.map((item) => ({
    item,
    check: validateOfferRequest({ ...input, sports: [item.sport] }),
  }));
  const blocked = rows.map((r) => failed(r.check)).find((e) => e && LISTING_LEVEL.has(e.code));
  if (blocked) return { choices: [], blockedReason: blocked.message };
  return {
    blockedReason: null,
    choices: rows.flatMap(({ item, check }) => {
      const mine = input.team.picks.find((p) => p.sport === item.sport);
      if (!mine) return [];
      return [
        {
          sport: item.sport,
          youGive: mine.participant,
          youGet: item.participant,
          ...verdict(check),
        },
      ];
    }),
  };
}

// ===== one listing =====

export function buildListingView(input: {
  listing: TradeListing;
  viewer: { id: string } | null;
  viewerTeam: TeamRef | null;
  choices: { choices: TradeChoice[]; blockedReason: string | null };
  now: Date;
}): ListingView {
  const { listing, now } = input;
  const teamId = input.viewerTeam?.id ?? null;
  const role: ViewerRole = !input.viewer
    ? "signed_out"
    : !teamId
      ? "spectator"
      : teamId === listing.ownerTeam.id
        ? "owner"
        : "bidder";
  const status = effectiveListingStatus(listing, now);
  const offers = listing.offers.map((o) => offerView(o, listing, teamId, now));
  return {
    listing,
    status,
    timeLeft: formatTimeLeft(timeLeft(listing, now)),
    role,
    viewerTeam: input.viewerTeam,
    offers,
    myOffer: offers.find((o) => o.isMine && o.status === "pending") ?? null,
    canCancel: role === "owner" && status === "open",
    offerChoices: role === "bidder" ? input.choices.choices : [],
    offerBlockedReason: role === "bidder" ? input.choices.blockedReason : null,
  };
}
