import type { OwnerData, ParticipantData } from "@/domain/league";
import type { SportCode } from "@/domain/sports/sports";

export const LISTING_KINDS = ["block", "direct"] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

/** As stored. `open` stays `open` after the window closes; read it through `effectiveListingStatus`. */
export const LISTING_STATUSES = ["open", "accepted", "cancelled"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const OFFER_STATUSES = ["pending", "accepted", "rejected", "withdrawn", "void"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

/**
 * How long a listing takes offers. The database function that creates a listing has its own
 * `interval '24 hours'` literal; change both together. UI copy reads this constant.
 */
export const TRADE_WINDOW_HOURS = 24;

/** A team as the trade screens show it: enough to name it, link it and show who owns it. */
export type TradeTeamRef = {
  id: string;
  name: string;
  slug: string;
  owner: OwnerData | null;
};

/** One sport's participant, as listed or as given in an offer leg. */
export type TradeItem = { sport: SportCode; participant: ParticipantData };

export type TradeOffer = {
  id: string;
  listingId: string;
  offeringTeam: TradeTeamRef;
  note: string | null;
  status: OfferStatus;
  createdAt: string;
  resolvedAt: string | null;
  /** What the offerer gives, one participant per sport, each in a sport the listing offers. */
  legs: TradeItem[];
};

export type TradeListing = {
  id: string;
  kind: ListingKind;
  status: ListingStatus;
  /** The team whose players are on offer: the only one that can accept, reject or cancel. */
  ownerTeam: TradeTeamRef;
  createdBy: string | null;
  createdAt: string;
  /** ISO time the window ends. */
  closesAt: string;
  resolvedAt: string | null;
  acceptedOfferId: string | null;
  /** The owner's participants on offer, one per sport. */
  items: TradeItem[];
  offers: TradeOffer[];
};

/** A listing without its offers, for lists that show one offer in context. */
export type TradeListingSummary = Omit<TradeListing, "offers">;

/** "Your offers": an offer and the listing it was made on. */
export type TradeOfferWithListing = TradeOffer & { listing: TradeListingSummary };

/** What a person sees: a listing left `open` past its window reads as expired. */
export type EffectiveListingStatus = ListingStatus | "expired";
export type EffectiveOfferStatus = OfferStatus | "expired";

/**
 * Every failure a trade can return. The first group are the message tokens the SQL functions raise
 * (same spelling on purpose, so the repository maps them one to one); `sport_locked` is the one
 * rule SQL cannot check, because it depends on season status the domain derives (ADR-003).
 */
export const TRADE_ERROR_CODES = [
  "not_owner",
  "not_found",
  "listing_closed",
  "offer_not_pending",
  "own_listing",
  "team_unowned",
  "invalid_sports",
  "already_listed",
  "duplicate_offer",
  "same_participant",
  "stale_pick",
  "missing_scores",
  "sport_locked",
] as const;
export type TradeErrorCode = (typeof TRADE_ERROR_CODES)[number];

export const isTradeErrorCode = (value: string): value is TradeErrorCode =>
  (TRADE_ERROR_CODES as readonly string[]).includes(value);

/**
 * Same shape as `AppError` in `lib/result` (domain cannot import lib), so it can travel in a
 * `Result`. `listingId` is set on `already_listed`: the listing that blocks the request.
 */
export type TradeError = { code: TradeErrorCode; message: string; listingId?: string };

/** Outcome of a pure pre-check. */
export type TradeCheck = { ok: true } | { ok: false; error: TradeError };
