import { describe, expect, it } from "vitest";
import { planPoolInserts, type PoolCandidate } from "./pool";

const candidate = (espnId: string, name: string): PoolCandidate => ({
  espnId,
  name,
  shortName: name.split(" ").at(-1) ?? name,
  logoUrl: null,
  primaryColor: null,
});

describe("planPoolInserts", () => {
  it("inserts candidates nobody stores yet, in the order given", () => {
    const plan = planPoolInserts(
      [{ name: "Texas Rangers", espnId: "13" }],
      [candidate("1", "Baltimore Orioles"), candidate("29", "Arizona Diamondbacks")],
    );
    expect(plan.inserts.map((c) => c.espnId)).toEqual(["1", "29"]);
    expect(plan.nameCollisions).toEqual([]);
  });

  it("skips a stored vendor id quietly, even if ESPN renamed the team since", () => {
    const plan = planPoolInserts(
      [{ name: "Old Name", espnId: "13" }],
      [candidate("13", "New Name")],
    );
    expect(plan).toEqual({ inserts: [], nameCollisions: [] });
  });

  it("holds back a name that a row with a different id already owns, and reports it", () => {
    const plan = planPoolInserts(
      [{ name: "Roosevelt Lakers", espnId: "599" }],
      [candidate("127991", "Roosevelt Lakers")],
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.nameCollisions).toEqual([
      { espnId: "127991", name: "Roosevelt Lakers", withinBatch: false },
    ]);
  });

  it("treats a hand-entered golfer with no ESPN id as taking the name (no second copy)", () => {
    const plan = planPoolInserts(
      [{ name: "Ludvig Åberg", espnId: null }],
      [candidate("4375972", "Ludvig Aberg"), candidate("9478", "Scottie Scheffler")],
    );
    expect(plan.inserts.map((c) => c.espnId)).toEqual(["9478"]);
    expect(plan.nameCollisions).toEqual([
      { espnId: "4375972", name: "Ludvig Aberg", withinBatch: false },
    ]);
  });

  it("collapses a repeated id in one batch and reports a second id with the same name", () => {
    const plan = planPoolInserts(
      [],
      [
        candidate("1140", "Clemson Tigers"),
        candidate("1140", "Clemson Tigers"),
        candidate("529", "Clemson Tigers"),
      ],
    );
    expect(plan.inserts.map((c) => c.espnId)).toEqual(["1140"]);
    expect(plan.nameCollisions).toEqual([
      { espnId: "529", name: "Clemson Tigers", withinBatch: true },
    ]);
  });

  it("is idempotent: once the inserts are stored, the same candidates plan nothing", () => {
    const candidates = [
      candidate("1", "A Team"),
      candidate("2", "B Team"),
      candidate("3", "B Team"),
    ];
    const first = planPoolInserts([], candidates);
    const stored = first.inserts.map((c) => ({ name: c.name, espnId: c.espnId }));
    const second = planPoolInserts(stored, candidates);

    expect(first.inserts).toHaveLength(2);
    expect(second.inserts).toEqual([]);
  });
});
