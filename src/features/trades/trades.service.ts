import type { FantasyTeamsRepository } from "@/data/fantasy-teams.repository";
import type { TradeLiveScore, TradesRepository } from "@/data/trades.repository";
import { buildLeagueModel } from "@/domain/league";
import type { LeagueData, LeagueModel, ParticipantData, StandingRow } from "@/domain/league";
import type { Actor } from "@/domain/membership/membership";
import type { SportCode } from "@/domain/sports/sports";
import {
  newOfferEmail,
  offerAcceptedEmail,
  offerLostEmail,
  offerRejectedEmail,
  tradeCompletedPost,
  tradeListedPost,
  tradeOfferPost,
  validateAcceptRequest,
  validateDirectRequest,
  validateListingRequest,
  validateOfferRequest,
} from "@/domain/trades";
import type {
  TradeCheck,
  TradeError,
  TradeLegPair,
  TradeListing,
  TradeOffer,
  TradeTeamRef,
  TradingTeam,
} from "@/domain/trades";
import type { Logger } from "@/lib/logger";
import { err, ok, type Result } from "@/lib/result";
import { easternDate } from "@/lib/time";
import type { TradeAlert, TradeNotifier } from "./trade-alerts";
import {
  blockChoices,
  buildListingView,
  buildTradesArea,
  directChoices,
  offerChoices,
} from "./trade-views";
import type { ListingView, NewTradeOptions, TradesArea } from "./trade-views";

export type Viewer = { id: string };
export type TradeResult<T> = Result<T, TradeError>;

type TradesReads = Pick<
  TradesRepository,
  | "listOpenListings"
  | "listCompleted"
  | "listListingsOwnedBy"
  | "listOffersBy"
  | "getListing"
  | "getListingByOfferId"
>;
type TradesMutations = Pick<
  TradesRepository,
  | "createListing"
  | "proposeDirect"
  | "makeOffer"
  | "withdrawOffer"
  | "rejectOffer"
  | "cancelListing"
  | "acceptOffer"
>;

export type TradesServiceDeps = {
  /** Reads are public, so the visitor's own client is enough. */
  trades: TradesReads;
  /**
   * The mutation repository, built on the admin client. A factory so a page that only reads never
   * needs the secret key.
   */
  mutations: () => TradesMutations;
  /** Uncached: accepting needs live scores and current tradeability, never the 10-minute cache. */
  loadLeague: () => Promise<LeagueData | null>;
  teams: Pick<FantasyTeamsRepository, "getOwnedBy">;
  notifier: TradeNotifier;
  now: () => Date;
  logger: Logger;
};

/** Each list on the Trades screens is capped; the newest are the ones people look for. */
const LIST_LIMIT = 30;

const NO_TEAM = "You need an approved team in this league to trade.";
const NO_SEASON = "There isn't an active season right now.";

export type TradesService = ReturnType<typeof createTradesService>;

const link = (row: Pick<StandingRow, "teamName" | "slug">) => ({
  name: row.teamName,
  slug: row.slug,
});
const tradingTeam = (row: StandingRow): TradingTeam => ({ id: row.teamId, picks: row.picks });
const pickIn = (row: StandingRow, sport: SportCode) => row.picks.find((p) => p.sport === sport);

/** Pairs each sport's participants; a sport either side lacks is dropped (validation ran first). */
function legPairs(
  sports: readonly SportCode[],
  gives: (sport: SportCode) => ParticipantData | undefined,
  gets: (sport: SportCode) => ParticipantData | undefined,
): TradeLegPair[] {
  return sports.flatMap((sport) => {
    const give = gives(sport);
    const get = gets(sport);
    return give && get ? [{ sport, gives: give, gets: get }] : [];
  });
}

/** An offer's legs against the listing's items: what the offerer gives and what it asks for. */
const offerPairs = (listing: TradeListing, offer: TradeOffer): TradeLegPair[] =>
  legPairs(
    offer.legs.map((l) => l.sport),
    (sport) => offer.legs.find((l) => l.sport === sport)?.participant,
    (sport) => listing.items.find((i) => i.sport === sport)?.participant,
  );

const refuse = (check: TradeCheck): TradeResult<never> | null =>
  check.ok ? null : { ok: false, error: check.error };

