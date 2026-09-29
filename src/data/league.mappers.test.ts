import { describe, expect, it } from "vitest";
import { toTeamData } from "./fantasy-teams.repository";
import { toRuleData } from "./league.repository";

const ruleRow = {
  id: "r1",
  code: "rank_1",
  label: "Year-end WTA rank #1",
  kind: "final_rank_band" as const,
  points: 50,
  rank_from: 1 as number | null,
  rank_to: 1 as number | null,
  is_championship: false,
  sort_order: 6,
  sport_id: "sp1",
};
const drafted = {
  baseline_points: 0,
  baseline_championships: 0,
  baseline_postseason_points: 0,
  acquired_at: null,
};
const codes = new Map([["sp1", "wta"]]);

describe("toRuleData", () => {
  it("maps a rank band with both bounds", () => {
    expect(toRuleData(ruleRow, codes)).toMatchObject({
      sport: "wta",
      rule: { kind: "final_rank_band", rankFrom: 1, rankTo: 1, points: 50 },
    });
  });

  it("rejects a rank band that lost a bound and a rule for an unknown sport", () => {
    expect(() => toRuleData({ ...ruleRow, rank_to: null }, codes)).toThrow(/bounds/);
    expect(() => toRuleData(ruleRow, new Map([["sp1", "curling"]]))).toThrow(/curling/);
  });
});

describe("toTeamData", () => {
  const participants = {
    id: "p1",
    name: "Coco Gauff",
    short_name: "Gauff",
    logo_url: null,
    primary_color: null,
  };
  it("keeps null owners and missing logos as null, not empty strings", () => {
    const team = toTeamData({
      id: "t1",
      slug: "papie",
      name: "Papie",
      profiles: null,
      picks: [{ sports: { code: "wta" }, participants, ...drafted }],
      banked_scores: [],
    });
    expect(team.owner).toBeNull();
    expect(team.picks[0]).toMatchObject({ sport: "wta", participant: { logoUrl: null } });
  });

  it("maps a traded pick's baseline and the points banked from what the team traded away", () => {
    const team = toTeamData({
      id: "t1",
      slug: "papie",
      name: "Papie",
      profiles: null,
      picks: [
        {
          sports: { code: "wta" },
          participants,
          baseline_points: 12.5,
          baseline_championships: 1,
          baseline_postseason_points: 50,
          acquired_at: "2026-09-29T12:00:00Z",
        },
      ],
      banked_scores: [
        {
          source: "trade",
          points: 8.2,
          championships: 0,
          postseason_points: 3,
          participants: { ...participants, id: "p0", name: "Iga Swiatek", sports: { code: "wta" } },
        },
      ],
    });
    expect(team.picks[0]).toMatchObject({
      baseline: { total: 12.5, championships: 1, postseasonPoints: 50 },
      acquiredAt: "2026-09-29T12:00:00Z",
    });
    expect(team.banked).toEqual([
      {
        sport: "wta",
        participant: expect.objectContaining({ id: "p0", name: "Iga Swiatek" }),
        source: "trade",
        total: 8.2,
        championships: 0,
        postseasonPoints: 3,
      },
    ]);
  });

  it("keeps a dropped player's banked points apart from a traded one's by source", () => {
    const bankedRow = (source: string) => ({
      source,
      points: 4,
      championships: 0,
      postseason_points: 0,
      participants: { ...participants, sports: { code: "wta" } },
    });
    const team = toTeamData({
      id: "t1",
      slug: "papie",
      name: "Papie",
      profiles: null,
      picks: [],
      banked_scores: [bankedRow("free_agent"), bankedRow("trade")],
    });
    expect(team.banked.map((b) => b.source)).toEqual(["free_agent", "trade"]);
  });

  it("fails loudly on a banked source the domain doesn't know", () => {
    expect(() =>
      toTeamData({
        id: "t1",
        slug: "x",
        name: "X",
        profiles: null,
        picks: [],
        banked_scores: [
          {
            source: "waiver",
            points: 1,
            championships: 0,
            postseason_points: 0,
            participants: { ...participants, sports: { code: "wta" } },
          },
        ],
      }),
    ).toThrow(/waiver/);
  });

  it("fails loudly on a sport code the catalog doesn't know", () => {
    expect(() =>
      toTeamData({
        id: "t1",
        slug: "x",
        name: "X",
        profiles: null,
        picks: [{ sports: { code: "curling" }, participants, ...drafted }],
        banked_scores: [],
      }),
    ).toThrow(/curling/);
  });
});
