import { Clock } from "lucide-react";
import Link from "next/link";
import type { TradeItem, TradeListing, TradeListingSummary, TradeOffer } from "@/domain/trades";
import { relativeTime } from "@/lib/time";
import { buttonVariants } from "@/ui/button";
import { cn } from "cn";
import type { ListingCard, MyOfferCard } from "../trade-views";
import { WithdrawOfferButton, type TradeAction } from "./trade-actions";
import {
  KIND_LABEL,
  ListingStatusPill,
  OfferStatusPill,
  PlayerLine,
  SportTag,
  SwapRow,
  TeamLine,
} from "./trade-parts";

const card = "flex flex-col gap-3 rounded-2xl border bg-surface p-4 shadow-lift";
const viewLink = cn(buttonVariants({ variant: "outline" }), "h-10 px-4");

const offerCount = (n: number) => (n === 0 ? "No offers yet" : n === 1 ? "1 offer" : `${n} offers`);

/** "23h 12m left" while a listing is live, or its final state once it is not. */
export function TimeLeft({ card }: { card: Pick<ListingCard, "status" | "timeLeft"> }) {
  if (card.status !== "open") return <ListingStatusPill status={card.status} />;
  return (
    <span className="tabular inline-flex items-center gap-1.5 text-sm font-semibold">
      <Clock aria-hidden="true" className="size-4 text-brand-bright" />
      {card.timeLeft} left
    </span>
  );
}

/** The other side of a leg: what the listing's owner gives in that sport. */
export const itemFor = (items: readonly TradeItem[], sport: TradeItem["sport"]) =>
  items.find((i) => i.sport === sport);

/** A listing in a list: whose players, which sports, how long it has, and a way in. */
export function ListingSummaryCard({
  card: c,
  index = 0,
  showOwner = true,
}: {
  card: ListingCard;
  index?: number;
  /** Your own listings drop the owner line: it is you. */
  showOwner?: boolean;
}) {
  const { listing } = c;
  return (
    <li className="animate-rise" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
      <article
        aria-label={`${KIND_LABEL[listing.kind]} from ${listing.ownerTeam.name}`}
        className={cn(
          card,
          "h-full",
          c.isMine && showOwner ? "border-brand/70 shadow-glow-brand" : "border-line",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          {showOwner ? (
            <TeamLine team={listing.ownerTeam} showOwner />
          ) : (
            <span className="text-sm font-semibold">{KIND_LABEL[listing.kind]}</span>
          )}
          <TimeLeft card={c} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
          {showOwner ? <span>{KIND_LABEL[listing.kind]}</span> : null}
          {c.isMine && showOwner ? (
            <span className="rounded-full bg-brand px-1.5 py-0.5 text-[0.65rem] leading-none font-bold text-on-brand">
              Your listing
            </span>
          ) : null}
        </div>
        <ul className="flex flex-col divide-y divide-line/70">
          {listing.items.map((item) => (
            <li key={item.sport} className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0">
              <SportTag sport={item.sport} />
              <PlayerLine sport={item.sport} participant={item.participant} sportLabel="none" />
            </li>
          ))}
        </ul>
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <span
            className={cn(
              "text-sm",
              c.pendingOffers > 0 ? "font-semibold text-brand-bright" : "text-text-muted",
            )}
          >
            {/* A resolved listing has no pending offers by definition; its pill already says why. */}
            {c.status === "open" ? offerCount(c.pendingOffers) : null}
          </span>
          <Link href={`/trades/${listing.id}`} className={viewLink}>
            View listing
            <span className="sr-only"> from {listing.ownerTeam.name}</span>
          </Link>
        </div>
      </article>
    </li>
  );
}

/** What each side handed over, for a completed trade. Null when the accepted offer is missing. */
function acceptedOffer(listing: TradeListing): TradeOffer | undefined {
  return listing.offers.find((o) => o.id === listing.acceptedOfferId);
}

/** A finished trade: both teams and each swap. */
export function RecentTradeCard({
  card: c,
  now,
  index = 0,
}: {
  card: ListingCard;
  now: Date;
  index?: number;
}) {
  const { listing } = c;
  const offer = acceptedOffer(listing);
  return (
    <li className="animate-rise" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
      <article
        aria-label={`Trade between ${listing.ownerTeam.name} and ${offer?.offeringTeam.name ?? "another team"}`}
        className={cn(card, "h-full border-line")}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 sm:gap-3">
          <TeamLine team={listing.ownerTeam} />
          <span aria-hidden="true" className="text-text-muted">
            &amp;
          </span>
          {offer ? <TeamLine team={offer.offeringTeam} /> : <span />}
        </div>
        {offer ? (
          <ul className="flex flex-col divide-y divide-line/70">
            {offer.legs.map((leg) => {
              const got = itemFor(listing.items, leg.sport);
              return got ? (
                <li key={leg.sport} className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0">
                  <SportTag sport={leg.sport} />
                  <SwapRow sport={leg.sport} left={got.participant} right={leg.participant} />
                </li>
              ) : null;
            })}
          </ul>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-text-muted">
            {listing.resolvedAt
              ? `Traded ${relativeTime(new Date(listing.resolvedAt), now)}`
              : "Traded"}
          </span>
          <Link
            href={`/trades/${listing.id}`}
            className="rounded-sm text-sm font-semibold text-brand-bright underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            View trade
          </Link>
        </div>
      </article>
    </li>
  );
}

/** An offer you made, with what happened to it and a way to take it back while it is pending. */
export function MyOfferSummaryCard({
  card: c,
  index = 0,
  now,
  withdraw,
}: {
  card: MyOfferCard;
  index?: number;
  now: Date;
  withdraw: TradeAction;
}) {
  const { offer } = c;
  const listing: TradeListingSummary = offer.listing;
  return (
    <li className="animate-rise" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
      <article
        aria-label={`Your offer to ${listing.ownerTeam.name}`}
        className={cn(card, "h-full border-line")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-text-muted">Offer to</span>
            <TeamLine team={listing.ownerTeam} showOwner />
          </div>
          <div className="flex flex-col items-end gap-1">
            <OfferStatusPill status={c.status} />
            {c.status === "pending" ? (
              <span className="tabular text-xs text-text-muted">{c.timeLeft} left</span>
            ) : null}
          </div>
        </div>
        <ul className="flex flex-col divide-y divide-line/70">
          {offer.legs.map((leg) => {
            const asked = itemFor(listing.items, leg.sport);
            return asked ? (
              <li key={leg.sport} className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0">
                <SportTag sport={leg.sport} />
                <SwapRow
                  sport={leg.sport}
                  leftLabel="You give"
                  left={leg.participant}
                  rightLabel="You get"
                  right={asked.participant}
                />
              </li>
            ) : null;
          })}
        </ul>
        {offer.note ? (
          <p className="text-sm break-words text-text-muted italic">&ldquo;{offer.note}&rdquo;</p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-xs text-text-muted">
            Sent {relativeTime(new Date(offer.createdAt), now)}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <WithdrawOfferButton offerId={offer.id} canWithdraw={c.canWithdraw} action={withdraw} />
            <Link href={`/trades/${listing.id}`} className={viewLink}>
              View listing
              <span className="sr-only"> from {listing.ownerTeam.name}</span>
            </Link>
          </div>
        </div>
      </article>
    </li>
  );
}
