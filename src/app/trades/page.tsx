import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/features/auth/guards";
import {
  ListingSummaryCard,
  MyOfferSummaryCard,
  RecentTradeCard,
} from "@/features/trades/components/listing-cards";
import { OfferCard } from "@/features/trades/components/offer-card";
import { CelebrateTrade } from "@/features/trades/components/trade-celebration";
import { TradesJoinPrompt } from "@/features/trades/components/trades-join-prompt";
import { KIND_LABEL } from "@/features/trades/components/trade-parts";
import { getTradesService } from "@/features/trades/trades.server";
import { buttonVariants } from "@/ui/button";
import { FlashSlot } from "@/ui/flash-slot";
import { MovesSwitch } from "@/ui/moves-switch";
import { EmptyState, PageHeader, PageMain, PageSection } from "@/ui/page";
import { cn } from "cn";
import { acceptOfferAction, rejectOfferAction, withdrawOfferAction } from "./actions";

export const metadata: Metadata = { title: "Trades" };

const actions = {
  accept: acceptOfferAction,
  reject: rejectOfferAction,
  withdraw: withdrawOfferAction,
};

export default async function TradesPage() {
  const user = await getCurrentUser();
  const area = await (await getTradesService()).getTradesArea(user);
  const now = new Date();
  const { myTeam } = area;

  return (
    <PageMain width="wide">
      <CelebrateTrade offerIds={area.celebrate} />
      <PageHeader
        title="Trades"
        description="Put players on the block, make offers and swap picks, one sport at a time."
        actions={
          myTeam ? (
            <Link
              href="/trades/new"
              className={cn(buttonVariants(), "h-10 gap-1.5 px-4 font-semibold")}
            >
              <Plus aria-hidden="true" />
              New trade
            </Link>
          ) : null
        }
      />

      <MovesSwitch current="trades" />

      {myTeam ? null : <TradesJoinPrompt signedIn={user !== null} />}

      {myTeam ? (
        <>
          <PageSection
            title="Waiting on you"
            description="Offers on your players. Accepting swaps them right away and can't be undone."
          >
            {/* The flash wraps both states: answering the last offer empties the list, and the
                outcome message has to outlive it. */}
            <FlashSlot>
              {area.waitingOnYou.length === 0 ? (
                <EmptyState
                  title="Nothing waiting"
                  description="When someone offers a trade for your players, it shows up here."
                />
              ) : (
                <div className="flex flex-col gap-6">
                  {area.waitingOnYou.map(({ listing: card, offers }) => (
                    <div key={card.listing.id} className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <h3 className="text-lg font-bold">
                          {KIND_LABEL[card.listing.kind]}:{" "}
                          <span className="normal-case">
                            {card.listing.items.map((i) => i.participant.name).join(", ")}
                          </span>
                        </h3>
                        <Link
                          href={`/trades/${card.listing.id}`}
                          className="rounded-sm text-sm font-semibold text-brand-bright underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
                        >
                          Open listing ({card.timeLeft} left)
                        </Link>
                      </div>
                      <ul className="grid gap-3 md:grid-cols-2">
                        {offers.map((view) => (
                          <OfferCard
                            key={view.offer.id}
                            view={view}
                            listing={card.listing}
                            now={now}
                            actions={actions}
                            viewerIsOwner
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </FlashSlot>
          </PageSection>

          <PageSection
            title="Your listings"
            description="Players you have up for trade, and the ones that wrapped up in the last week."
          >
            {area.myListings.length === 0 ? (
              <EmptyState
                title="No listings yet"
                description="Put a player on the trading block and offers will come to you."
              />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {area.myListings.map((card, i) => (
                  <ListingSummaryCard
                    key={card.listing.id}
                    card={card}
                    index={i}
                    showOwner={false}
                  />
                ))}
              </ul>
            )}
          </PageSection>

          <PageSection
            title="Your offers"
            description="Offers you have made on other teams' players."
          >
            {area.myOffers.length === 0 ? (
              <EmptyState
                title="No offers out"
                description="Find a player on the trading block and make an offer."
              />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {area.myOffers.map((card, i) => (
                  <MyOfferSummaryCard
                    key={card.offer.id}
                    card={card}
                    index={i}
                    now={now}
                    withdraw={withdrawOfferAction}
                  />
                ))}
              </ul>
            )}
          </PageSection>
        </>
      ) : null}

      <PageSection
        title="Trading block"
        description="Every listing that is open for offers right now."
      >
        {area.block.length === 0 ? (
          <EmptyState
            title="The block is empty"
            description="Nobody has players up for trade at the moment."
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {area.block.map((card, i) => (
              <ListingSummaryCard key={card.listing.id} card={card} index={i} />
            ))}
          </ul>
        )}
      </PageSection>

      <PageSection title="Recent trades" description="Deals that went through.">
        {area.recent.length === 0 ? (
          <EmptyState
            title="No trades yet"
            description="Completed trades show up here with both teams and the players that moved."
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {area.recent.map((card, i) => (
              <RecentTradeCard key={card.listing.id} card={card} now={now} index={i} />
            ))}
          </ul>
        )}
      </PageSection>
    </PageMain>
  );
}
