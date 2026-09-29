import type { OfferKind } from "@/domain/feed";
import { bySportOrder, joinList, possessive, tidyNote, withSport } from "./copy";
import type { TradeLegPair } from "./posts";
import { TRADE_WINDOW_HOURS } from "./types";

/**
 * What each trade email says, as plain text. The feature layer renders these with react-email and
 * adds the button and the "turn off trade emails on your profile" footer, so neither is repeated
 * here. Every builder takes the same two views of a trade: who, and the legs.
 */
export type TradeEmailContent = { subject: string; lines: string[] };

type Legs = { legs: readonly TradeLegPair[] };

const gives = (legs: readonly TradeLegPair[]) =>
  joinList(bySportOrder(legs).map((l) => withSport({ sport: l.sport, participant: l.gives })));
const gets = (legs: readonly TradeLegPair[]) =>
  joinList(bySportOrder(legs).map((l) => withSport({ sport: l.sport, participant: l.gets })));

/** To the listing owner: someone made an offer on their players. */
export function newOfferEmail(
  input: Legs & { offerKind: OfferKind; from: string; note?: string | null },
): TradeEmailContent {
  const note = tidyNote(input.note ?? null);
  return {
    subject:
      input.offerKind === "direct"
        ? `${input.from} wants to trade with you`
        : `New offer on your trading block from ${input.from}`,
    lines: [
      `${input.from} offered ${gives(input.legs)} for your ${gets(input.legs)}.`,
      ...(note ? [`They wrote: "${note}"`] : []),
      input.offerKind === "direct"
        ? `You have ${TRADE_WINDOW_HOURS} hours to accept or reject it.`
        : "You can accept or reject any offer until the listing closes.",
    ],
  };
}

/** To the offerer: the owner said yes. Points each team already earned stay with it. */
export function offerAcceptedEmail(input: Legs & { owner: string }): TradeEmailContent {
  return {
    subject: `${input.owner} accepted your offer`,
    lines: [
      `${input.owner} accepted your offer. You now have ${gets(input.legs)}, and ${input.owner} has ${gives(input.legs)}.`,
      "Points your team already earned stay with your team. Only points scored from now on count for the new pick.",
    ],
  };
}

/** To the offerer: the owner said no. */
export function offerRejectedEmail(input: Legs & { owner: string }): TradeEmailContent {
  return {
    subject: `${input.owner} passed on your offer`,
    lines: [
      `${input.owner} rejected your offer of ${gives(input.legs)} for ${possessive(input.owner)} ${gets(input.legs)}.`,
      "Nothing changed on your team.",
    ],
  };
}

/** To the offerer: the owner accepted someone else's offer, which closed the listing. */
export function offerLostEmail(input: Legs & { owner: string }): TradeEmailContent {
  return {
    subject: `${input.owner} chose a different offer`,
    lines: [
      `${input.owner} accepted another offer for ${gets(input.legs)}, so your offer of ${gives(input.legs)} is closed.`,
      "Nothing changed on your team.",
    ],
  };
}
