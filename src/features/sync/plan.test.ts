import { describe, expect, it } from "vitest";
import {
  planSportSync,
  type ExistingResult,
  type PlanInput,
  type PlanParticipant,
  type PlanRule,
} from "./plan";

const rule = (
  id: string,
  code: string,
  kind: PlanRule["kind"],
  band?: [number, number],
): PlanRule => ({ id, code, kind, rankFrom: band?.[0] ?? null, rankTo: band?.[1] ?? null });

const RULES: PlanRule[] = [
  rule("r-win", "win", "per_win"),
  rule("r-tie", "tie", "per_tie"),
  rule("r-wild", "wild_card", "playoff_milestone"),
  rule("r-champ", "champion", "playoff_milestone"),
  rule("r-mchamp", "champion", "major_finish"),
  rule("r-top10", "top_10", "major_finish"),
  rule("r-made", "made_cut", "major_finish"),
  rule("r-b1", "rank_1", "final_rank_band", [1, 1]),
  rule("r-b10", "rank_6_10", "final_rank_band", [6, 10]),
  rule("r-b20", "rank_11_20", "final_rank_band", [11, 20]),
];

const CHIEFS: PlanParticipant = { id: "p-chiefs", name: "Chiefs", externalId: "12" };
const BILLS: PlanParticipant = { id: "p-bills", name: "Bills", externalId: "2" };
const AMATEUR: PlanParticipant = { id: "p-am", name: "Amateur", externalId: null };

const row = (over: Partial<ExistingResult> & Pick<ExistingResult, "id">): ExistingResult => ({
  participantId: CHIEFS.id,
  ruleId: "r-win",
  quantity: 1,
  eventLabel: "",
  isLocked: false,
  ...over,
});

