import type { SportCode } from "@/domain/sports/sports";

export const MESSAGE_KINDS = ["member", "league"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export type MessageAuthor = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  /** The team they own this season, for the chip beside their name. */
  team: { name: string; slug: string } | null;
};

export type ScoreUpdateItem = {
  teamSlug: string;
  teamName: string;
  participantName: string;
  sport: SportCode;
  pointsDelta: number;
};

export type MoverItem = {
  teamSlug: string;
  teamName: string;
  direction: "up" | "down";
  places: number;
  rank: number;
  rankLabel: string;
};

export type TradeTeamLink = { name: string; slug: string };

/** A trade post says which listing it is about, so the card can link to /trades/[listingId]. */
export type TradeListedPayload = {
  type: "trade_listed";
  listingId: string;
  team: TradeTeamLink;
  items: { sport: SportCode; participantName: string }[];
};

/** How an offer came about; the feed owns payloads, so trades and emails reuse this. */
export const OFFER_KINDS = ["direct", "competing"] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];

export type TradeOfferPayload = {
  type: "trade_offer";
  listingId: string;
  /** "competing" is an offer on a listing that already has one or is on the trading block. */
  offerKind: OfferKind;
  from: TradeTeamLink;
  to: TradeTeamLink;
  /** Per sport: what the offerer gives and what it asks for. */
  legs: { sport: SportCode; gives: string; gets: string }[];
  note: string | null;
};

export type TradeCompletedPayload = {
  type: "trade_completed";
  listingId: string;
  owner: TradeTeamLink;
  offerer: TradeTeamLink;
  legs: { sport: SportCode; ownerGave: string; offererGave: string }[];
};

export type TradePayload = TradeListedPayload | TradeOfferPayload | TradeCompletedPayload;

/**
 * What a trade post builder returns: the payload without `listingId`. The database function that
 * creates the post injects it in the same transaction (the listing does not exist until then).
 */
type WithoutListing<P> = P extends unknown ? Omit<P, "listingId"> : never;
export type TradePayloadDraft = WithoutListing<TradePayload>;

/**
 * A free-agent move: one team dropped a participant and picked up another in the same sport.
 * `moveId` lets the card link to the moves list; the database function injects it in the same
 * transaction, so the builder returns the draft below.
 */
export type FreeAgentMovePayload = {
  type: "free_agent_move";
  moveId: string;
  team: TradeTeamLink;
  sport: SportCode;
  dropped: string;
  added: string;
};
export type FreeAgentMovePayloadDraft = Omit<FreeAgentMovePayload, "moveId">;

export type ScoreUpdatePayload = { type: "score_update"; items: ScoreUpdateItem[] };
export type MoversPayload = { type: "movers"; date: string | null; items: MoverItem[] };

export type LeaguePayload =
  | ScoreUpdatePayload
  | MoversPayload
  | TradePayload
  | FreeAgentMovePayload;

export type Message = {
  id: string;
  kind: MessageKind;
  parentId: string | null;
  /** Empty once deleted: the text never reaches the client for a removed message. */
  body: string;
  deleted: boolean;
  /** Null for league posts, and for a member whose profile was deleted. */
  author: MessageAuthor | null;
  /** Set on league posts the UI can render richly; null for member messages. */
  payload: LeaguePayload | null;
  createdAt: string;
};

export type Thread = { message: Message; replies: Message[] };
