import { relativeTime } from "@/lib/time";
import type { TradeListing } from "@/domain/trades";
import { cn } from "cn";
import type { OfferView } from "../trade-views";
import { OfferDecisionActions, WithdrawOfferButton, type TradeAction } from "./trade-actions";
import { itemFor } from "./listing-cards";
import { OfferStatusPill, SportTag, SwapRow, TeamLine } from "./trade-parts";

export type OfferActions = { accept: TradeAction; reject: TradeAction; withdraw: TradeAction };

const names = (people: readonly { name: string }[]) =>
  new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(
    people.map((p) => p.name),
  );

/**
 * One offer on a listing: who made it, each swap, their note, and the buttons the view allows.
 * The owner decides; the bidder can only take their own offer back.
 */
export function OfferCard({
  view,
  listing,
  now,
  actions,
  viewerIsOwner,
}: {
  view: OfferView;
  listing: TradeListing;
  now: Date;
  actions: OfferActions;
  viewerIsOwner: boolean;
}) {
  const { offer } = view;
  const swaps = offer.legs.flatMap((leg) => {
    const asked = itemFor(listing.items, leg.sport);
    return asked ? [{ sport: leg.sport, offered: leg.participant, asked: asked.participant }] : [];
  });
  const confirmText = `You give ${names(swaps.map((s) => s.asked))} and get ${names(swaps.map((s) => s.offered))}.`;

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-surface p-4 shadow-lift",
        view.isMine ? "border-brand/60" : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <TeamLine team={offer.offeringTeam} showOwner />
          {view.isMine ? (
            <span className="w-fit rounded-full bg-brand px-1.5 py-0.5 text-[0.65rem] leading-none font-bold text-on-brand">
              Your offer
            </span>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <OfferStatusPill status={view.status} />
          <span className="text-xs text-text-muted">
            {relativeTime(new Date(offer.createdAt), now)}
          </span>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-line/70">
        {swaps.map((swap) => (
          <li key={swap.sport} className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0">
            <SportTag sport={swap.sport} />
            {viewerIsOwner ? (
              <SwapRow
                sport={swap.sport}
                leftLabel="You give"
                left={swap.asked}
                rightLabel="You get"
                right={swap.offered}
              />
            ) : (
              <SwapRow
                sport={swap.sport}
                leftLabel={view.isMine ? "You give" : "Offers"}
                left={swap.offered}
                rightLabel={view.isMine ? "You get" : "For"}
                right={swap.asked}
              />
            )}
          </li>
        ))}
      </ul>

      {offer.note ? (
        <p className="rounded-lg bg-surface-raised px-3 py-2 text-sm break-words italic">
          &ldquo;{offer.note}&rdquo;
        </p>
      ) : null}

      {viewerIsOwner ? (
        <OfferDecisionActions
          offerId={offer.id}
          canAccept={view.canAccept}
          canReject={view.canReject}
          confirmText={confirmText}
          accept={actions.accept}
          reject={actions.reject}
        />
      ) : null}
      {view.isMine ? (
        <WithdrawOfferButton
          offerId={offer.id}
          canWithdraw={view.canWithdraw}
          action={actions.withdraw}
        />
      ) : null}
    </li>
  );
}
