import type {
  ParticipantResultRow,
  ParticipantResultsRepository,
  ResultSource,
} from "@/data/participant-results.repository";
import type {
  SportTarget,
  SportTargetsRepository,
  TargetParticipant,
  TargetRule,
} from "@/data/sport-targets.repository";
import type { SyncRunsRepository, SyncStatus } from "@/data/sync-runs.repository";
import { isAdminRole, type Actor } from "@/domain/membership/membership";
import type { ScoringRuleKind } from "@/domain/scoring";
import type { SportCode } from "@/domain/sports/sports";
import { err, ok, type AppError, type Result } from "@/lib/result";
import { normalizeResultInput } from "./result-input";
import { runSummarySchema, type SaveResultInput } from "./schemas";

export type ResultsAdminDeps = {
  targets: Pick<SportTargetsRepository, "listSportTargets">;
  results: Pick<
    ParticipantResultsRepository,
    "listForParticipants" | "insert" | "update" | "setLocked" | "remove"
  >;
  runs: Pick<SyncRunsRepository, "latestForSports">;
};

export type ResultsAdminError = AppError<"forbidden" | "not_found" | "invalid" | "conflict">;

export type ResultLine = {
  id: string;
  ruleId: string;
  ruleLabel: string;
  ruleKind: ScoringRuleKind;
  quantity: number;
  eventLabel: string;
  source: ResultSource;
  isLocked: boolean;
  updatedAt: string;
};

export type ParticipantResults = TargetParticipant & { results: ResultLine[] };

export type SportResultsView = {
  sport: SportCode;
  rules: TargetRule[];
  participants: ParticipantResults[];
};

/** A sync_runs row reduced to what the health panel prints. */
export type SportHealth = {
  sport: SportCode;
  /** Null when the sport has never had a run. */
  status: SyncStatus | null;
  startedAt: string | null;
  finishedAt: string | null;
  detail: string;
};

const forbidden = () => err("forbidden", "Only admins can edit results.");

/** One plain sentence for a run: counts on success, the reason on skip or failure. */
export function describeRun(status: SyncStatus, summary: unknown): string {
  const parsed = runSummarySchema.safeParse(summary);
  const s = parsed.success ? parsed.data : {};
  switch (status) {
    case "succeeded": {
      const parts = [`${s.upserted ?? 0} written`, `${s.deleted ?? 0} removed`];
      const unmatched = s.unmatchedExternalIds?.length ?? 0;
      if (unmatched > 0) parts.push(`${unmatched} not found in the feed`);
      if ((s.missingExternalIds ?? 0) > 0) parts.push(`${s.missingExternalIds} without a feed id`);
      return parts.join(", ");
    }
    case "skipped":
      return s.reason === "after_season_end" ? "Season is over" : "Season has not started";
    case "failed":
      return s.error?.message ?? "The run failed.";
    case "running":
      return "In progress";
  }
}

export type ResultsAdminService = ReturnType<typeof createResultsAdminService>;

export function createResultsAdminService({ targets, results, runs }: ResultsAdminDeps) {
  async function targetFor(sport: SportCode): Promise<SportTarget | null> {
    return (await targets.listSportTargets([sport]))[0] ?? null;
  }

  return {
    async getSportView(
      actor: Actor,
      sport: SportCode,
    ): Promise<Result<SportResultsView, ResultsAdminError>> {
      if (!isAdminRole(actor.role)) return forbidden();
      const target = await targetFor(sport);
      if (!target) return err("not_found", "That sport isn't part of the active season.");

      const rows = await results.listForParticipants(
        target.seasonId,
        target.participants.map((p) => p.id),
      );
      const rulesById = new Map(target.rules.map((r) => [r.id, r]));
      const order = (r: ParticipantResultRow) => rulesById.get(r.ruleId)?.sortOrder ?? 0;
      const linesFor = (participantId: string): ResultLine[] =>
        rows
          .filter((r) => r.participantId === participantId)
          .sort((a, b) => order(a) - order(b) || a.eventLabel.localeCompare(b.eventLabel))
          .flatMap((r) => {
            const rule = rulesById.get(r.ruleId);
            return rule ? [{ ...r, ruleLabel: rule.label, ruleKind: rule.kind }] : [];
          });

      return ok({
        sport,
        rules: target.rules,
        participants: target.participants.map((p) => ({ ...p, results: linesFor(p.id) })),
      });
    },

    /** Last run per sport of the active season, in the catalog order the caller passes. */
    async getSyncHealth(actor: Actor): Promise<Result<SportHealth[], ResultsAdminError>> {
      if (!isAdminRole(actor.role)) return forbidden();
      const all = await targets.listSportTargets();
      const latest = await runs.latestForSports(all.map((t) => t.sportId));
      return ok(
        all.map((t) => {
          const run = latest.get(t.sportId);
          return {
            sport: t.sport,
            status: run?.status ?? null,
            startedAt: run?.startedAt ?? null,
            finishedAt: run?.finishedAt ?? null,
            detail: run ? describeRun(run.status, run.summary) : "Never run",
          };
        }),
      );
    },

    async saveResult(
      actor: Actor,
      input: SaveResultInput,
    ): Promise<Result<null, ResultsAdminError>> {
      if (!isAdminRole(actor.role)) return forbidden();
      const target = await targetFor(input.sport);
      // The rule must belong to this sport and the participant must be one of its picks; the
      // database trigger enforces the sport match too, but this says which input was wrong.
      const rule = target?.rules.find((r) => r.id === input.ruleId);
      const participant = target?.participants.find((p) => p.id === input.participantId);
      if (!target || !rule) return err("invalid", "That result type isn't a rule for this sport.");
      if (!participant) return err("not_found", "That participant isn't picked in this sport.");

      const normalized = normalizeResultInput(rule, input);
      if (!normalized.ok) return normalized;

      const draft = {
        participantId: participant.id,
        ruleId: rule.id,
        quantity: normalized.value.quantity,
        eventLabel: normalized.value.eventLabel,
        isLocked: input.locked,
      };
      const saved = input.id
        ? await results.update(input.id, draft)
        : await results.insert(target.seasonId, draft);
      return saved.ok ? ok(null) : saved;
    },

    async deleteResult(actor: Actor, resultId: string): Promise<Result<null, ResultsAdminError>> {
      if (!isAdminRole(actor.role)) return forbidden();
      return results.remove(resultId);
    },

    async setLocked(
      actor: Actor,
      resultId: string,
      locked: boolean,
    ): Promise<Result<null, ResultsAdminError>> {
      if (!isAdminRole(actor.role)) return forbidden();
      return results.setLocked(resultId, locked);
    },
  };
}
