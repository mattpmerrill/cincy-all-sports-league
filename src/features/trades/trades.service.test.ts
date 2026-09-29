import { describe, expect, it, vi } from "vitest";
import type { TeamRef } from "@/data/fantasy-teams.repository";
import { leagueData, wins } from "@/domain/league/fixtures";
import type { LeagueData } from "@/domain/league";
import type { Actor } from "@/domain/membership/membership";
import type { SportCode } from "@/domain/sports/sports";
import type {
  ListingKind,
  OfferStatus,
  TradeError,
  TradeItem,
  TradeListing,
  TradeOffer,
  TradeTeamRef,
} from "@/domain/trades";
import { createLogger } from "@/lib/logger";
import { ok, type Result } from "@/lib/result";
import type { TradeAlert } from "./trade-alerts";
import { createTradesService, type TradesServiceDeps } from "./trades.service";

const NOW = new Date("2026-09-29T12:00:00Z");
const IN_AN_HOUR = "2026-09-29T13:00:00Z";
const AN_HOUR_AGO = "2026-09-29T11:00:00Z";

const owner = (id: string) => ({ id: `u-${id}`, displayName: `${id} owner`, avatarUrl: null });
const asActor = (id: string): Actor => ({ id: `u-${id}`, role: "member" });
const teamRef = (id: string, owned = true): TradeTeamRef => ({
  id,
  name: id,
  slug: id,
  owner: owned ? owner(id) : null,
});
/** Participant ids and names are `<team>-<sport>` in the league fixture. */
const held = (team: string, sport: SportCode): TradeItem => ({
  sport,
  participant: {
    id: `${team}-${sport}`,
    name: `${team}-${sport}`,
    shortName: `${team}-${sport}`,
    logoUrl: null,
    primaryColor: null,
  },
});

const offerOf = (
  id: string,
  team: string,
  sports: SportCode[],
  over: Partial<TradeOffer> = {},
): TradeOffer => ({
  id,
  listingId: "l1",
  offeringTeam: teamRef(team),
  note: null,
  status: "pending",
  createdAt: AN_HOUR_AGO,
  resolvedAt: null,
  legs: sports.map((s) => held(team, s)),
  ...over,
});

const listingOf = (over: Partial<TradeListing> = {}): TradeListing => ({
  id: "l1",
  kind: "block" satisfies ListingKind,
  status: "open",
  ownerTeam: teamRef("coop"),
  createdBy: null,
  createdAt: AN_HOUR_AGO,
  closesAt: IN_AN_HOUR,
  resolvedAt: null,
  acceptedOfferId: null,
  items: [held("coop", "nfl"), held("coop", "nba")],
  offers: [],
  ...over,
});

const DEFAULT_LEAGUE = () =>
  leagueData({
    teams: [
      { id: "me", owner: owner("me"), baselines: { nfl: { total: 2 } } },
      { id: "coop", owner: owner("coop") },
      { id: "papie", owner: owner("papie") },
      { id: "solo" },
    ],
    // me-nfl earned 6 live (2 of it before the team got it); coop-nfl 10.
    results: [wins("me-nfl", 3), wins("coop-nfl", 5), wins("papie-nfl", 1)],
  });

type World = {
  league?: LeagueData | null;
  /** The team the actor owns; null means none. */
  myTeam?: TeamRef | null;
  open?: TradeListing[];
  listings?: TradeListing[];
  mine?: TradeListing[];
  offersBy?: Parameters<typeof asOffersWithListing>[0];
  completed?: TradeListing[];
  mutationResult?: Result<unknown, TradeError>;
  notifyThrows?: boolean;
};

const asOffersWithListing = (rows: { offer: TradeOffer; listing: TradeListing }[]) =>
  rows.map(({ offer, listing }) => ({
    ...offer,
    listing: { ...listing, offers: undefined },
  }));