export function createTradesService(deps: TradesServiceDeps) {
  async function freshModel(now: Date): Promise<LeagueModel | null> {
    const data = await deps.loadLeague();
    return data ? buildLeagueModel(data, easternDate(now)) : null;
  }

  /** Who is acting, on a fresh model: their team must exist and be in it. */
  async function actorContext(
    actor: Actor,
  ): Promise<TradeResult<{ now: Date; model: LeagueModel; me: StandingRow }>> {
    const now = deps.now();
    // Independent reads, so they overlap; the league load is the slow one.
    const [team, model] = await Promise.all([deps.teams.getOwnedBy(actor.id), freshModel(now)]);
    if (!team) return err("not_owner", NO_TEAM);
    if (!model) return err("not_found", NO_SEASON);
    const me = model.standings.find((r) => r.teamId === team.id);
    if (!me) return err("not_owner", NO_TEAM);
    return ok({ now, model, me });
  }

  /**
   * The offers the accept just rejected. A failed re-read must not undo the trade, so it costs
   * the lost-offer emails, not the result.
   */
  async function lostOffers(listingId: string, acceptedOfferId: string): Promise<TradeOffer[]> {
    try {
      const after = await deps.trades.getListing(listingId);
      const accepted = after?.offers.find((o) => o.id === acceptedOfferId);
      if (!after || !accepted?.resolvedAt) return [];
      return after.offers.filter(
        (o) => o.status === "rejected" && o.resolvedAt === accepted.resolvedAt,
      );
    } catch (error) {
      deps.logger.error("could not read back a trade's lost offers", { error, listingId });
      return [];
    }
  }

  /**
   * Alerts go out after the response, so scheduling one can only fail loudly-and-harmlessly:
   * a trade that already happened is never undone by an email problem.
   */
  function schedule(alerts: TradeAlert[]) {
    if (alerts.length === 0) return;
    try {
      deps.notifier.notify(alerts);
    } catch (error) {
      deps.logger.error("could not schedule trade alerts", { error });
    }
  }

  const ownerAlert = (
    owner: TradeTeamRef["owner"],
    input: Omit<TradeAlert, "recipientId">,
  ): TradeAlert[] => (owner ? [{ ...input, recipientId: owner.id }] : []);

  return {
    // ===== reads =====

    /** Everything the Trades area renders, for the viewer or (signed out) for anyone. */
    async getTradesArea(viewer: Viewer | null): Promise<TradesArea> {
      const now = deps.now();
      const myTeam = viewer ? await deps.teams.getOwnedBy(viewer.id) : null;
      const [open, completed, mine, myOffers] = await Promise.all([
        deps.trades.listOpenListings(now),
        deps.trades.listCompleted({ limit: LIST_LIMIT }),
        myTeam ? deps.trades.listListingsOwnedBy(myTeam.id, { limit: LIST_LIMIT }) : [],
        myTeam ? deps.trades.listOffersBy(myTeam.id, { limit: LIST_LIMIT }) : [],
      ]);
      return buildTradesArea({ now, myTeam, open, completed, mine, myOffers });
    },

    /** One listing as the viewer may act on it, or null when there is no such listing. */
    async getListingView(listingId: string, viewer: Viewer | null): Promise<ListingView | null> {
      const now = deps.now();
      const [listing, viewerTeam] = await Promise.all([
        deps.trades.getListing(listingId),
        viewer ? deps.teams.getOwnedBy(viewer.id) : null,
      ]);
      if (!listing) return null;

      let choices: ReturnType<typeof offerChoices> = { choices: [], blockedReason: null };
      if (viewerTeam && viewerTeam.id !== listing.ownerTeam.id) {
        // Only a bidder needs the model: it says which of their sports are still tradeable.
        const model = await freshModel(now);
        const me = model?.standings.find((r) => r.teamId === viewerTeam.id);
        choices =
          model && me
            ? offerChoices({
                listing,
                team: tradingTeam(me),
                sportStatuses: model.sports,
                now,
              })
            : { choices: [], blockedReason: NO_SEASON };
      }
      return buildListingView({ listing, viewer, viewerTeam, choices, now });
    },

    /** The new-trade screen: your picks for the block, and every other owned team for an offer. */
    async getNewTradeOptions(viewer: Viewer): Promise<NewTradeOptions | null> {
      const now = deps.now();
      const myTeam = await deps.teams.getOwnedBy(viewer.id);
      if (!myTeam) return null;
      const [model, listings] = await Promise.all([
        freshModel(now),
        deps.trades.listOpenListings(now),
      ]);
      const me = model?.standings.find((r) => r.teamId === myTeam.id);
      if (!model || !me) return null;

      const team = tradingTeam(me);
      const shared = { sportStatuses: model.sports, listings, now };
      return {
        myTeam,
        myPicks: blockChoices({ team, ...shared }),
        teams: model.standings
          .filter((row) => row.teamId !== me.teamId && row.owner)
          .sort((a, b) => a.teamName.localeCompare(b.teamName, "en", { sensitivity: "base" }))
          .map((row) => ({
            team: { id: row.teamId, name: row.teamName, slug: row.slug, owner: row.owner },
            choices: directChoices({
              team,
              target: { ...tradingTeam(row), owner: row.owner },
              ...shared,
            }),
          })),
      };
    },

    // ===== mutations =====
    // Each: fresh model, domain validation, domain post, repository, then alerts on success.

    async createListing(
      actor: Actor,
      sports: readonly SportCode[],
    ): Promise<TradeResult<{ listingId: string }>> {
      const ctx = await actorContext(actor);
      if (!ctx.ok) return ctx;
      const { now, model, me } = ctx.value;

      const listings = await deps.trades.listOpenListings(now);
      const refused = refuse(
        validateListingRequest({
          sports,
          team: tradingTeam(me),
          sportStatuses: model.sports,
          listings,
          now,
        }),
      );
      if (refused) return refused;

      const items = sports.flatMap((sport) => {
        const pick = pickIn(me, sport);
        return pick ? [{ sport, participant: pick.participant }] : [];
      });
      return deps.mutations().createListing({
        actorId: actor.id,
        sports,
        post: tradeListedPost({ team: link(me), items }),
      });
    },

    /** Offer another team a trade. Creates a listing on the target, carrying this offer. */
    async proposeDirect(
      actor: Actor,
      targetTeamId: string,
      sports: readonly SportCode[],
      note: string | null,
    ): Promise<TradeResult<{ listingId: string; offerId: string }>> {
      const ctx = await actorContext(actor);
      if (!ctx.ok) return ctx;
      const { now, model, me } = ctx.value;

      const target = model.standings.find((r) => r.teamId === targetTeamId);
      if (!target) return err("not_found", "That team doesn't exist.");
      const listings = await deps.trades.listOpenListings(now);
      const refused = refuse(
        validateDirectRequest({
          sports,
          team: tradingTeam(me),
          target: { ...tradingTeam(target), owner: target.owner },
          sportStatuses: model.sports,
          listings,
          now,
        }),
      );
      if (refused) return refused;

      const legs = legPairs(
        sports,
        (s) => pickIn(me, s)?.participant,
        (s) => pickIn(target, s)?.participant,
      );
      const post = tradeOfferPost({
        offerKind: "direct",
        from: link(me),
        to: link(target),
        legs,
        note,
      });
      const result = await deps
        .mutations()
        .proposeDirect({ actorId: actor.id, targetTeamId, sports, note, post });
      if (result.ok) {
        schedule(
          ownerAlert(target.owner, {
            event: "new_offer",
            listingId: result.value.listingId,
            offerId: result.value.offerId,
            content: newOfferEmail({ offerKind: "direct", from: me.teamName, legs, note }),
          }),
        );
      }
      return result;
    },

    /** A competing offer on someone's open listing. */
    async makeOffer(
      actor: Actor,
      listingId: string,
      sports: readonly SportCode[],
      note: string | null,
    ): Promise<TradeResult<{ offerId: string }>> {
      const ctx = await actorContext(actor);
      if (!ctx.ok) return ctx;
      const { now, model, me } = ctx.value;

      const listing = await deps.trades.getListing(listingId);
      if (!listing) return err("not_found", "That trade no longer exists.");
      const refused = refuse(
        validateOfferRequest({
          listing,
          sports,
          team: tradingTeam(me),
          sportStatuses: model.sports,
          now,
        }),
      );
      if (refused) return refused;

      const legs = legPairs(
        sports,
        (s) => pickIn(me, s)?.participant,
        (s) => listing.items.find((i) => i.sport === s)?.participant,
      );
      const post = tradeOfferPost({
        offerKind: "competing",
        from: link(me),
        to: listing.ownerTeam,
        legs,
        note,
      });
      const result = await deps
        .mutations()
        .makeOffer({ actorId: actor.id, listingId, sports, note, post });
      if (result.ok) {
        schedule(
          ownerAlert(listing.ownerTeam.owner, {
            event: "new_offer",
            listingId,
            offerId: result.value.offerId,
            content: newOfferEmail({ offerKind: "competing", from: me.teamName, legs, note }),
          }),
        );
      }
      return result;
    },

    /** The offerer takes their offer back. SQL checks it is theirs and still pending. */
    withdrawOffer(actor: Actor, offerId: string): Promise<TradeResult<null>> {
      return deps.mutations().withdrawOffer({ actorId: actor.id, offerId });
    },

    /** The owner turns one offer down; the listing stays open for the others. */
    async rejectOffer(actor: Actor, offerId: string): Promise<TradeResult<null>> {
      const listing = await deps.trades.getListingByOfferId(offerId);
      const offer = listing?.offers.find((o) => o.id === offerId);
      if (!listing || !offer) return err("not_found", "That trade no longer exists.");

      const result = await deps.mutations().rejectOffer({ actorId: actor.id, offerId });
      if (result.ok) {
        schedule(
          ownerAlert(offer.offeringTeam.owner, {
            event: "rejected",
            listingId: listing.id,
            offerId,
            content: offerRejectedEmail({
              owner: listing.ownerTeam.name,
              legs: offerPairs(listing, offer),
            }),
          }),
        );
      }
      return result;
    },

    cancelListing(actor: Actor, listingId: string): Promise<TradeResult<null>> {
      return deps.mutations().cancelListing({ actorId: actor.id, listingId });
    },

    /**
     * Executes the trade. The database needs every participant's full live score (not the credited
     * one) to bank what each team earned so far; ADR-003 keeps scoring out of SQL, so it is
     * computed here from a fresh model, never from the cache.
     */
    async acceptOffer(actor: Actor, offerId: string): Promise<TradeResult<null>> {
      const now = deps.now();
      const listing = await deps.trades.getListingByOfferId(offerId);
      const offer = listing?.offers.find((o) => o.id === offerId);
      if (!listing || !offer) return err("not_found", "That trade no longer exists.");
      const model = await freshModel(now);
      if (!model) return err("not_found", NO_SEASON);

      const refused = refuse(
        validateAcceptRequest({ listing, offer, sportStatuses: model.sports, now }),
      );
      if (refused) return refused;

      const live = new Map<string, TradeLiveScore>();
      for (const row of model.standings) {
        for (const { participant, score } of row.picks) {
          live.set(participant.id, {
            participantId: participant.id,
            points: score.total,
            championships: score.championships,
            postseasonPoints: score.postseasonPoints,
          });
        }
      }
      const legs = offerPairs(listing, offer);
      const scores = new Map<string, TradeLiveScore>();
      for (const leg of legs) {
        for (const participant of [leg.gives, leg.gets]) {
          const score = live.get(participant.id);
          // Nobody holds it any more: refuse rather than send a guess (SQL would too).
          if (!score) {
            return err("missing_scores", "Something went wrong working out the points. Try again.");
          }
          scores.set(participant.id, score);
        }
      }

      const post = tradeCompletedPost({
        owner: listing.ownerTeam,
        offerer: offer.offeringTeam,
        legs: legs.map((l) => ({ sport: l.sport, ownerGave: l.gets, offererGave: l.gives })),
      });
      const result = await deps.mutations().acceptOffer({
        actorId: actor.id,
        offerId,
        scores: [...scores.values()],
        post,
      });
      if (!result.ok) return result;

      // Who lost is read back after the accept, not taken from the page-load snapshot: a bidder
      // who withdrew in between must not be told they lost. SQL rejects the survivors in the same
      // transaction as the accept, so they share its resolved_at. Voided offers (the sibling
      // listings and offers the trade invalidates) get no email by design.
      const owner = listing.ownerTeam.name;
      const lost = await lostOffers(listing.id, offerId);
      schedule([
        ...ownerAlert(offer.offeringTeam.owner, {
          event: "accepted",
          listingId: listing.id,
          offerId,
          content: offerAcceptedEmail({ owner, legs }),
        }),
        ...lost.flatMap((o) =>
          ownerAlert(o.offeringTeam.owner, {
            event: "lost",
            listingId: listing.id,
            offerId: o.id,
            content: offerLostEmail({ owner, legs: offerPairs(listing, o) }),
          }),
        ),
      ]);
      return result;
    },
  };
}
