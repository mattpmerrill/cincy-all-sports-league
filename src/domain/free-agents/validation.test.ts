import { describe, expect, it } from "vitest";
import { SPORT_CODES } from "@/domain/sports/sports";
import type { SportCode } from "@/domain/sports/sports";
import type { SportPhases } from "@/domain/trades";
import {
  AN_HOUR_AGO,
  NOW,
  item,
  listing,
  offer,
  participant,
  phases,
  teamRef,
} from "@/domain/trades/fixtures";
import type { MoveCheck } from "./types";
import { moveSideEffects, validateMove } from "./validation";

const code = (check: MoveCheck) => (check.ok ? "ok" : check.error.code);

const rangers = item("mlb", "Texas Rangers");
const cardinals = participant("St. Louis Cardinals");

describe("validateMove", () => {
  const base = {
    sport: "mlb" as SportCode,
    sportStatuses: phases(),
    team: { picks: [rangers, item("nfl", "Chicago Bears")] },
    dropId: rangers.participant.id,
    add: { id: cardinals.id, sport: "mlb" as SportCode } as { id: string; sport: SportCode } | null,
    heldIds: new Set([rangers.participant.id]),
    allowsDuplicatePicks: false,
  };
  const run = (over: Partial<typeof base> = {}) => code(validateMove({ ...base, ...over }));

  it("accepts a free agent in a sport that is in season", () => {
    expect(run()).toBe("ok");
  });

  it("allows a move before the season starts, but not after it ends", () => {
    const status = (phase: "upcoming" | "complete"): SportPhases =>
      Object.fromEntries(SPORT_CODES.map((c) => [c, { status: { phase } }])) as SportPhases;
    expect(run({ sportStatuses: status("upcoming") })).toBe("ok");
    expect(run({ sportStatuses: status("complete") })).toBe("sport_locked");
  });

  it("refuses a drop that is not the current pick, or a sport with no pick", () => {
    expect(run({ dropId: "someone-else" })).toBe("stale_pick");
    expect(run({ sport: "nba", add: { id: cardinals.id, sport: "nba" } })).toBe("stale_pick");
  });

  it("refuses adding the pick you already have", () => {
    expect(run({ add: { id: rangers.participant.id, sport: "mlb" } })).toBe("same_participant");
  });

  it("treats a missing participant and one from another sport as not found", () => {
    expect(run({ add: null })).toBe("not_found");
    expect(run({ add: { id: cardinals.id, sport: "nfl" } })).toBe("not_found");
  });

  it("refuses a participant another team holds, except where the sport allows duplicates", () => {
    const held = new Set([rangers.participant.id, cardinals.id]);
    expect(run({ heldIds: held })).toBe("not_free_agent");
    expect(run({ heldIds: held, allowsDuplicatePicks: true })).toBe("ok");
  });

  it("reports the most useful reason first when several rules are broken at once", () => {
    // Start with every rule broken, then fix them in order; each fix exposes the next reason.
    const everything = {
      sportStatuses: phases(["mlb"]),
      dropId: "someone-else",
      add: null,
      heldIds: new Set([cardinals.id]),
    };
    expect(run(everything)).toBe("sport_locked");
    expect(run({ ...everything, sportStatuses: phases() })).toBe("stale_pick");
    expect(run({ ...everything, sportStatuses: phases(), dropId: rangers.participant.id })).toBe(
      "not_found",
    );
    expect(
      run({
        ...everything,
        sportStatuses: phases(),
        dropId: rangers.participant.id,
        add: { id: rangers.participant.id, sport: "mlb" },
      }),
    ).toBe("same_participant");
    expect(
      run({
        ...everything,
        sportStatuses: phases(),
        dropId: rangers.participant.id,
        add: { id: cardinals.id, sport: "mlb" },
      }),
    ).toBe("not_free_agent");
  });

  it("gives messages a person can read, with the sport named when it is locked", () => {
    const locked = validateMove({ ...base, sportStatuses: phases(["mlb"]) });
    expect(!locked.ok && locked.error.message).toBe(
      "The MLB season is over, so moves are closed.",
    );
  });
});

describe("moveSideEffects", () => {
  const papie = teamRef("Papie");
  const coop = teamRef("Coop Doggies");
  const run = (openListings: Parameters<typeof moveSideEffects>[0]["openListings"]) =>
    moveSideEffects({ teamId: papie.id, sport: "mlb", openListings, now: NOW });

  const mine = (over: Parameters<typeof listing>[0] = {}) =>
    listing({ ownerTeam: papie, items: [item("mlb", "Texas Rangers")], ...over });

  it("counts the team's own live listing in the sport and every pending offer on it", () => {
    const offers = [
      offer({ id: "o1", offeringTeam: coop }),
      offer({ id: "o2", offeringTeam: teamRef("Third") }),
      offer({ id: "o3", offeringTeam: coop, status: "rejected" }),
    ];
    expect(run([mine({ offers })])).toEqual({ listings: 1, offers: 2 });
  });

  it("ignores listings in other sports, other teams' listings and expired ones", () => {
    const other = mine({ items: [item("nfl", "Chicago Bears")] });
    const theirs = listing({ ownerTeam: coop, items: [item("mlb", "Chicago Cubs")] });
    const expired = mine({ closesAt: AN_HOUR_AGO, offers: [offer({ offeringTeam: coop })] });
    const cancelled = mine({ status: "cancelled" });
    expect(run([other, theirs, expired, cancelled])).toEqual({ listings: 0, offers: 0 });
  });

  it("counts the team's own pending offers elsewhere that give this sport's pick", () => {
    const giving = offer({ id: "o1", offeringTeam: papie, legs: [item("mlb", "Texas Rangers")] });
    const givingOther = offer({ id: "o2", offeringTeam: papie, legs: [item("nfl", "Bears")] });
    const withdrawn = offer({
      id: "o3",
      offeringTeam: papie,
      status: "withdrawn",
      legs: [item("mlb", "Texas Rangers")],
    });
    const someoneElses = offer({
      id: "o4",
      offeringTeam: teamRef("Third"),
      legs: [item("mlb", "Other")],
    });
    const onCoops = listing({
      ownerTeam: coop,
      items: [item("mlb", "Chicago Cubs"), item("nfl", "Chicago Bears")],
      offers: [giving, givingOther, withdrawn, someoneElses],
    });
    expect(run([onCoops])).toEqual({ listings: 0, offers: 1 });
  });

  it("does not count offers on an expired listing", () => {
    const giving = offer({ offeringTeam: papie, legs: [item("mlb", "Texas Rangers")] });
    const expired = listing({
      ownerTeam: coop,
      closesAt: AN_HOUR_AGO,
      items: [item("mlb", "Chicago Cubs")],
      offers: [giving],
    });
    expect(run([expired])).toEqual({ listings: 0, offers: 0 });
  });
});
