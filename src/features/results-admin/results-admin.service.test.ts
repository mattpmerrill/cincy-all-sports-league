import { describe, expect, it } from "vitest";
import type { ParticipantResultRow, ResultDraft } from "@/data/participant-results.repository";
import type { SportTarget } from "@/data/sport-targets.repository";
import type { Actor } from "@/domain/membership/membership";
import { ok } from "@/lib/result";
import { createResultsAdminService, describeRun } from "./results-admin.service";

const admin: Actor = { id: "a", role: "admin" };
const member: Actor = { id: "m", role: "member" };

const rule = (id: string, kind: SportTarget["rules"][number]["kind"], extra = {}) => ({
  id,
  code: id,
  label: id,
  kind,
  points: 1,
  rankFrom: null,
  rankTo: null,
  sortOrder: 0,
  ...extra,
});

const target: SportTarget = {
  seasonId: "s",
  endsOn: "2027-11-15",
  sportId: "sp",
  sport: "wta",
  startsOn: "2027-01-01",
  espnSeason: 2027,
  rules: [
    rule("win", "per_win"),
    rule("us_open", "major_finish"),
    rule("band", "final_rank_band", { rankFrom: 1, rankTo: 5 }),
  ],
  participants: [{ id: "p1", name: "Iga", shortName: "Iga", externalId: "1" }],
};

function setup() {
  const writes: string[] = [];
  const row: ParticipantResultRow = {
    id: "r1",
    participantId: "p1",
    ruleId: "win",
    quantity: 2,
    eventLabel: "",
    source: "manual",
    isLocked: true,
    updatedAt: "2026-09-28T00:00:00Z",
  };
  const saved: ResultDraft[] = [];
  const service = createResultsAdminService({
    targets: { listSportTargets: async () => [target] },
    results: {
      listForParticipants: async () => [row],
      insert: async (_season, draft) => {
        saved.push(draft);
        writes.push("insert");
        return ok(row);
      },
      update: async (_id, draft) => {
        saved.push(draft);
        writes.push("update");
        return ok(row);
      },
      setLocked: async () => (writes.push("lock"), ok(null)),
      remove: async () => (writes.push("remove"), ok(null)),
    },
    runs: { latestForSports: async () => new Map() },
  });
  return { service, writes, saved };
}

const form = {
  sport: "wta" as const,
  participantId: "p1",
  ruleId: "us_open",
  quantity: "1",
  eventLabel: "US Open",
  locked: true,
};

describe("results admin service", () => {
  it("refuses every operation for a non-admin before touching data", async () => {
    const { service, writes } = setup();
    const results = [
      await service.saveResult(member, form),
      await service.deleteResult(member, "r1"),
      await service.setLocked(member, "r1", true),
      await service.getSportView(member, "wta"),
      await service.getSyncHealth(member),
    ];
    expect(results.every((r) => !r.ok && r.error.code === "forbidden")).toBe(true);
    expect(writes).toEqual([]);
  });

  it("inserts a new result and updates an existing one, with normalized values", async () => {
    const { service, writes, saved } = setup();
    expect((await service.saveResult(admin, form)).ok).toBe(true);
    expect((await service.saveResult(admin, { ...form, id: "r1" })).ok).toBe(true);
    expect(writes).toEqual(["insert", "update"]);
    expect(saved[0]).toEqual({
      participantId: "p1",
      ruleId: "us_open",
      quantity: 1,
      eventLabel: "US Open",
      isLocked: true,
    });
  });

  it("rejects a rule from another sport and a participant nobody picked", async () => {
    const { service, writes } = setup();
    expect(await service.saveResult(admin, { ...form, ruleId: "nfl-win" })).toMatchObject({
      ok: false,
      error: { code: "invalid" },
    });
    expect(await service.saveResult(admin, { ...form, participantId: "stranger" })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(writes).toEqual([]);
  });

  it("rejects a rank outside the rule's band without writing", async () => {
    const { service, writes } = setup();
    const result = await service.saveResult(admin, { ...form, ruleId: "band", quantity: "9" });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect(writes).toEqual([]);
  });

  it("builds the sport view with rule labels per participant", async () => {
    const { service } = setup();
    const view = await service.getSportView(admin, "wta");
    if (!view.ok) throw new Error("expected a view");
    expect(view.value.participants[0]?.results).toMatchObject([
      { id: "r1", ruleLabel: "win", isLocked: true, source: "manual" },
    ]);
  });
});

describe("describeRun", () => {
  it("summarizes each status in one sentence", () => {
    expect(
      describeRun("succeeded", { upserted: 4, deleted: 1, unmatchedExternalIds: ["9", "8"] }),
    ).toBe("4 written, 1 removed, 2 not found in the feed");
    expect(describeRun("skipped", { reason: "before_season_start" })).toBe(
      "Season has not started",
    );
    expect(describeRun("failed", { error: { code: "espn_timeout", message: "timed out" } })).toBe(
      "timed out",
    );
    expect(describeRun("failed", "garbage")).toBe("The run failed.");
  });
});
