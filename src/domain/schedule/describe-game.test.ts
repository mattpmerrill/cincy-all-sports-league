import { describe, expect, it } from "vitest";
import { describeGame, describeStatus, outcomeFor } from "./describe-game";
import { game, side } from "./fixtures";
import type { Game } from "./types";

const final = (home: number, away: number, extra: Partial<Game> = {}) =>
  game({
    status: "final",
    home: side("pit", { score: home, winner: home > away ? true : home < away ? false : null }),
    away: side("cin", { score: away, winner: away > home ? true : away < home ? false : null }),
    ...extra,
  });

describe("describeGame: scheduled", () => {
  it("shows the Eastern start time, with the weekday when asked", () => {
    const g = game({ home: side("pit"), away: side("cin") }); // Sun 1:00 pm EDT
    expect(describeGame(g, "home")).toEqual({ tone: "upcoming", text: "1:00 PM", detail: null });
    expect(describeGame(g, "home", { withDay: true }).text).toBe("Sun 1:00 PM");
  });

  it("uses the Eastern weekday for a late game that is already Monday in UTC", () => {
    const g = game({ home: side("pit"), away: side("cin"), startsAt: "2026-10-05T02:30:00Z" });
    expect(describeGame(g, "away", { withDay: true }).text).toBe("Sun 10:30 PM");
  });

  it("says TBD instead of a made-up kickoff time", () => {
    const g = game({ home: side("pit"), away: side("cin"), timeTbd: true });
    expect(describeGame(g, "home").text).toBe("TBD");
    expect(describeGame(g, "home", { withDay: true }).text).toBe("Sun TBD");
  });
});

describe("describeGame: live", () => {
  const live = (home: number | null, away: number | null) =>
    game({
      status: "in_progress",
      statusDetail: "Q3 4:12",
      home: side("pit", { score: home }),
      away: side("cin", { score: away }),
    });

  it("leads with the pick's own score and carries ESPN's clock", () => {
    expect(describeGame(live(17, 20), "home")).toEqual({
      tone: "live",
      text: "17–20",
      detail: "Q3 4:12",
    });
    expect(describeGame(live(17, 20), "away").text).toBe("20–17");
  });

  it("falls back to Live when a score has not arrived", () => {
    expect(describeGame(live(null, null), "home").text).toBe("Live");
    expect(describeGame(live(3, null), "home").text).toBe("Live");
  });
});

describe("describeGame: final", () => {
  it("reads W, L and T from the pick's side with the pick's score first", () => {
    expect(describeGame(final(24, 17), "home")).toMatchObject({ tone: "win", text: "W 24–17" });
    expect(describeGame(final(24, 17), "away")).toMatchObject({ tone: "loss", text: "L 17–24" });
    expect(describeGame(final(20, 20), "home")).toMatchObject({ tone: "tie", text: "T 20–20" });
  });

  it("trusts the winner flag over a level score (a shootout or penalty kicks)", () => {
    const shootout = game({
      status: "final",
      sport: "mls",
      home: side("lafc", { score: 1, winner: true }),
      away: side("sea", { score: 1, winner: false }),
    });
    expect(outcomeFor(shootout, "home")).toBe("win");
    expect(outcomeFor(shootout, "away")).toBe("loss");
  });

  it("falls back to the score when no winner flag came through", () => {
    const noFlags = game({
      status: "final",
      home: side("pit", { score: 3 }),
      away: side("cin", { score: 5 }),
    });
    expect(outcomeFor(noFlags, "home")).toBe("loss");
    expect(outcomeFor(noFlags, "away")).toBe("win");
  });

  it("shows ESPN's overtime wording and hides a bare 'Final'", () => {
    expect(describeGame(final(3, 2, { statusDetail: "Final/OT" }), "home").detail).toBe("Final/OT");
    expect(describeGame(final(3, 2, { statusDetail: "Final" }), "home").detail).toBeNull();
  });

  it("says plain Final when there is nothing to read a result from", () => {
    const bare = game({ status: "final", home: side("pit"), away: side("cin") });
    expect(describeGame(bare, "home")).toMatchObject({ tone: "final", text: "Final" });
  });
});

describe("describeGame: games that will not be played on time", () => {
  it("labels postponed and canceled games the same for either side", () => {
    const postponed = game({ status: "postponed", home: side("pit"), away: side("cin") });
    const canceled = game({ status: "canceled", home: side("pit"), away: side("cin") });
    expect(describeGame(postponed, "home")).toMatchObject({ tone: "off", text: "Postponed" });
    expect(describeGame(canceled, "away")).toMatchObject({ tone: "off", text: "Canceled" });
  });
});

describe("describeStatus (neutral)", () => {
  it("is the time, Live with the clock, or Final, with no result letter", () => {
    expect(describeStatus(game({ home: side("pit"), away: side("cin") })).text).toBe("1:00 PM");
    expect(
      describeStatus(
        game({
          status: "in_progress",
          statusDetail: "2nd 8:00",
          home: side("pit"),
          away: side("cin"),
        }),
      ),
    ).toEqual({ tone: "live", text: "Live", detail: "2nd 8:00" });
    expect(describeStatus(final(24, 17))).toMatchObject({ tone: "final", text: "Final" });
    // ESPN's own wording replaces "Final" rather than following it.
    expect(describeStatus(final(3, 2, { statusDetail: "Final/OT" }))).toEqual({
      tone: "final",
      text: "Final/OT",
      detail: null,
    });
  });
});
