import { describe, expect, it } from "vitest";
import { buildWeeklyDigest, digestHeadline } from "./build-weekly-digest";
import type { DigestTeamInput, WeekAgoRow } from "./build-weekly-digest";

const team = (
  id: string,
  total: number,
  extra: Partial<DigestTeamInput> = {},
): DigestTeamInput => ({
  teamId: id,
  teamName: id.toUpperCase(),
  ownerName: `Owner ${id}`,
  total,
  sportSubtotals: [],
  championships: 0,
  postseasonPoints: 0,
  sportsWithPoints: 0,
  ...extra,
});
const ago = (teamId: string, rank: number, totalPoints: number): WeekAgoRow => ({
  teamId,
  rank,
  totalPoints,
});

// Now: a=30, b=25, c=20, d=10, e=5, f=1. A week ago the order was f, e, d, c, b, a (fully flipped).
const current = [
  team("a", 30),
  team("b", 25),
  team("c", 20),
  team("d", 10),
  team("e", 5),
  team("f", 1),
];
const flipped = [
  ago("f", 1, 0),
  ago("e", 2, 0),
  ago("d", 3, 0),
  ago("c", 4, 0),
  ago("b", 5, 0),
  ago("a", 6, 0),
];

describe("buildWeeklyDigest movers", () => {
  const digest = buildWeeklyDigest({ current, weekAgo: flipped });

  it("lists the top five in rank order", () => {
    expect(digest.top5.map((r) => r.teamId)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("ranks risers by places gained and keeps only three", () => {
    expect(digest.risers.map((r) => [r.teamId, r.movement.places])).toEqual([
      ["a", 5],
      ["b", 3],
      ["c", 1],
    ]);
  });

  it("ranks fallers by places lost and keeps only three", () => {
    expect(digest.fallers.map((r) => [r.teamId, r.movement.places])).toEqual([
      ["f", 5],
      ["e", 3],
      ["d", 1],
    ]);
  });

  it("breaks a tie on places by points gained, then by current rank", () => {
    // b and c both climb two places; y and z both fall two.
    const now = [team("x", 50), team("b", 40), team("c", 30), team("y", 10), team("z", 5)];
    const past = (bTotal: number, cTotal: number) => [
      ago("x", 1, 50),
      ago("y", 2, 10),
      ago("z", 3, 5),
      ago("b", 4, bTotal),
      ago("c", 5, cTotal),
    ];
    const moreGain = buildWeeklyDigest({ current: now, weekAgo: past(35, 20) });
    expect(moreGain.risers.map((r) => r.teamId)).toEqual(["c", "b"]);
    const equalGain = buildWeeklyDigest({ current: now, weekAgo: past(30, 20) });
    expect(equalGain.risers.map((r) => r.teamId)).toEqual(["b", "c"]);
  });

  it("sums exact point gains without float noise", () => {
    const result = buildWeeklyDigest({
      current: [team("a", 8.2), team("b", 0)],
      weekAgo: [ago("a", 1, 4.1), ago("b", 2, 0)],
    });
    expect(result.recipient).toBeNull();
    expect(result.top5[0]?.pointsGained).toBe(4.1);
    expect(result.leagueTotals).toEqual({ teams: 2, totalPoints: 8.2, pointsGained: 4.1 });
  });
});

describe("buildWeeklyDigest shared ranks", () => {
  it("labels tied teams T1 and skips the next rank", () => {
    const result = buildWeeklyDigest({
      current: [team("a", 10), team("b", 10), team("c", 5)],
      weekAgo: [ago("a", 2, 4), ago("b", 3, 4), ago("c", 1, 8)],
    });
    expect(result.top5.map((r) => r.rankLabel)).toEqual(["T1", "T1", "3"]);
    expect(result.risers.map((r) => [r.teamId, r.movement.places])).toEqual([
      ["b", 2],
      ["a", 1],
    ]);
    expect(result.fallers.map((r) => r.teamId)).toEqual(["c"]);
  });
});

describe("buildWeeklyDigest with no history", () => {
  const digest = buildWeeklyDigest({ current, weekAgo: null, recipientTeamId: "c" });

  it("marks everyone new and leaves the movers sections empty", () => {
    expect(digest.hasHistory).toBe(false);
    expect(digest.risers).toEqual([]);
    expect(digest.fallers).toEqual([]);
    expect(digest.top5.every((r) => r.movement.direction === "new")).toBe(true);
    expect(digest.leagueTotals.pointsGained).toBeNull();
    expect(digest.recipient?.pointsGained).toBeNull();
  });

  it("treats an empty snapshot the same as none", () => {
    expect(buildWeeklyDigest({ current, weekAgo: [] }).hasHistory).toBe(false);
  });
});

describe("buildWeeklyDigest recipient", () => {
  it("reports the recipient's own rank, movement and points gained", () => {
    const digest = buildWeeklyDigest({ current, weekAgo: flipped, recipientTeamId: "b" });
    expect(digest.recipient).toMatchObject({
      teamId: "b",
      rankLabel: "2",
      total: 25,
      movement: { direction: "up", places: 3 },
      pointsGained: 25,
    });
  });

  it("returns no recipient block for a member without a team or an unknown team", () => {
    expect(buildWeeklyDigest({ current, weekAgo: flipped }).recipient).toBeNull();
    expect(
      buildWeeklyDigest({ current, weekAgo: flipped, recipientTeamId: null }).recipient,
    ).toBeNull();
    expect(
      buildWeeklyDigest({ current, weekAgo: flipped, recipientTeamId: "zzz" }).recipient,
    ).toBeNull();
  });

  it("keeps a team added mid-week out of the movers but still shows it as new", () => {
    const digest = buildWeeklyDigest({
      current: [team("a", 10), team("n", 5)],
      weekAgo: [ago("a", 1, 10)],
      recipientTeamId: "n",
    });
    expect(digest.recipient?.movement.direction).toBe("new");
    expect(digest.risers).toEqual([]);
    expect(digest.leagueTotals.pointsGained).toBe(0);
  });
});

describe("digestHeadline", () => {
  it("leads with a team that climbed to the top", () => {
    const digest = buildWeeklyDigest({
      current: [team("a", 10), team("b", 12), team("c", 1)],
      weekAgo: [ago("a", 1, 10), ago("b", 2, 4), ago("c", 3, 1)],
    });
    expect(digestHeadline(digest)).toBe("B climbs to 1");
  });

  it("uses the tied label when the climb ends in a tie", () => {
    const digest = buildWeeklyDigest({
      current: [team("a", 10), team("b", 10)],
      weekAgo: [ago("a", 1, 10), ago("b", 2, 4)],
    });
    expect(digestHeadline(digest)).toBe("B climbs to T1");
  });

  it("falls back to the biggest climb, then to the leader", () => {
    const climbed = buildWeeklyDigest({
      current: [team("a", 10), team("b", 8), team("c", 6)],
      weekAgo: [ago("a", 1, 10), ago("c", 2, 1), ago("b", 3, 1)],
    });
    expect(digestHeadline(climbed)).toBe("B climbs to 2");
    expect(digestHeadline(buildWeeklyDigest({ current, weekAgo: null }))).toBe("A leads at 1");
  });
});
