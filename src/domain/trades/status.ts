import type {
  EffectiveListingStatus,
  EffectiveOfferStatus,
  TradeListing,
  TradeOffer,
} from "./types";

const MS_PER_MINUTE = 60_000;

/**
 * Open with `closesAt <= now` is expired: the same comparison the SQL functions apply when
 * accepting or offering, so the label and the database never disagree at the boundary.
 */
export function effectiveListingStatus(
  listing: Pick<TradeListing, "status" | "closesAt">,
  now: Date,
): EffectiveListingStatus {
  if (listing.status === "open" && Date.parse(listing.closesAt) <= now.getTime()) return "expired";
  return listing.status;
}

/** A pending offer on a listing that ran out reads "expired"; resolved offers keep their status. */
export function effectiveOfferStatus(
  offer: Pick<TradeOffer, "status">,
  listing: Pick<TradeListing, "status" | "closesAt">,
  now: Date,
): EffectiveOfferStatus {
  return offer.status === "pending" && effectiveListingStatus(listing, now) === "expired"
    ? "expired"
    : offer.status;
}

/** Milliseconds until the window closes; 0 unless the listing is still effectively open. */
export function timeLeft(listing: Pick<TradeListing, "status" | "closesAt">, now: Date): number {
  if (effectiveListingStatus(listing, now) !== "open") return 0;
  return Math.max(0, Date.parse(listing.closesAt) - now.getTime());
}

/** "23h 12m", "45m" or "Closed". Minutes round up so the countdown never reads 0m while open. */
export function formatTimeLeft(ms: number): string {
  const minutes = Math.ceil(ms / MS_PER_MINUTE);
  if (minutes <= 0) return "Closed";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