function setup(world: World = {}) {
  const mutationCalls: { name: string; input: Record<string, unknown> }[] = [];
  const alerts: TradeAlert[][] = [];
  const listings = world.listings ?? [];
  const mutate = (name: string, value: unknown) => async (input: Record<string, unknown>) => {
    mutationCalls.push({ name, input });
    return world.mutationResult ?? ok(value);
  };

  const deps: TradesServiceDeps = {
    trades: {
      listOpenListings: async () => world.open ?? listings,
      listCompleted: async () => world.completed ?? [],
      listListingsOwnedBy: async () => world.mine ?? [],
      listOffersBy: async () => asOffersWithListing(world.offersBy ?? []) as never,
      getListing: async (id) => listings.find((l) => l.id === id) ?? null,
      getListingByOfferId: async (offerId) =>
        listings.find((l) => l.offers.some((o) => o.id === offerId)) ?? null,
    },
    mutations: () => ({
      createListing: mutate("createListing", { listingId: "l-new" }) as never,
      proposeDirect: mutate("proposeDirect", { listingId: "l-new", offerId: "o-new" }) as never,
      makeOffer: mutate("makeOffer", { offerId: "o-new" }) as never,
      withdrawOffer: mutate("withdrawOffer", null) as never,
      rejectOffer: mutate("rejectOffer", null) as never,
      cancelListing: mutate("cancelListing", null) as never,
      acceptOffer: mutate("acceptOffer", null) as never,
    }),
    loadLeague: async () => (world.league === undefined ? DEFAULT_LEAGUE() : world.league),
    teams: {
      getOwnedBy: async (userId) => {
        if (world.myTeam !== undefined) return world.myTeam;
        const id = userId.replace(/^u-/, "");
        return ["me", "coop", "papie"].includes(id) ? { id, name: id, slug: id } : null;
      },
    },
    notifier: {
      notify: (batch) => {
        if (world.notifyThrows) throw new Error("after() outside a request");
        alerts.push([...batch]);
      },
    },
    now: () => NOW,
    logger: { ...createLogger(), error: vi.fn(), child: () => createLogger() },
  };
  return {
    service: createTradesService(deps),
    calls: mutationCalls,
    alerts,
    sent: () => alerts.flat(),
    logger: deps.logger,
  };
}

const me = asActor("me");
const failure = (code: string) =>
  expect.objectContaining({ ok: false, error: expect.objectContaining({ code }) });
const NFL_CHAMPION = {
  participantId: "coop-nfl",
  ruleId: "nfl-champion",
  quantity: 1,
  eventLabel: "",
};
const seasonOver = () => ({ ...DEFAULT_LEAGUE(), results: [NFL_CHAMPION] }) satisfies LeagueData;

describe("createListing", () => {
  it("builds the block post from the actor's own picks and calls the repository", async () => {
    const { service, calls, alerts } = setup();
    const result = await service.createListing(me, ["nba", "nfl"]);
    expect(result).toEqual({ ok: true, value: { listingId: "l-new" } });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toMatchObject({
      actorId: "u-me",
      sports: ["nba", "nfl"],
      post: {
        body: "me put me-nba (NBA) and me-nfl (NFL) on the trading block.",
        payload: {
          type: "trade_listed",
          team: { name: "me", slug: "me" },
          items: [
            { sport: "nba", participantName: "me-nba" },
            { sport: "nfl", participantName: "me-nfl" },
          ],
        },
      },
    });
    expect(alerts).toEqual([]);
  });

  it("stops at a completed sport without calling the repository", async () => {
    const { service, calls } = setup({ league: seasonOver() });
    expect(await service.createListing(me, ["nfl"])).toEqual(failure("sport_locked"));
    expect(calls).toEqual([]);
  });

  it("returns already_listed with the blocking listing id", async () => {
    const mine = listingOf({
      id: "l-mine",
      ownerTeam: teamRef("me"),
      items: [held("me", "nfl")],
    });
    const { service, calls } = setup({ listings: [mine] });
    const result = await service.createListing(me, ["nfl"]);
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "already_listed", listingId: "l-mine" }),
    });
    expect(calls).toEqual([]);
  });

  it("refuses someone without a team", async () => {
    const { service, calls } = setup({ myTeam: null });
    expect(await service.createListing(me, ["nfl"])).toEqual(failure("not_owner"));
    expect(calls).toEqual([]);
  });

  it("passes a repository error through untouched", async () => {
    const error: TradeError = { code: "team_unowned", message: "nope" };
    const { service, alerts } = setup({ mutationResult: { ok: false, error } });
    expect(await service.createListing(me, ["nfl"])).toEqual({ ok: false, error });
    expect(alerts).toEqual([]);
  });
});

