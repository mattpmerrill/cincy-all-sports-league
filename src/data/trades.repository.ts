import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import type { TradePayloadDraft } from "@/domain/feed";
import { SPORT_CODES } from "@/domain/sports/sports";
import type { SportCode } from "@/domain/sports/sports";
import { isTradeErrorCode } from "@/domain/trades";
import type {
  ListingKind,
  ListingStatus,
  OfferStatus,
  TradeError,
  TradeErrorCode,
  TradeItem,
  TradeListing,
  TradeOffer,
  TradeOfferWithListing,
  TradePost,
  TradeTeamRef,
} from "@/domain/trades";
import { ok, type Result } from "@/lib/result";
import type { Json } from "./database.types";
import { PG, type DbClient } from "./db-client";
import { PARTICIPANT_COLUMNS, toOwner, toParticipant, toSportCode } from "./mappers";
import type { OwnerRow, ParticipantRow } from "./mappers";

/**
 * Trades: reads, and thin wrappers over the seven SQL functions (ADR-003).
 *
 * Which client to pass: the tables are publicly readable, so reads work with the session or public
 * client. The functions can only be executed by `service_role`, so mutations must be given the
 * admin (secret-key) client, and the caller (a Server Action, through the trades service) must
 * already have authenticated the user and pass the id as `actorId`. Passing a session client to a
 * mutation fails with a permission error, which is thrown, never mapped.
 */

// ===== row shapes and mappers =====

type TeamEmbed = { id: string; slug: string; name: string; profiles: OwnerRow | null };
type ItemEmbed = { participants: ParticipantRow & { sports: { code: string } } };

type OfferFields = {
  id: string;
  listing_id: string;
  note: string | null;
  status: OfferStatus;
  created_at: string;
  resolved_at: string | null;
};
type OfferEmbed = OfferFields & {
  fantasy_teams: TeamEmbed;
  trade_offer_legs: ItemEmbed[];
};

type ListingFields = {
  id: string;
  kind: ListingKind;
  status: ListingStatus;
  created_by: string | null;
  created_at: string;
  closes_at: string;
  resolved_at: string | null;
  accepted_offer_id: string | null;
};
export type ListingRow = ListingFields & {
  fantasy_teams: TeamEmbed;
  trade_listing_items: ItemEmbed[];
  trade_offers: OfferEmbed[];
};
export type OfferWithListingRow = OfferFields & {
  fantasy_teams: TeamEmbed;
  trade_offer_legs: ItemEmbed[];
  trade_listings: ListingFields & { fantasy_teams: TeamEmbed; trade_listing_items: ItemEmbed[] };
};

// Embeds name their foreign key: trade_listings and trade_offers reference each other (an
// offer's listing, and a listing's accepted offer), and fantasy_teams is reached twice.
const TEAM = "id, slug, name, profiles(id, display_name, avatar_url)";
const ITEM = `participants(${PARTICIPANT_COLUMNS}, sports(code))`;
const OFFER_FIELDS = "id, listing_id, note, status, created_at, resolved_at";
const LISTING_FIELDS =
  "id, kind, status, created_by, created_at, closes_at, resolved_at, accepted_offer_id";

const OWNER_TEAM = `fantasy_teams!trade_listings_owner_team_id_season_id_fkey(${TEAM})`;
const OFFERING_TEAM = `fantasy_teams!trade_offers_offering_team_id_fkey(${TEAM})`;

const LISTING_SELECT = `${LISTING_FIELDS}, ${OWNER_TEAM}, trade_listing_items(${ITEM}), trade_offers!trade_offers_listing_id_fkey(${OFFER_FIELDS}, ${OFFERING_TEAM}, trade_offer_legs(${ITEM}))`;
const OFFER_WITH_LISTING_SELECT = `${OFFER_FIELDS}, ${OFFERING_TEAM}, trade_offer_legs(${ITEM}), trade_listings!trade_offers_listing_id_fkey(${LISTING_FIELDS}, ${OWNER_TEAM}, trade_listing_items(${ITEM}))`;

