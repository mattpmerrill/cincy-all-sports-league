import type { ParticipantData } from "@/domain/league";
import type { SportCode } from "@/domain/sports/sports";
import type { SportPhases } from "./validation";
import type { TradeItem, TradeListing, TradeOffer, TradeTeamRef } from "./types";

/** Hand-built trade data for tests. Test-only; nothing in the app imports it. */

export const NOW = new Date("2026-09-29T12:00:00Z");
export const IN_AN_HOUR = "2026-09-29T13:00:00Z";
export const AN_HOUR_AGO = "2026-09-29T11:00:00Z";

export const participant = (name: string): ParticipantData => ({
  id: name.toLowerCase().replaceAll(" ", "-"),
  name,
  shortName: name,
  logoUrl: null,
  primaryColor: null,
});

export const item = (sport: SportCode, name: string): TradeItem => ({
  sport,
  participant: participant(name),
});

export const teamRef = (name: string, owned = true): TradeTeamRef => ({
  id: name.toLowerCase().replaceAll(" ", "-"),
  name,
  slug: name.toLowerCase().replaceAll(" ", "-"),
  owner: owned ? { id: `${name}-owner`, displayName: `${name} owner`, avatarUrl: null } : null,
});

export const offer = (
  over: Partial<TradeOffer> & Pick<TradeOffer, "offeringTeam">,
): TradeOffer => ({
  id: "o1",
  listingId: "l1",
  note: null,
  status: "pending",
  createdAt: AN_HOUR_AGO,
  resolvedAt: null,
  legs: [],
  ...over,
});

export const listing = (over: Partial<TradeListing> = {}): TradeListing => ({
  id: "l1",
  kind: "block",
  status: "open",
  ownerTeam: teamRef("Coop Doggies"),
  createdBy: null,
  createdAt: AN_HOUR_AGO,
  closesAt: IN_AN_HOUR,
  resolvedAt: null,
  acceptedOfferId: null,
  items: [item("nfl", "Chicago Bears"), item("nba", "Boston Celtics")],
  offers: [],
  ...over,
});

/** Every sport in season unless `complete` lists it. */
export const phases = (complete: SportCode[] = []): SportPhases =>
  new Proxy({} as SportPhases, {
    get: (_, code) => ({
      status: { phase: complete.includes(code as SportCode) ? "complete" : "in_season" },
    }),
  });