describe("proposeDirect", () => {
  it("posts a direct offer, keeps the note and emails the target's owner", async () => {
    const { service, calls, sent } = setup();
    const result = await service.proposeDirect(me, "coop", ["nfl"], "Big fan");
    expect(result).toEqual({ ok: true, value: { listingId: "l-new", offerId: "o-new" } });
    expect(calls[0]?.input).toMatchObject({
      actorId: "u-me",
      targetTeamId: "coop",
      sports: ["nfl"],
      note: "Big fan",
      post: {
        body: 'me offered me-nfl (NFL) for coop\'s coop-nfl. Note: "Big fan"',
        payload: {
          type: "trade_offer",
          offerKind: "direct",
          from: { name: "me", slug: "me" },
          to: { name: "coop", slug: "coop" },
          legs: [{ sport: "nfl", gives: "me-nfl", gets: "coop-nfl" }],
          note: "Big fan",
        },
      },
    });
    expect(sent()).toEqual([
      expect.objectContaining({
        event: "new_offer",
        recipientId: "u-coop",
        listingId: "l-new",
        offerId: "o-new",
        content: expect.objectContaining({ subject: "me wants to trade with you" }),
      }),
    ]);
  });

  it("short-circuits on your own team, an unowned team and an unknown team", async () => {
    const { service, calls, alerts } = setup();
    expect(await service.proposeDirect(me, "me", ["nfl"], null)).toEqual(failure("own_listing"));
    expect(await service.proposeDirect(me, "solo", ["nfl"], null)).toEqual(failure("team_unowned"));
    expect(await service.proposeDirect(me, "ghost", ["nfl"], null)).toEqual(failure("not_found"));
    expect(calls).toEqual([]);
    expect(alerts).toEqual([]);
  });

  it("refuses a completed sport and a player who is already listed", async () => {
    const locked = setup({ league: seasonOver() });
    expect(await locked.service.proposeDirect(me, "coop", ["nfl"], null)).toEqual(
      failure("sport_locked"),
    );

    const listed = setup({ listings: [listingOf({ id: "l-block" })] });
    expect(await listed.service.proposeDirect(me, "coop", ["nfl"], null)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "already_listed", listingId: "l-block" }),
    });
    expect(locked.calls.concat(listed.calls)).toEqual([]);
  });

  it("sends no email when the repository refuses", async () => {
    const error: TradeError = { code: "stale_pick", message: "changed" };
    const { service, alerts } = setup({ mutationResult: { ok: false, error } });
    expect(await service.proposeDirect(me, "coop", ["nfl"], null)).toEqual({ ok: false, error });
    expect(alerts).toEqual([]);
  });
});

