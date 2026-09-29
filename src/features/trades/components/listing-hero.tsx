import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ListingView } from "../trade-views";
import { CancelListingButton, type TradeAction } from "./trade-actions";
import { UserAvatar } from "@/ui/user-avatar";
import { KIND_LABEL, ListingStatusPill, PlayerLine, SportTag } from "./trade-parts";

/** The top of a listing page: whose players, what kind of trade, the clock and the players. */
export function ListingHero({ view, cancel }: { view: ListingView; cancel: TradeAction }) {
  const { listing } = view;
  return (
    <header className="hero-backdrop relative overflow-hidden rounded-3xl border border-line bg-surface p-5 md:p-7">
      <Link
        href="/trades"
        className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-text-muted outline-none hover:text-text focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Trades
      </Link>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-semibold text-text-muted">
              {KIND_LABEL[listing.kind]}
            </span>
            <ListingStatusPill status={view.status} />
            {view.role === "owner" ? (
              <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-on-brand">
                Your listing
              </span>
            ) : null}
          </div>
          <h1 className="text-4xl leading-[0.95] font-extrabold break-words md:text-6xl">
            {listing.ownerTeam.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
            {listing.ownerTeam.owner ? (
              <span className="flex items-center gap-2">
                <UserAvatar
                  displayName={listing.ownerTeam.owner.displayName}
                  avatarUrl={listing.ownerTeam.owner.avatarUrl}
                  size="sm"
                />
                {listing.ownerTeam.owner.displayName}
              </span>
            ) : null}
            <Link
              href={`/teams/${listing.ownerTeam.slug}`}
              className="rounded-sm font-semibold text-brand-bright underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
            >
              View team
            </Link>
          </div>
        </div>
        {view.status === "open" ? (
          <div className="flex shrink-0 flex-col items-end leading-none">
            <span className="tabular font-display text-5xl font-extrabold md:text-7xl">
              {view.timeLeft}
            </span>
            <span className="mt-1 text-xs font-medium text-text-muted">left to make offers</span>
          </div>
        ) : null}
      </div>

      <section aria-labelledby="listed-players" className="mt-6 flex flex-col gap-2">
        <h2 id="listed-players" className="text-lg font-bold">
          {listing.kind === "direct" ? "Asked for" : "On the block"}
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {listing.items.map((item) => (
            <li
              key={item.sport}
              className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface-raised/80 p-3"
            >
              <SportTag sport={item.sport} />
              <PlayerLine
                sport={item.sport}
                participant={item.participant}
                size="md"
                sportLabel="none"
              />
            </li>
          ))}
        </ul>
      </section>

      {view.canCancel || view.role === "owner" ? (
        <div className="mt-4 empty:hidden">
          <CancelListingButton listingId={listing.id} canCancel={view.canCancel} action={cancel} />
        </div>
      ) : null}
    </header>
  );
}
