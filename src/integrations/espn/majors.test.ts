import { describe, expect, it } from "vitest";
import masters from "./__fixtures__/golf-masters-2026.json";
import australianOpen from "./__fixtures__/tennis-australian-open-2026.json";
import { fetchMajorResults, golfResultsFromEvent, tennisResultsFromEvent } from "./majors";
import { golfScoreboardSchema, tennisScoreboardSchema } from "./schemas";
import { jsonResponse, scriptedFetch } from "./test-utils";

const tennisEvent = () => tennisScoreboardSchema.parse(australianOpen).events[0]!;
const golfEvent = () => golfScoreboardSchema.parse(masters).events[0]!;

describe("tennisResultsFromEvent", () => {
  const results = tennisResultsFromEvent("Australian Open", tennisEvent());
  const finishOf = (id: string) => results.find((r) => r.espnAthleteId === id)?.finish;
  const count = (finish: string) => results.filter((r) => r.finish === finish).length;

  it("maps the final to champion (Rybakina) and runner_up (Sabalenka)", () => {
    expect(finishOf("3126")).toBe("champion");
    expect(finishOf("3038")).toBe("runner_up");
  });

  it("maps each round's losers to their furthest round (Round 3 = round of 32, Round 4 = round of 16)", () => {
    expect(count("semifinal")).toBe(2);
    expect(count("quarterfinal")).toBe(4);
    expect(count("round_of_16")).toBe(8);
    expect(count("round_of_32")).toBe(16);
  });

  it("excludes qualifying and men's draws; early rounds are 'earlier'", () => {
    expect(results.some((r) => r.finish === "earlier")).toBe(true);
    // The fixture's men's-singles final has two players; none of them may show up here.
    expect(results.some((r) => ["296", "3782"].includes(r.espnAthleteId))).toBe(false);
    const qualifying = tennisEvent()
      .groupings?.find((g) => g.grouping.slug === "womens-singles")
      ?.competitions.filter((c) => c.round.displayName.startsWith("Qualifying"))
      .flatMap((c) => c.competitors.map((p) => p.id));
    const mainDrawIds = new Set(results.map((r) => r.espnAthleteId));
    // A qualifier who lost in qualifying (never in the main draw) must not be reported.
    expect(qualifying?.some((id) => id && !mainDrawIds.has(id))).toBe(true);
  });

  it("before the final is decided, both finalists are reported as runner_up (a floor)", () => {
    const event = tennisEvent();
    const undecided = {
      ...event,
      status: { type: { completed: false } },
      groupings: event.groupings?.map((g) => ({
        ...g,
        competitions: g.competitions.map((c) => ({
          ...c,
          competitors:
            c.round.displayName === "Final"
              ? c.competitors.map((p) => ({ ...p, winner: undefined }))
              : c.competitors,
        })),
      })),
    };
    const live = tennisResultsFromEvent("Australian Open", undecided);
    expect(live.filter((r) => r.finish === "runner_up")).toHaveLength(2);
    expect(live.every((r) => r.eventCompleted === false)).toBe(true);
  });
});

describe("golfResultsFromEvent", () => {
  const results = golfResultsFromEvent("Masters Tournament", golfEvent());
  const finishOf = (id: string) => results.find((r) => r.espnAthleteId === id)?.finish;

  it("champion and runner_up by score order", () => {
    expect(finishOf("3470")).toBe("champion"); // McIlroy -12
    expect(finishOf("9478")).toBe("runner_up"); // Scheffler -11
  });

  it("a four-way tie for 3rd (-10, 'T3') is position 3, so all four are top_5", () => {
    for (const id of ["5553", "5409", "569", "4425906"]) expect(finishOf(id)).toBe("top_5");
  });

  it("ties share the best position: T7 is top_10, and the T12 group is top_20", () => {
    expect(finishOf("10592")).toBe("top_10"); // Morikawa, T7 (-9, two players)
    expect(finishOf("8973")).toBe("top_10"); // Homa, T9
    expect(finishOf("9843")).toBe("top_20"); // Knapp, 11th
    expect(finishOf("5467")).toBe("top_20"); // Spieth, T12
  });

  it("made the cut but outside the top 20 is made_cut; missing the cut is missed_cut", () => {
    expect(finishOf("2201886")).toBe("missed_cut"); // Holtz, two rounds
    expect(finishOf("10364")).toBe("made_cut"); // Kitayama, +7 after four rounds
    expect(results.filter((r) => r.finish === "missed_cut").length).toBeGreaterThan(0);
  });

  it("a playoff for the win: order picks the champion and the loser is runner_up", () => {
    const round = (v: number) => ({ value: v });
    const player = (id: string, order: number, score: string) => ({
      id,
      order,
      score,
      linescores: [round(70), round(70), round(70), round(70)],
    });
    const event = golfScoreboardSchema.parse({
      events: [
        {
          id: "1",
          name: "Masters Tournament",
          date: "2026-04-09T05:00Z",
          competitions: [
            {
              status: { type: { completed: true } },
              competitors: [
                player("1", 1, "-10"),
                player("2", 2, "-10"),
                player("3", 3, "-9"),
                player("4", 4, "-9"),
              ],
            },
          ],
        },
      ],
    }).events[0]!;

    const byId = Object.fromEntries(
      golfResultsFromEvent("Masters Tournament", event).map((r) => [r.espnAthleteId, r.finish]),
    );
    expect(byId).toEqual({ "1": "champion", "2": "runner_up", "3": "top_5", "4": "top_5" });
  });
});

describe("fetchMajorResults", () => {
  it("skips a golf major that has not finished, since positions are not final", async () => {
    const live = structuredClone(masters);
    live.events[0]!.competitions[0]!.status.type.completed = false;
    const { fetchImpl } = scriptedFetch(() => jsonResponse(live));
    const result = await fetchMajorResults("pga", 2026, { fetchImpl });
    expect(result).toEqual({ ok: true, value: [] });
  });

  it("finds the Slams by ESPN name and reports them under our canonical labels", async () => {
    const roland = structuredClone(australianOpen);
    roland.events[0]!.name = "Roland Garros";
    const { fetchImpl } = scriptedFetch((url) =>
      url.includes("dates=20260601") ? jsonResponse(roland) : jsonResponse({ events: [] }),
    );
    const result = await fetchMajorResults("wta", 2026, { fetchImpl });
    expect(result.ok && new Set(result.value.map((r) => r.eventName))).toEqual(
      new Set(["French Open"]),
    );
  });
});