describe("makeOffer", () => {
  const open = listingOf();

  it("posts a competing offer and emails the listing owner", async () => {
    const { service, calls, sent } = setup({ listings: [open] });
    const result = await service.makeOffer(me, "l1", ["nba"], null);
    expect(result).toEqual({ ok: true, value: { offerId: "o-new" } });
    expect(calls[0]?.input).toMatchObject({
      listingId: "l1",
      sports: ["nba"],
      post: {
        body: "me made a competing offer: me-nba (NBA) for coop's coop-nba.",
        payload: {
          offerKind: "competing",
          legs: [{ sport: "nba", gives: "me-nba", gets: "coop-nba" }],
        },
      },
    });
    expect(sent()).toEqual([
      expect.objectContaining({
        event: "new_offer",
        recipientId: "u-coop",
        listingId: "l1",
        content: expect.objectContaining({
          subject: "New offer on your trading block from me",
        }),
      }),
    ]);
  });

  it("refuses your own listing, an expired listing, a duplicate offer and a locked sport", async () => {
    const cases: [World, string][] = [
      [{ listings: [listingOf({ ownerTeam: teamRef("me") })] }, "own_listing"],
      [{ listings: [listingOf({ closesAt: AN_HOUR_AGO })] }, "listing_closed"],
      [{ listings: [listingOf({ offers: [offerOf("o0", "me", ["nfl"])] })] }, "duplicate_offer"],
      [{ listings: [open], league: seasonOver() }, "sport_locked"],
      [{ listings: [] }, "not_found"],
    ];
    for (const [world, code] of cases) {
      const { service, calls, alerts } = setup(world);
      expect(await service.makeOffer(me, "l1", ["nfl"], null)).toEqual(failure(code));
      expect(calls).toEqual([]);
      expect(alerts).toEqual([]);
    }
  });

  it("does not fail the trade when scheduling the alert throws", async () => {
    const { service, logger } = setup({ listings: [open], notifyThrows: true });
    const result = await service.makeOffer(me, "l1", ["nfl"], null);
    expect(result.ok).toBe(true);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("rejectOffer, withdrawOffer and cancelListing", () => {
  const listing = listingOf({
    ownerTeam: teamRef("me"),
    items: [held("me", "nfl")],
    offers: [offerOf("o1", "coop", ["nfl"])],
  });

  it("tells the offerer, and only after the repository succeeded", async () => {
    const { service, sent } = setup({ listings: [listing] });
    expect((await service.rejectOffer(me, "o1")).ok).toBe(true);
    expect(sent()).toEqual([
      expect.objectContaining({
        event: "rejected",
        recipientId: "u-coop",
        offerId: "o1",
        content: expect.objectContaining({ subject: "me passed on your offer" }),
      }),
    ]);

    const error: TradeError = { code: "not_owner", message: "no" };
    const refused = setup({ listings: [listing], mutationResult: { ok: false, error } });
    expect(await refused.service.rejectOffer(me, "o1")).toEqual({ ok: false, error });
    expect(refused.alerts).toEqual([]);
  });

  it("does not know an unknown offer", async () => {
    const { service, calls } = setup({ listings: [listing] });
    expect(await service.rejectOffer(me, "nope")).toEqual(failure("not_found"));
    expect(calls).toEqual([]);
  });

  it("passes withdraw and cancel to the repository without an email", async () => {
    const { service, calls, alerts } = setup();
    await service.withdrawOffer(me, "o1");
    await service.cancelListing(me, "l1");
    expect(calls.map((c) => [c.name, c.input])).toEqual([
      ["withdrawOffer", { actorId: "u-me", offerId: "o1" }],
      ["cancelListing", { actorId: "u-me", listingId: "l1" }],
    ]);
    expect(alerts).toEqual([]);
  });
});

describe("acceptOffer", () => {
  const listing = (over: Partial<TradeListing> = {}) =>
    listingOf({
      id: "l1",
      ownerTeam: teamRef("me"),
      items: [held("me", "nfl")],
      offers: [
        offerOf("o1", "coop", ["nfl"]),
        offerOf("o2", "papie", ["nfl"]),
        offerOf("o3", "solo", ["nfl"], { status: "rejected" }),
      ],
      ...over,
    });

  it("sends the FULL live score of every participant on both sides, not the credited one", async () => {
    const { service, calls } = setup({ listings: [listing()] });
    expect((await service.acceptOffer(me, "o1")).ok).toBe(true);
    const input = calls[0]?.input as { scores: unknown[]; post: { body: string } };
    // me-nfl was acquired with a 2 point baseline: credited 4, live 6.
    expect(input.scores).toEqual([
      { participantId: "coop-nfl", points: 10, championships: 0, postseasonPoints: 0 },
      { participantId: "me-nfl", points: 6, championships: 0, postseasonPoints: 0 },
    ]);
    expect(input.post.body).toBe("Trade done: me send me-nfl (NFL) to coop for coop-nfl.");
  });

  it("emails the winner, and everyone else who was still waiting that they lost", async () => {
    const { service, sent } = setup({ listings: [listing()] });
    await service.acceptOffer(me, "o1");
    expect(sent().map((a) => [a.event, a.recipientId, a.offerId])).toEqual([
      ["accepted", "u-coop", "o1"],
      ["lost", "u-papie", "o2"],
    ]);
    expect(sent()[1]?.content.subject).toBe("me chose a different offer");
  });

  it("sends nothing when the repository refuses", async () => {
    const error: TradeError = { code: "stale_pick", message: "changed" };
    const { service, alerts } = setup({
      listings: [listing()],
      mutationResult: { ok: false, error },
    });
    expect(await service.acceptOffer(me, "o1")).toEqual({ ok: false, error });
    expect(alerts).toEqual([]);
  });

  it("refuses a completed sport, an expired listing and an answered offer before the repository", async () => {
    const cases: [World, string][] = [
      [{ listings: [listing()], league: seasonOver() }, "sport_locked"],
      [{ listings: [listing({ closesAt: AN_HOUR_AGO })] }, "listing_closed"],
      [
        {
          listings: [
            listing({ offers: [offerOf("o1", "coop", ["nfl"], { status: "withdrawn" })] }),
          ],
        },
        "offer_not_pending",
      ],
    ];
    for (const [world, code] of cases) {
      const { service, calls, alerts } = setup(world);
      expect(await service.acceptOffer(me, "o1")).toEqual(failure(code));
      expect(calls).toEqual([]);
      expect(alerts).toEqual([]);
    }
  });

  it("refuses to guess a score when a player no longer belongs to anyone", async () => {
    const stale = listing({
      items: [
        { ...held("me", "nfl"), participant: { ...held("me", "nfl").participant, id: "gone" } },
      ],
    });
    const { service, calls } = setup({ listings: [stale] });
    expect(await service.acceptOffer(me, "o1")).toEqual(failure("missing_scores"));
    expect(calls).toEqual([]);
  });
});

describe("getTradesArea", () => {
  const offerStatus = (status: OfferStatus, over: Partial<TradeOffer> = {}) =>
    offerOf("mo", "me", ["nfl"], { status, ...over });

  it("groups what needs an answer, with effective statuses and time left from one now", async () => {
    const waiting = listingOf({
      id: "l-wait",
      ownerTeam: teamRef("me"),
      offers: [
        offerOf("o1", "coop", ["nfl"]),
        offerOf("o0", "papie", ["nfl"], { status: "withdrawn" }),
      ],
    });
    const expiredMine = listingOf({
      id: "l-old",
      ownerTeam: teamRef("me"),
      closesAt: AN_HOUR_AGO,
      offers: [offerOf("o9", "coop", ["nfl"])],
    });
    const ancient = listingOf({
      id: "l-ancient",
      ownerTeam: teamRef("me"),
      status: "cancelled",
      resolvedAt: "2026-08-01T00:00:00Z",
    });
    const { service } = setup({
      open: [waiting, listingOf({ id: "l-block", closesAt: "2026-09-29T12:30:00Z" })],
      mine: [waiting, expiredMine, ancient],
      offersBy: [
        { offer: offerStatus("pending"), listing: listingOf({ id: "l-x" }) },
        {
          offer: offerStatus("pending"),
          listing: listingOf({ id: "l-x2", closesAt: AN_HOUR_AGO }),
        },
        {
          offer: offerStatus("rejected", { resolvedAt: "2026-06-01T00:00:00Z" }),
          listing: listingOf({ id: "l-x3" }),
        },
      ],
      completed: [listingOf({ id: "l-done", status: "accepted", resolvedAt: AN_HOUR_AGO })],
    });

    const area = await service.getTradesArea({ id: "u-me" });
    expect(area.myTeam).toMatchObject({ id: "me" });
    expect(area.waitingOnYou.map((w) => w.listing.listing.id)).toEqual(["l-wait"]);
    expect(area.waitingOnYou[0]?.offers.map((o) => [o.offer.id, o.canAccept, o.canReject])).toEqual(
      [["o1", true, true]],
    );
    expect(area.myListings.map((c) => [c.listing.id, c.status])).toEqual([
      ["l-wait", "open"],
      ["l-old", "expired"],
    ]);
    expect(area.myOffers.map((c) => [c.offer.listing.id, c.status, c.canWithdraw])).toEqual([
      ["l-x", "pending", true],
      ["l-x2", "expired", false],
    ]);
    expect(area.block.map((c) => [c.listing.id, c.timeLeft, c.isMine])).toEqual([
      ["l-wait", "1h", true],
      ["l-block", "30m", false],
    ]);
    expect(area.recent.map((c) => c.status)).toEqual(["accepted"]);
  });

  it("shows a signed-out visitor only the block and recent trades", async () => {
    const { service } = setup({
      open: [listingOf()],
      completed: [listingOf({ id: "l-done", status: "accepted" })],
    });
    const area = await service.getTradesArea(null);
    expect(area).toMatchObject({ myTeam: null, waitingOnYou: [], myListings: [], myOffers: [] });
    expect(area.block).toHaveLength(1);
    expect(area.recent).toHaveLength(1);
  });
});

describe("getListingView", () => {
  const withOffers = listingOf({
    offers: [offerOf("o-me", "me", ["nfl"]), offerOf("o-papie", "papie", ["nba"])],
  });

  it("is null for an unknown listing", async () => {
    expect(await setup().service.getListingView("nope", null)).toBeNull();
  });

  it("gives the owner accept, reject and cancel, and nothing to offer", async () => {
    const { service } = setup({ listings: [withOffers] });
    const view = await service.getListingView("l1", { id: "u-coop" });
    expect(view).toMatchObject({ role: "owner", canCancel: true, offerChoices: [] });
    expect(view?.offers.map((o) => [o.offer.id, o.canAccept, o.canReject, o.canWithdraw])).toEqual([
      ["o-me", true, true, false],
      ["o-papie", true, true, false],
    ]);
  });

  it("gives a bidder withdraw on their own offer only, and no choices while it is pending", async () => {
    const { service } = setup({ listings: [withOffers] });
    const view = await service.getListingView("l1", { id: "u-me" });
    expect(view?.role).toBe("bidder");
    expect(view?.myOffer?.offer.id).toBe("o-me");
    expect(view?.offers.map((o) => [o.offer.id, o.canWithdraw, o.canAccept])).toEqual([
      ["o-me", true, false],
      ["o-papie", false, false],
    ]);
    expect(view?.offerChoices).toEqual([]);
    expect(view?.offerBlockedReason).toMatch(/already have an offer/);
  });

  it("lists a choice per listed sport with what you give and get, and why one is locked", async () => {
    const { service } = setup({
      listings: [listingOf()],
      league: seasonOver(),
    });
    const view = await service.getListingView("l1", { id: "u-me" });
    expect(view?.offerBlockedReason).toBeNull();
    expect(view?.offerChoices).toEqual([
      expect.objectContaining({
        sport: "nfl",
        youGive: expect.objectContaining({ id: "me-nfl" }),
        youGet: expect.objectContaining({ id: "coop-nfl" }),
        tradeable: false,
        reason: expect.stringMatching(/season is over/),
      }),
      expect.objectContaining({ sport: "nba", tradeable: true }),
    ]);
  });

  it("reflects expiry from the injected now", async () => {
    const { service } = setup({ listings: [listingOf({ closesAt: AN_HOUR_AGO })] });
    const bidder = await service.getListingView("l1", { id: "u-me" });
    expect(bidder).toMatchObject({ status: "expired", timeLeft: "Closed", offerChoices: [] });
    expect(bidder?.offerBlockedReason).toBe("This listing is closed.");
    const owner = await service.getListingView("l1", { id: "u-coop" });
    expect(owner?.canCancel).toBe(false);
  });

  it("tells a teamless member and a signed-out visitor apart", async () => {
    const { service } = setup({ listings: [withOffers] });
    expect((await service.getListingView("l1", { id: "u-nobody" }))?.role).toBe("spectator");
    const signedOut = await service.getListingView("l1", null);
    expect(signedOut?.role).toBe("signed_out");
    expect(signedOut?.offers.every((o) => !o.canAccept && !o.canWithdraw)).toBe(true);
  });
});

describe("getNewTradeOptions", () => {
  it("offers your picks for the block and every other owned team for a direct offer", async () => {
    const block = listingOf({ ownerTeam: teamRef("me"), items: [held("me", "nba")] });
    const { service } = setup({ listings: [block], league: seasonOver() });
    const options = await service.getNewTradeOptions({ id: "u-me" });

    const pick = (sport: SportCode) => options?.myPicks.find((p) => p.sport === sport);
    expect(pick("nfl")).toMatchObject({ tradeable: false, reason: expect.stringMatching(/over/) });
    expect(pick("nba")).toMatchObject({ tradeable: false, blockingListingId: "l1" });
    expect(pick("mlb")).toEqual(expect.objectContaining({ tradeable: true }));
    expect(pick("mlb")).not.toHaveProperty("reason");

    expect(options?.teams.map((t) => t.team.name)).toEqual(["coop", "papie"]);
    const coopMlb = options?.teams[0]?.choices.find((c) => c.sport === "mlb");
    expect(coopMlb).toMatchObject({
      youGive: { id: "me-mlb" },
      youGet: { id: "coop-mlb" },
      tradeable: true,
    });
  });

  it("is null without a team", async () => {
    expect(await setup({ myTeam: null }).service.getNewTradeOptions({ id: "u-x" })).toBeNull();
  });
});