const toTeamRef = (row: TeamEmbed): TradeTeamRef => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  owner: toOwner(row.profiles),
});

/** One item per sport in catalog order: PostgREST does not order embedded rows. */
const toItems = (rows: readonly ItemEmbed[]): TradeItem[] =>
  rows
    .map(({ participants }) => ({
      sport: toSportCode(participants.sports.code),
      participant: toParticipant(participants),
    }))
    .sort((a, b) => SPORT_CODES.indexOf(a.sport) - SPORT_CODES.indexOf(b.sport));

const toOffer = (row: OfferEmbed): TradeOffer => ({
  id: row.id,
  listingId: row.listing_id,
  offeringTeam: toTeamRef(row.fantasy_teams),
  note: row.note,
  status: row.status,
  createdAt: row.created_at,
  resolvedAt: row.resolved_at,
  legs: toItems(row.trade_offer_legs),
});

const toListingSummary = (
  row: ListingFields & { fantasy_teams: TeamEmbed; trade_listing_items: ItemEmbed[] },
): Omit<TradeListing, "offers"> => ({
  id: row.id,
  kind: row.kind,
  status: row.status,
  ownerTeam: toTeamRef(row.fantasy_teams),
  createdBy: row.created_by,
  createdAt: row.created_at,
  closesAt: row.closes_at,
  resolvedAt: row.resolved_at,
  acceptedOfferId: row.accepted_offer_id,
  items: toItems(row.trade_listing_items),
});

/** Row to domain. Offers are oldest first. An unknown sport code fails loudly, as elsewhere. */
export const toTradeListing = (row: ListingRow): TradeListing => ({
  ...toListingSummary(row),
  offers: row.trade_offers
    .map(toOffer)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
});

export const toOfferWithListing = (row: OfferWithListingRow): TradeOfferWithListing => ({
  ...toOffer(row),
  listing: toListingSummary(row.trade_listings),
});

// ===== error mapping =====

/**
 * What a person sees for each code. Never the SQL token, message or detail: those stay in logs.
 * `sport_locked` is never raised by SQL (the service checks it) but the record covers the union.
 */
const MESSAGES: Record<TradeErrorCode, string> = {
  not_owner: "Only the team that owns this can do that.",
  not_found: "That trade no longer exists.",
  listing_closed: "This listing is closed.",
  offer_not_pending: "That offer was already answered or withdrawn.",
  own_listing: "You can't trade with your own team.",
  team_unowned: "That team doesn't have an owner yet.",
  invalid_sports: "Those sports can't be traded right now.",
  already_listed: "One of those players is already up for trade.",
  duplicate_offer: "You already have an offer on this listing. Withdraw it first.",
  same_participant: "You both have the same pick in one of those sports.",
  stale_pick: "One of the players has changed teams since the offer was made.",
  missing_scores: "Something went wrong working out the points. Try again.",
  sport_locked: "That sport's season is over, so it can't be traded.",
};

const listingId = z.uuid();

/**
 * A `P0001` raised by a trade function carries a stable token as its message. Anything else
 * (permissions, constraints, network) returns null and the caller rethrows it. `already_listed`
 * also carries the blocking listing's id in `details`; it is validated before it leaves the layer.
 */
export function toTradeError(
  error: Pick<PostgrestError, "code" | "message" | "details">,
): TradeError | null {
  if (error.code !== PG.raiseException || !isTradeErrorCode(error.message)) return null;
  const code = error.message;
  const blocking = code === "already_listed" ? listingId.safeParse(error.details?.trim()) : null;
  return blocking?.success
    ? { code, message: MESSAGES[code], listingId: blocking.data }
    : { code, message: MESSAGES[code] };
}

function failure(error: PostgrestError): Result<never, TradeError> {
  const mapped = toTradeError(error);
  if (!mapped) throw error;
  return { ok: false, error: mapped };
}

