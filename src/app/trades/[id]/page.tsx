import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/features/auth/guards";
import { ListingHero } from "@/features/trades/components/listing-hero";
import { OfferCard } from "@/features/trades/components/offer-card";
import { OfferPanel } from "@/features/trades/components/trade-forms";
import { TradesJoinPrompt } from "@/features/trades/components/trades-join-prompt";
import { listingParamSchema } from "@/features/trades/schemas";
import { getTradesService } from "@/features/trades/trades.server";
import { EmptyState, PageMain, PageSection } from "@/ui/page";
import {
  acceptOfferAction,
  cancelListingAction,
  makeOfferAction,
  rejectOfferAction,
  withdrawOfferAction,
} from "../actions";

export const metadata: Metadata = { title: "Trade" };

const actions = {
  accept: acceptOfferAction,
  reject: rejectOfferAction,
  withdraw: withdrawOfferAction,
};

export default async function TradeListingPage({ params }: PageProps<"/trades/[id]">) {
  const id = listingParamSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const user = await getCurrentUser();
  const view = await (await getTradesService()).getListingView(id.data, user);
  if (!view) notFound();

  const now = new Date();
  const { listing } = view;
  const { offers } = view;

  return (
    <PageMain>
      <ListingHero view={view} cancel={cancelListingAction} />

      {view.role === "signed_out" ? (
        <TradesJoinPrompt signedIn={false} next={`/trades/${listing.id}`} />
      ) : null}
      {view.role === "spectator" ? <TradesJoinPrompt signedIn /> : null}

      {view.role === "bidder" ? (
        <PageSection title="Make an offer">
          <OfferPanel
            listingId={listing.id}
            choices={view.offerChoices}
            blockedReason={view.offerBlockedReason}
            action={makeOfferAction}
            hasOffer={view.myOffer !== null}
          />
        </PageSection>
      ) : null}

      <PageSection
        title="Offers"
        description={
          view.role === "owner" && view.status === "open"
            ? "Accept any offer, any time before the clock runs out. Accepting swaps the players right away."
            : undefined
        }
      >
        {offers.length === 0 ? (
          <EmptyState
            title="No offers yet"
            description={
              view.status === "open"
                ? "Offers from other teams show up here."
                : "Nobody made an offer on this listing."
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {offers.map((offer) => (
              <OfferCard
                key={offer.offer.id}
                view={offer}
                listing={listing}
                now={now}
                actions={actions}
                viewerIsOwner={view.role === "owner"}
              />
            ))}
          </ul>
        )}
      </PageSection>
    </PageMain>
  );
}
