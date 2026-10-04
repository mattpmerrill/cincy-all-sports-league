import { describe, expect, it } from "vitest";
import {
  buildMatchupsWeekPost,
  buildMoversPost,
  buildScoreUpdatePost,
  groupScoreUpdateItems,
  type MatchupsWeekResult,
  type ScoreUpdateItem,
} from "./index";

const item = (
  teamName: string,
  participantName: string,
  pointsDelta: number,
  sport: ScoreUpdateItem["sport"] = "ncaaf",
): ScoreUpdateItem => ({
  teamSlug: teamName.toLowerCase().replaceAll(" ", "-"),
  teamName,
  participantName,
  sport,
  pointsDelta,
});

describe("buildScoreUpdatePost", () => {
  it("batches a whole run into one post, one entry per participant with its owners", () => {
    const post = buildScoreUpdatePost([
      item("Sher Bear", "Utah Utes", 4.1),
      item("Sher Bear", "San Francisco 49ers", 3, "nfl"),
      item("Papie", "San Francisco 49ers", 3, "nfl"),
    ]);
    expect(post?.body).toBe(
      "Scores update: Utah Utes +4.1 (Sher Bear), San Francisco 49ers +3 (Papie, Sher Bear)",
    );
    expect(post?.payload.type).toBe("score_update");
    expect(post?.payload.items).toHaveLength(3);
    expect(post?.payload.items[0]).toEqual({
      teamSlug: "sher-bear",
      teamName: "Sher Bear",
      participantName: "Utah Utes",
      sport: "ncaaf",
      pointsDelta: 4.1,
    });
  });

  it("is null when nothing moved, including zero-point noise", () => {
    expect(buildScoreUpdatePost([])).toBeNull();
    expect(buildScoreUpdatePost([item("Sher Bear", "Utah Utes", 0)])).toBeNull();
  });

  it("shows losses with a minus sign", () => {
    expect(buildScoreUpdatePost([item("Papie", "Utah Utes", -4.1)])?.body).toBe(
      "Scores update: Utah Utes -4.1 (Papie)",
    );
  });

  it("stays inside the 500 character limit and says how many it left out", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      item(`Team number ${i}`, `Participant with a long name ${i}`, 3 + i / 100),
    );
    const post = buildScoreUpdatePost(many);
    expect(post?.body.length).toBeLessThanOrEqual(500);
    expect(post?.body).toMatch(/ and \d+ more$/);
  });
});