// ===== repository =====

/** A participant's full live score, as `accept_trade_offer` wants it for every player in the trade. */
export type TradeLiveScore = {
  participantId: string;
  points: number;
  championships: number;
  postseasonPoints: number;
};

type Outcome<T> = Result<T, TradeError>;

/** The rpc argument types say `string`; these parameters accept NULL in the function. */
const nullable = (value: string | null) => value as string;

/** The post payload is plain JSON built by the domain; this keeps the cast in one place. */
const asJson = (payload: TradePayloadDraft): Json => payload as unknown as Json;

export type TradesRepository = ReturnType<typeof createTradesRepository>;

export function createTradesRepository(db: DbClient) {
  async function activeSeasonId(): Promise<string | null> {
    const { data, error } = await db
      .from("seasons")
      .select("id")
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  }

  async function getListing(id: string): Promise<TradeListing | null> {
    const { data, error } = await db
      .from("trade_listings")
      .select(LISTING_SELECT)
      .eq("id", id)
      .maybeSingle<ListingRow>();
    if (error) throw error;
    return data ? toTradeListing(data) : null;
  }

  return {
    // ----- reads (public read; any client) -----

    /**
     * Open listings in the active season whose window has not closed at `now` (the caller's clock,
     * compared exactly as the SQL functions do with `closes_at > now()`), soonest to close first.
     */
    async listOpenListings(now: Date): Promise<TradeListing[]> {
      const seasonId = await activeSeasonId();
      if (!seasonId) return [];
      const { data, error } = await db
        .from("trade_listings")
        .select(LISTING_SELECT)
        .eq("season_id", seasonId)
        .eq("status", "open")
        .gt("closes_at", now.toISOString())
        .order("closes_at", { ascending: true })
        .returns<ListingRow[]>();
      if (error) throw error;
      return data.map(toTradeListing);
    },

    /** One listing with its items and every offer and leg, or null when the id matches nothing. */
    getListing,

    /**
     * The listing an offer was made on, with every offer on it, or null when the offer id matches
     * nothing. The service needs the whole listing to answer an offer: who else is waiting, and
     * what each side gives.
     */
    async getListingByOfferId(offerId: string): Promise<TradeListing | null> {
      const { data, error } = await db
        .from("trade_offers")
        .select("listing_id")
        .eq("id", offerId)
        .maybeSingle();
      if (error) throw error;
      return data ? getListing(data.listing_id) : null;
    },

    /** A team's own listings in the active season, newest first, whatever their status. */
    async listListingsOwnedBy(teamId: string, opts: { limit: number }): Promise<TradeListing[]> {
      const seasonId = await activeSeasonId();
      if (!seasonId) return [];
      const { data, error } = await db
        .from("trade_listings")
        .select(LISTING_SELECT)
        .eq("season_id", seasonId)
        .eq("owner_team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(opts.limit)
        .returns<ListingRow[]>();
      if (error) throw error;
      return data.map(toTradeListing);
    },

    /** Offers a team made (any status, newest first), each with the listing it was made on. */
    async listOffersBy(teamId: string, opts: { limit: number }): Promise<TradeOfferWithListing[]> {
      const { data, error } = await db
        .from("trade_offers")
        .select(OFFER_WITH_LISTING_SELECT)
        .eq("offering_team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(opts.limit)
        .returns<OfferWithListingRow[]>();
      if (error) throw error;
      return data.map(toOfferWithListing);
    },

    /** Accepted trades in the active season, most recent first: the "Recent trades" list. */
    async listCompleted(opts: { limit: number }): Promise<TradeListing[]> {
      const seasonId = await activeSeasonId();
      if (!seasonId) return [];
      const { data, error } = await db
        .from("trade_listings")
        .select(LISTING_SELECT)
        .eq("season_id", seasonId)
        .eq("status", "accepted")
        .order("resolved_at", { ascending: false })
        .limit(opts.limit)
        .returns<ListingRow[]>();
      if (error) throw error;
      return data.map(toTradeListing);
    },

    // ----- mutations (admin client only; see the file header) -----

    /** Puts the actor's own picks in `sports` on the trading block. */
    async createListing(input: {
      actorId: string;
      sports: readonly SportCode[];
      post: TradePost<"trade_listed">;
    }): Promise<Outcome<{ listingId: string }>> {
      const { data, error } = await db.rpc("create_trade_listing", {
        p_actor: input.actorId,
        p_sport_codes: [...input.sports],
        p_post_body: input.post.body,
        p_post_payload: asJson(input.post.payload),
      });
      if (error) return failure(error);
      return ok({ listingId: data });
    },

    /** Creates a listing on the target team (its picks in `sports`) carrying the actor's offer. */
    async proposeDirect(input: {
      actorId: string;
      targetTeamId: string;
      sports: readonly SportCode[];
      note: string | null;
      post: TradePost<"trade_offer">;
    }): Promise<Outcome<{ listingId: string; offerId: string }>> {
      const { data, error } = await db.rpc("propose_direct_trade", {
        p_actor: input.actorId,
        p_target_team_id: input.targetTeamId,
        p_sport_codes: [...input.sports],
        p_note: nullable(input.note),
        p_post_body: input.post.body,
        p_post_payload: asJson(input.post.payload),
      });
      if (error) return failure(error);
      const row = data[0];
      if (!row) throw new Error("propose_direct_trade returned no row");
      return ok({ listingId: row.listing_id, offerId: row.offer_id });
    },

    /** Adds the actor's offer (their picks in `sports`) to an open listing. */
    async makeOffer(input: {
      actorId: string;
      listingId: string;
      sports: readonly SportCode[];
      note: string | null;
      post: TradePost<"trade_offer">;
    }): Promise<Outcome<{ offerId: string }>> {
      const { data, error } = await db.rpc("make_trade_offer", {
        p_actor: input.actorId,
        p_listing_id: input.listingId,
        p_sport_codes: [...input.sports],
        p_note: nullable(input.note),
        p_post_body: input.post.body,
        p_post_payload: asJson(input.post.payload),
      });
      if (error) return failure(error);
      return ok({ offerId: data });
    },

    async withdrawOffer(input: { actorId: string; offerId: string }): Promise<Outcome<null>> {
      const { error } = await db.rpc("withdraw_trade_offer", {
        p_actor: input.actorId,
        p_offer_id: input.offerId,
      });
      return error ? failure(error) : ok(null);
    },

    async rejectOffer(input: { actorId: string; offerId: string }): Promise<Outcome<null>> {
      const { error } = await db.rpc("reject_trade_offer", {
        p_actor: input.actorId,
        p_offer_id: input.offerId,
      });
      return error ? failure(error) : ok(null);
    },

    async cancelListing(input: { actorId: string; listingId: string }): Promise<Outcome<null>> {
      const { error } = await db.rpc("cancel_trade_listing", {
        p_actor: input.actorId,
        p_listing_id: input.listingId,
      });
      return error ? failure(error) : ok(null);
    },

    /**
     * Executes the trade. `scores` must hold the live score of every participant in the offer's
     * legs, on both sides; the function refuses (`missing_scores`) rather than guess a zero.
     */
    async acceptOffer(input: {
      actorId: string;
      offerId: string;
      scores: readonly TradeLiveScore[];
      post: TradePost<"trade_completed">;
    }): Promise<Outcome<null>> {
      const { error } = await db.rpc("accept_trade_offer", {
        p_actor: input.actorId,
        p_offer_id: input.offerId,
        p_scores: input.scores.map((s) => ({
          participant_id: s.participantId,
          points: s.points,
          championships: s.championships,
          postseason_points: s.postseasonPoints,
        })),
        p_post_body: input.post.body,
        p_post_payload: asJson(input.post.payload),
      });
      return error ? failure(error) : ok(null);
    },
  };
}
