import { MESSAGE_MAX_LENGTH } from "@/domain/feed";
import type { TradePayloadDraft, TradeTeamLink } from "@/domain/feed";
import type { ParticipantData } from "@/domain/league";
import type { SportCode } from "@/domain/sports/sports";
import { bySportOrder, joinList, possessive, tidyNote, truncate, withSport } from "./copy";
import type { TradeItem } from "./types";

/**
 * Feed posts for trades. The SQL functions write the post in the same transaction as the trade,
 * so the domain hands them the finished body and payload. The payload has no `listingId`: the
 * function injects it, because the listing does not exist until it runs.
 */
export type TradePost<T extends TradePayloadDraft["type"]> = {
  body: string;
  payload: Extract<TradePayloadDraft, { type: T }>;
};

const link = (team: TradeTeamLink): TradeTeamLink => ({ name: team.name, slug: team.slug });

/** A body always fits the feed's limit, even for an eleven-sport trade with long names. */
const fit = (body: string) => truncate(body, MESSAGE_MAX_LENGTH);

/** Adds the note if there is room; a note too long for the space is shortened, never dropped mid-word. */
function withNote(sentence: string, note: string | null): string {
  if (!note) return sentence;
  const prefix = `${sentence} Note: "`;
  const room = MESSAGE_MAX_LENGTH - prefix.length - 1;
  return room < 12 ? sentence : `${prefix}${truncate(note, room)}"`;
}

/** A team puts its players on the trading block. */
export function tradeListedPost(input: {
  team: TradeTeamLink;
  items: readonly TradeItem[];
}): TradePost<"trade_listed"> {
  const items = bySportOrder(input.items);
  return {
    body: fit(`${input.team.name} put ${joinList(items.map(withSport))} on the trading block.`),
    payload: {
      type: "trade_listed",
      team: link(input.team),
      items: items.map((i) => ({ sport: i.sport, participantName: i.participant.name })),
    },
  };
}

export type TradeLegPair = {
  sport: SportCode;
  /** What the offerer gives. */
  gives: ParticipantData;
  /** What the offerer asks for: the listing owner's participant. */
  gets: ParticipantData;
};

/**
 * An offer. `direct` is the first offer that creates a listing on another team; `competing` is an
 * extra offer on a listing that is already open.
 */
export function tradeOfferPost(input: {
  offerKind: "direct" | "competing";
  from: TradeTeamLink;
  to: TradeTeamLink;
  legs: readonly TradeLegPair[];
  note?: string | null;
}): TradePost<"trade_offer"> {
  const legs = bySportOrder(input.legs);
  const note = tidyNote(input.note ?? null);
  const gives = joinList(legs.map((l) => withSport({ sport: l.sport, participant: l.gives })));
  const gets = joinList(legs.map((l) => l.gets.name));
  const lead =
    input.offerKind === "direct"
      ? `${input.from.name} offered`
      : `${input.from.name} made a competing offer:`;
  return {
    body: fit(withNote(`${lead} ${gives} for ${possessive(input.to.name)} ${gets}.`, note)),
    payload: {
      type: "trade_offer",
      offerKind: input.offerKind,
      from: link(input.from),
      to: link(input.to),
      legs: legs.map((l) => ({ sport: l.sport, gives: l.gives.name, gets: l.gets.name })),
      note,
    },
  };
}

export type TradeCompletedLeg = {
  sport: SportCode;
  ownerGave: ParticipantData;
  offererGave: ParticipantData;
};

/** The listing owner accepted an offer and the players changed teams. */
export function tradeCompletedPost(input: {
  owner: TradeTeamLink;
  offerer: TradeTeamLink;
  legs: readonly TradeCompletedLeg[];
}): TradePost<"trade_completed"> {
  const legs = bySportOrder(input.legs);
  const sent = joinList(legs.map((l) => withSport({ sport: l.sport, participant: l.ownerGave })));
  const received = joinList(legs.map((l) => l.offererGave.name));
  return {
    body: fit(
      `Trade done: ${input.owner.name} send ${sent} to ${input.offerer.name} for ${received}.`,
    ),
    payload: {
      type: "trade_completed",
      owner: link(input.owner),
      offerer: link(input.offerer),
      legs: legs.map((l) => ({
        sport: l.sport,
        ownerGave: l.ownerGave.name,
        offererGave: l.offererGave.name,
      })),
    },
  };
}
