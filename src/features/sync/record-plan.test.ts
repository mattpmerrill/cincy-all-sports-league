import { describe, expect, it } from "vitest";
import { planRecordWrites } from "./record-plan";
import type { RecordFact } from "./results-provider";

const participants = [
  { id: "p1", externalId: "e1" },
  { id: "p2", externalId: "e2" },
  { id: "p3", externalId: null },
];
const fact = (externalId: string, wins: number, losses: number, ties = 0, otLosses = 0) =>
  ({ externalId, wins, losses, ties, otLosses }) satisfies RecordFact;
const stored = (participantId: string, wins: number, losses: number, ties = 0, otLosses = 0) => ({
  participantId,
  wins,
  losses,
  ties,
  otLosses,
});

describe("planRecordWrites", () => {
  it("writes every record that is new, mapped to our participant ids", () => {
    const plan = planRecordWrites({
      participants,
      existing: [],
      facts: [fact("e1", 3, 1), fact("e2", 0, 4, 0, 2)],
    });
    expect(plan.writes).toEqual([stored("p1", 3, 1), stored("p2", 0, 4, 0, 2)]);
  });

  it("is idempotent: feeding the plan's own writes back in plans nothing", () => {
    const facts = [fact("e1", 3, 1), fact("e2", 0, 4, 1, 2)];
    const first = planRecordWrites({ participants, existing: [], facts });
    const second = planRecordWrites({ participants, existing: first.writes, facts });
    expect(second).toEqual({ writes: [], unchanged: 2 });
  });

  it("rewrites a record when any single count changes, including an overtime loss", () => {
    const plan = planRecordWrites({
      participants,
      existing: [stored("p1", 3, 1, 0, 0), stored("p2", 5, 5, 0, 1)],
      facts: [fact("e1", 3, 1, 0, 1), fact("e2", 5, 5, 0, 1)],
    });
    expect(plan.writes).toEqual([stored("p1", 3, 1, 0, 1)]);
    expect(plan.unchanged).toBe(1);
  });

  it("ignores facts for strangers and participants with no vendor id", () => {
    const plan = planRecordWrites({
      participants,
      existing: [],
      facts: [fact("someone-else", 9, 9), fact("e1", 1, 0)],
    });
    expect(plan.writes).toEqual([stored("p1", 1, 0)]);
  });

  it("skips a record the table would reject, so one bad number cannot fail the batch", () => {
    const plan = planRecordWrites({
      participants,
      existing: [],
      facts: [fact("e1", -1, 0), fact("e2", 2.5, 0)],
    });
    expect(plan.writes).toEqual([]);

    const mixed = planRecordWrites({
      participants,
      existing: [],
      facts: [fact("e1", -1, 0), fact("e2", 4, 1)],
    });
    expect(mixed.writes).toEqual([stored("p2", 4, 1)]);
  });
});