const plan = (input: Partial<PlanInput>) => {
  const result = planSportSync({
    rules: RULES,
    participants: [CHIEFS, BILLS],
    existing: [],
    facts: {},
    ...input,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

describe("wins and ties", () => {
  const facts = {
    records: [
      { externalId: "12", wins: 3, ties: 1 },
      { externalId: "2", wins: 0, ties: 0 },
    ],
  };

  it("writes wins and ties as quantities, skipping zero counts with no existing row", () => {
    const result = plan({ facts });
    expect(result.upserts).toEqual([
      { participantId: "p-chiefs", ruleId: "r-win", quantity: 3, eventLabel: "" },
      { participantId: "p-chiefs", ruleId: "r-tie", quantity: 1, eventLabel: "" },
    ]);
  });

  it("only updates rows whose quantity changed, so a second run is a no-op", () => {
    const existing = [
      row({ id: "a", quantity: 2 }),
      row({ id: "b", ruleId: "r-tie", quantity: 1 }),
    ];
    const result = plan({ facts, existing });
    expect(result.upserts).toEqual([
      { participantId: "p-chiefs", ruleId: "r-win", quantity: 3, eventLabel: "" },
    ]);

    const settled = plan({
      facts,
      existing: [row({ id: "a", quantity: 3 }), row({ id: "b", ruleId: "r-tie", quantity: 1 })],
    });
    expect(settled.upserts).toEqual([]);
    expect(settled.deleteIds).toEqual([]);
  });

  it("resets an existing row to zero when the record is corrected downward", () => {
    const result = plan({
      facts: { records: [{ externalId: "12", wins: 0, ties: 0 }] },
      existing: [row({ id: "a", quantity: 2 })],
    });
    expect(result.upserts).toEqual([
      { participantId: "p-chiefs", ruleId: "r-win", quantity: 0, eventLabel: "" },
    ]);
  });

  it("never touches a locked row", () => {
    const result = plan({ facts, existing: [row({ id: "a", quantity: 9, isLocked: true })] });
    expect(result.upserts.map((u) => u.ruleId)).toEqual(["r-tie"]);
  });

  it("reports picked participants the feed did not return, and those with no vendor id", () => {
    const result = plan({
      participants: [CHIEFS, BILLS, AMATEUR],
      facts: { records: [{ externalId: "12", wins: 1, ties: 0 }] },
    });
    expect(result.unmatchedExternalIds).toEqual(["2"]);
    expect(result.missingExternalIdCount).toBe(1);
  });

  it("ignores teams nobody picked", () => {
    const result = plan({
      facts: { records: [{ externalId: "99", wins: 10, ties: 0 }] },
    });
    expect(result.upserts).toEqual([]);
  });

  it("fails loudly when the sport has no win rule", () => {
    const result = planSportSync({
      rules: RULES.filter((r) => r.kind !== "per_win"),
      participants: [CHIEFS],
      existing: [],
      facts: { records: [{ externalId: "12", wins: 1, ties: 0 }] },
    });
    expect(result).toMatchObject({ ok: false, error: { code: "missing_rule" } });
  });
});

describe("postseason stages", () => {
  it("maps each stage to the milestone rule with the same code, one row each", () => {
    const result = plan({
      facts: {
        stages: [
          { externalId: "12", stage: "wild_card" },
          { externalId: "12", stage: "champion" },
        ],
      },
    });
    expect(result.upserts.map((u) => u.ruleId).sort()).toEqual(["r-champ", "r-wild"]);
  });

  it("does not confuse a major_finish rule with the milestone of the same code", () => {
    const result = plan({ facts: { stages: [{ externalId: "12", stage: "champion" }] } });
    expect(result.upserts).toHaveLength(1);
    expect(result.upserts[0]?.ruleId).toBe("r-champ");
  });

  it("fails the whole plan when a stage has no rule, even for a team nobody picked", () => {
    const result = planSportSync({
      rules: RULES,
      participants: [CHIEFS],
      existing: [],
      facts: { stages: [{ externalId: "99", stage: "super_bowl_mvp" }] },
    });
    expect(result).toMatchObject({ ok: false, error: { code: "missing_rule" } });
  });

  it("never deletes a milestone that a thinner fetch stopped reporting", () => {
    const result = plan({
      facts: { stages: [] },
      existing: [row({ id: "m", ruleId: "r-wild", quantity: 1 })],
    });
    expect(result.deleteIds).toEqual([]);
  });
});

describe("major finishes", () => {
  const ATHLETE: PlanParticipant = { id: "p-ath", name: "Athlete", externalId: "77" };
  const finish = (finishName: string, completed = true, eventName = "Masters") => ({
    externalId: "77",
    eventName,
    finish: finishName,
    completed,
  });
  const base = { participants: [ATHLETE] };

  it("writes one row per event with the event label", () => {
    const result = plan({ ...base, facts: { majors: [finish("top_10")] } });
    expect(result.upserts).toEqual([
      { participantId: "p-ath", ruleId: "r-top10", quantity: 1, eventLabel: "Masters" },
    ]);
  });

  it("skips events that are still being played", () => {
    const result = plan({
      ...base,
      facts: { majors: [finish("top_10", false)] },
      existing: [
        row({ id: "old", participantId: "p-ath", ruleId: "r-made", eventLabel: "Masters" }),
      ],
    });
    expect(result.upserts).toEqual([]);
    expect(result.deleteIds).toEqual([]);
  });

  it("replaces a stale finish for the same event", () => {
    const result = plan({
      ...base,
      facts: { majors: [finish("top_10")] },
      existing: [
        row({ id: "old", participantId: "p-ath", ruleId: "r-made", eventLabel: "Masters" }),
      ],
    });
    expect(result.deleteIds).toEqual(["old"]);
    expect(result.upserts).toHaveLength(1);
  });

  it("removes a stale row for a finish that earns nothing, and writes none", () => {
    for (const nothing of ["missed_cut", "earlier"]) {
      const result = plan({
        ...base,
        facts: { majors: [finish(nothing)] },
        existing: [
          row({ id: "old", participantId: "p-ath", ruleId: "r-made", eventLabel: "Masters" }),
        ],
      });
      expect(result.deleteIds).toEqual(["old"]);
      expect(result.upserts).toEqual([]);
    }
  });

  it("leaves an event alone when any of its rows is locked", () => {
    const result = plan({
      ...base,
      facts: { majors: [finish("top_10")] },
      existing: [
        row({
          id: "lock",
          participantId: "p-ath",
          ruleId: "r-made",
          eventLabel: "Masters",
          isLocked: true,
        }),
      ],
    });
    expect(result.upserts).toEqual([]);
    expect(result.deleteIds).toEqual([]);
  });

  it("only touches the named event", () => {
    const result = plan({
      ...base,
      facts: { majors: [finish("missed_cut", true, "US Open")] },
      existing: [
        row({ id: "keep", participantId: "p-ath", ruleId: "r-made", eventLabel: "Masters" }),
      ],
    });
    expect(result.deleteIds).toEqual([]);
  });

  it("ignores athletes nobody picked and fails on an unmapped finish", () => {
    expect(
      plan({ ...base, facts: { majors: [{ ...finish("champion"), externalId: "1" }] } }).upserts,
    ).toEqual([]);
    expect(
      planSportSync({
        rules: RULES,
        participants: [ATHLETE],
        existing: [],
        facts: { majors: [finish("top_3")] },
      }),
    ).toMatchObject({ ok: false, error: { code: "missing_rule" } });
  });
});

describe("rank projection", () => {
  const ATHLETE: PlanParticipant = { id: "p-ath", name: "Athlete", externalId: "77" };
  const ranks = (rank: number) => ({ ranks: [{ externalId: "77", rank }] });

  it("writes the band containing the rank with quantity = rank", () => {
    const result = plan({ participants: [ATHLETE], facts: ranks(8) });
    expect(result.upserts).toEqual([
      { participantId: "p-ath", ruleId: "r-b10", quantity: 8, eventLabel: "" },
    ]);
  });

  it("moves to the new band and deletes the previous band row", () => {
    const result = plan({
      participants: [ATHLETE],
      facts: ranks(12),
      existing: [row({ id: "old", participantId: "p-ath", ruleId: "r-b10", quantity: 8 })],
    });
    expect(result.deleteIds).toEqual(["old"]);
    expect(result.upserts).toEqual([
      { participantId: "p-ath", ruleId: "r-b20", quantity: 12, eventLabel: "" },
    ]);
  });

  it("updates the quantity inside the same band without deleting", () => {
    const result = plan({
      participants: [ATHLETE],
      facts: ranks(9),
      existing: [row({ id: "old", participantId: "p-ath", ruleId: "r-b10", quantity: 8 })],
    });
    expect(result.deleteIds).toEqual([]);
    expect(result.upserts[0]?.quantity).toBe(9);
  });

  it("respects a locked band row (the confirmed final rank)", () => {
    const result = plan({
      participants: [ATHLETE],
      facts: ranks(1),
      existing: [
        row({ id: "final", participantId: "p-ath", ruleId: "r-b10", quantity: 7, isLocked: true }),
      ],
    });
    expect(result.upserts).toEqual([]);
    expect(result.deleteIds).toEqual([]);
  });

  it("clears the projection when the rank falls outside every band", () => {
    const result = plan({
      participants: [ATHLETE],
      facts: ranks(140),
      existing: [row({ id: "old", participantId: "p-ath", ruleId: "r-b20", quantity: 15 })],
    });
    expect(result.deleteIds).toEqual(["old"]);
    expect(result.upserts).toEqual([]);
  });

  it("reports an unranked pick and leaves their row in place", () => {
    const result = plan({
      participants: [ATHLETE],
      facts: { ranks: [] },
      existing: [row({ id: "old", participantId: "p-ath", ruleId: "r-b20", quantity: 15 })],
    });
    expect(result.unmatchedExternalIds).toEqual(["77"]);
    expect(result.deleteIds).toEqual([]);
  });
});