describe("groupScoreUpdateItems", () => {
  it("merges the teams that share a participant, without repeating a team", () => {
    const groups = groupScoreUpdateItems([
      item("A", "Utah Utes", 4.1),
      item("B", "Utah Utes", 4.1),
      item("A", "Utah Utes", 4.1),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.teams.map((t) => t.teamName)).toEqual(["A", "B"]);
  });
});

describe("buildMoversPost", () => {
  const curr = (rows: [string, number][]) =>
    rows.map(([name, rank]) => ({
      teamId: name,
      teamSlug: name.toLowerCase(),
      teamName: name,
      rank,
    }));
  const prev = (rows: [string, number][]) => rows.map(([teamId, rank]) => ({ teamId, rank }));

  it("names who rose and who fell, biggest move first, with tie labels", () => {
    const post = buildMoversPost(
      prev([
        ["Papie", 3],
        ["Dirk", 3],
        ["Sher", 1],
      ]),
      curr([
        ["Papie", 1],
        ["Sher", 1],
        ["Dirk", 3],
      ]),
      "2026-09-29",
    );
    // Dirk held rank 3, so only Papie moved (up 2, into a tie at 1). Sher held.
    expect(post?.body).toBe("Movers: Papie ▲2 to T1");
    expect(post?.payload).toMatchObject({ type: "movers", date: "2026-09-29" });
  });

  it("lists falls alongside rises", () => {
    const post = buildMoversPost(
      prev([
        ["A", 1],
        ["B", 2],
        ["C", 3],
      ]),
      curr([
        ["C", 1],
        ["A", 2],
        ["B", 3],
      ]),
    );
    expect(post?.body).toBe("Movers: C ▲2 to 1, A ▼1 to 2, B ▼1 to 3");
  });

  it("does not count a new team as a mover, and is null when every rank held", () => {
    expect(
      buildMoversPost(
        prev([["A", 1]]),
        curr([
          ["A", 1],
          ["New", 2],
        ]),
      ),
    ).toBeNull();
    expect(buildMoversPost([], curr([["A", 1]]))).toBeNull();
  });
});

describe("buildMatchupsWeekPost", () => {
  const link = (name: string) => ({ name, slug: name.toLowerCase().replaceAll(" ", "-") });
  const result = (
    home: string,
    away: string,
    homeGain: number,
    awayGain: number,
  ): MatchupsWeekResult => ({
    home: link(home),
    away: link(away),
    homeGain,
    awayGain,
    outcome: homeGain === awayGain ? "tie" : homeGain > awayGain ? "home" : "away",
  });
  const pairing = (home: string, away: string) => ({ home: link(home), away: link(away) });

  it("reports last week's results and this week's pairings in one friendly post", () => {
    const post = buildMatchupsWeekPost({
      weekStart: "2026-10-12",
      results: [result("Sher Bear", "Papie", 12.4, 8), result("Coop Doggies", "Dirk", 0, 0)],
      pairings: [pairing("Sher Bear", "Coop Doggies"), pairing("Papie", "Dirk")],
    });
    expect(post?.body).toBe(
      "Last week: Sher Bear beat Papie 12.4 to 8, Coop Doggies and Dirk tied at 0. " +
        "This week: Sher Bear vs Coop Doggies, Papie vs Dirk.",
    );
    expect(post?.payload.type).toBe("matchups_week");
    expect(post?.payload.weekStart).toBe("2026-10-12");
    expect(post?.payload.results[0]).toMatchObject({
      home: { name: "Sher Bear", slug: "sher-bear" },
      outcome: "home",
      homeGain: 12.4,
    });
  });

  it("names the winner first when the away side won, and shows a negative gain", () => {
    const post = buildMatchupsWeekPost({
      weekStart: "2026-10-12",
      results: [result("Papie", "Sher Bear", -1.5, 3)],
      pairings: [],
    });
    expect(post?.body).toBe("Last week: Sher Bear beat Papie 3 to -1.5.");
  });

  it("posts only the pairings in the first week, which has no results", () => {
    const post = buildMatchupsWeekPost({
      weekStart: "2026-10-12",
      results: [],
      pairings: [pairing("Sher Bear", "Papie")],
    });
    expect(post?.body).toBe("This week: Sher Bear vs Papie.");
    expect(post?.payload.results).toEqual([]);
  });

  it("posts only the results in the closing week of a season, which has no pairings", () => {
    const post = buildMatchupsWeekPost({
      weekStart: "2027-07-05",
      results: [result("Sher Bear", "Papie", 2, 1)],
      pairings: [],
    });
    expect(post?.body).toBe("Last week: Sher Bear beat Papie 2 to 1.");
    expect(post?.payload.pairings).toEqual([]);
  });

  it("is null when there is nothing to say", () => {
    expect(
      buildMatchupsWeekPost({ weekStart: "2026-10-12", results: [], pairings: [] }),
    ).toBeNull();
  });

  it("never uses an em dash", () => {
    const post = buildMatchupsWeekPost({
      weekStart: "2026-10-12",
      results: [result("A", "B", 3, 1), result("C", "D", 0, 0)],
      pairings: [pairing("A", "C")],
    });
    expect(post?.body).not.toContain("\u2014");
  });

  it("stays inside the 500 character limit for a full 10-matchup week and gives both parts room", () => {
    const names = Array.from({ length: 20 }, (_, i) => `Fantasy team with a long name ${i}`);
    const results = Array.from({ length: 10 }, (_, i) =>
      result(names[2 * i] ?? "", names[2 * i + 1] ?? "", 12.34 + i, 5.5),
    );
    const pairings = Array.from({ length: 10 }, (_, i) =>
      pairing(names[2 * i + 1] ?? "", names[2 * i] ?? ""),
    );
    const post = buildMatchupsWeekPost({ weekStart: "2026-10-12", results, pairings });
    expect(post?.body.length).toBeLessThanOrEqual(500);
    expect(post?.body).toMatch(/Last week: .* and \d+ more\. This week: .* and \d+ more\.$/);
    // The payload keeps every matchup even when the text had to say "and N more".
    expect(post?.payload.results).toHaveLength(10);
    expect(post?.payload.pairings).toHaveLength(10);
  });

  it("lets a short results line keep all its text and gives the rest of the room to the pairings", () => {
    const names = Array.from({ length: 20 }, (_, i) => `Fantasy team with a long name ${i}`);
    const pairings = Array.from({ length: 10 }, (_, i) =>
      pairing(names[2 * i] ?? "", names[2 * i + 1] ?? ""),
    );
    const post = buildMatchupsWeekPost({
      weekStart: "2026-10-12",
      results: [result("Sher Bear", "Papie", 2, 1)],
      pairings,
    });
    expect(post?.body.startsWith("Last week: Sher Bear beat Papie 2 to 1. This week: ")).toBe(true);
    expect(post?.body.length).toBeLessThanOrEqual(500);
    expect(post?.body).not.toMatch(/Last week: .* and \d+ more\. This/);
  });

  it("still fits when a single team name is absurdly long", () => {
    const long = "x".repeat(600);
    const post = buildMatchupsWeekPost({
      weekStart: "2026-10-12",
      results: [result(long, "Papie", 2, 1)],
      pairings: [pairing(long, "Papie")],
    });
    expect(post?.body.length).toBeLessThanOrEqual(500);
  });
});
