import { describe, expect, it } from "vitest";
import {
  buildMoversPost,
  buildScoreUpdatePost,
  groupScoreUpdateItems,
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
