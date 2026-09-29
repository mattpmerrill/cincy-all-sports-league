import type { ScoringRuleKind } from "@/domain/scoring";
import type { AppError, Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import type { SportFacts } from "./results-provider";

/** The slice of a scoring rule the planner needs. */
export type PlanRule = {
  id: string;
  code: string;
  kind: ScoringRuleKind;
  rankFrom: number | null;
  rankTo: number | null;
};

export type PlanParticipant = { id: string; name: string; externalId: string | null };

export type ExistingResult = {
  id: string;
  participantId: string;
  ruleId: string;
  quantity: number;
  eventLabel: string;
  isLocked: boolean;
};

export type PlannedUpsert = {
  participantId: string;
  ruleId: string;
  quantity: number;
  eventLabel: string;
};

export type SyncPlan = {
  upserts: PlannedUpsert[];
  deleteIds: string[];
  /** Rows already equal to the facts, or protected by a lock: nothing to write. */
  unchanged: number;
  /** Picked participants the vendor returned no record or rank for. */
  unmatchedExternalIds: string[];
  /** Picked participants with no vendor id at all (admin enters their results). */
  missingExternalIdCount: number;
};

export type PlanError = AppError<"missing_rule">;

export type PlanInput = {
  rules: readonly PlanRule[];
  participants: readonly PlanParticipant[];
  existing: readonly ExistingResult[];
  facts: SportFacts;
};

/** Majors where the finish earns nothing: no row, and any stale one is removed. */
const NO_POINTS_FINISHES: ReadonlySet<string> = new Set(["earlier", "missed_cut"]);

const keyOf = (participantId: string, ruleId: string, eventLabel: string) =>
  `${participantId}\u0000${ruleId}\u0000${eventLabel}`;

/**
 * Turns vendor facts plus what the database already holds into the smallest set of writes.
 * Pure: no I/O, no clock. Rules of the road:
 *
 * - A locked row is never touched, and a lock on any row of a group (a major event, the year-end
 *   rank band) freezes that whole group, so sync cannot add a second, conflicting row beside it.
 * - Milestones are only ever added. A round reached is not retracted by a later, thinner fetch.
 * - Only facts about our picked participants are read; everything else in the feed is ignored.
 * - A fact that maps to no rule fails the whole plan: that is config drift, so it is loud.
 */
export function planSportSync(input: PlanInput): Result<SyncPlan, PlanError> {
  const { rules, participants, existing, facts } = input;
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const ruleByKindCode = new Map(rules.map((r) => [`${r.kind}:${r.code}`, r]));
  const byExternalId = new Map(
    participants.flatMap((p) => (p.externalId ? [[p.externalId, p] as const] : [])),
  );
  const existingByKey = new Map(
    existing.map((e) => [keyOf(e.participantId, e.ruleId, e.eventLabel), e]),
  );

  const desired = new Map<string, PlannedUpsert>();
  const deleteIds = new Set<string>();
  const unmatched = new Set<string>();
  const want = (participantId: string, ruleId: string, quantity: number, eventLabel = "") =>
    desired.set(keyOf(participantId, ruleId, eventLabel), {
      participantId,
      ruleId,
      quantity,
      eventLabel,
    });
  const existingFor = (participantId: string, predicate: (rule: PlanRule) => boolean) =>
    existing.filter((e) => {
      const rule = ruleById.get(e.ruleId);
      return e.participantId === participantId && rule !== undefined && predicate(rule);
    });
  const missing = (what: string) =>
    err("missing_rule", `No scoring rule for ${what}`) satisfies Result<never, PlanError>;

  if (facts.records) {
    const winRule = rules.find((r) => r.kind === "per_win");
    if (!winRule) return missing("wins");
    const tieRule = rules.find((r) => r.kind === "per_tie");
    const byTeam = new Map(facts.records.map((r) => [r.externalId, r]));
    for (const p of participants) {
      if (!p.externalId) continue;
      const record = byTeam.get(p.externalId);
      if (!record) {
        unmatched.add(p.externalId);
        continue;
      }
      const write = (rule: PlanRule, quantity: number) => {
        // No row for a zero count unless one exists, so a corrected record can still reset it.
        if (quantity > 0 || existingByKey.has(keyOf(p.id, rule.id, ""))) {
          want(p.id, rule.id, quantity);
        }
      };
      write(winRule, record.wins);
      if (tieRule) write(tieRule, record.ties);
    }
  }

  if (facts.stages) {
    for (const stage of new Set(facts.stages.map((s) => s.stage))) {
      if (!ruleByKindCode.has(`playoff_milestone:${stage}`)) return missing(`stage "${stage}"`);
    }
    for (const { externalId, stage } of facts.stages) {
      const participant = byExternalId.get(externalId);
      const rule = ruleByKindCode.get(`playoff_milestone:${stage}`);
      if (participant && rule) want(participant.id, rule.id, 1);
    }
  }

  if (facts.majors) {
    for (const fact of facts.majors) {
      const participant = byExternalId.get(fact.externalId);
      // Provisional finishes are not written: a leaderboard position can still change.
      if (!participant || !fact.completed) continue;

      const rows = existingFor(participant.id, (r) => r.kind === "major_finish").filter(
        (e) => e.eventLabel === fact.eventName,
      );
      if (rows.some((e) => e.isLocked)) continue;

      const rule = NO_POINTS_FINISHES.has(fact.finish)
        ? null
        : (ruleByKindCode.get(`major_finish:${fact.finish}`) ?? null);
      if (!rule && !NO_POINTS_FINISHES.has(fact.finish)) return missing(`finish "${fact.finish}"`);

      for (const row of rows) if (row.ruleId !== rule?.id) deleteIds.add(row.id);
      if (rule) want(participant.id, rule.id, 1, fact.eventName);
    }
  }

  if (facts.ranks) {
    const bands = rules.filter((r) => r.kind === "final_rank_band");
    const byAthlete = new Map(facts.ranks.map((r) => [r.externalId, r.rank]));
    for (const p of participants) {
      if (!p.externalId) continue;
      const rank = byAthlete.get(p.externalId);
      if (rank === undefined) {
        unmatched.add(p.externalId);
        continue;
      }
      // An admin lock means the true final rank is confirmed; the projection must not fight it.
      const rows = existingFor(p.id, (r) => r.kind === "final_rank_band");
      if (rows.some((e) => e.isLocked)) continue;

      const band = bands.find(
        (b) => b.rankFrom !== null && b.rankTo !== null && rank >= b.rankFrom && rank <= b.rankTo,
      );
      for (const row of rows) if (row.ruleId !== band?.id) deleteIds.add(row.id);
      if (band) want(p.id, band.id, rank);
    }
  }

  const upserts: PlannedUpsert[] = [];
  let unchanged = 0;
  for (const [key, row] of desired) {
    const current = existingByKey.get(key);
    if (current?.isLocked || current?.quantity === row.quantity) unchanged += 1;
    else upserts.push(row);
  }

  // A locked row can be in the delete set only through a bug above; enforce the invariant anyway.
  const lockedIds = new Set(existing.filter((e) => e.isLocked).map((e) => e.id));
  return ok({
    upserts,
    deleteIds: [...deleteIds].filter((id) => !lockedIds.has(id)),
    unchanged,
    unmatchedExternalIds: [...unmatched].sort(),
    missingExternalIdCount: participants.filter((p) => !p.externalId).length,
  });
}
