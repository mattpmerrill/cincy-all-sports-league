import { err, ok, type AppError, type Result } from "@/lib/result";
import { PG, type DbClient } from "./db-client";
import { fetchAllRows } from "./paginate";

export type ResultSource = "espn" | "manual";

export type ParticipantResultRow = {
  id: string;
  participantId: string;
  ruleId: string;
  quantity: number;
  eventLabel: string;
  source: ResultSource;
  isLocked: boolean;
  updatedAt: string;
};

/** What sync wants written. `source` is always "espn" and set here, not by callers. */
export type ResultUpsert = {
  participantId: string;
  ruleId: string;
  quantity: number;
  eventLabel: string;
};

export type ResultDraft = ResultUpsert & { isLocked: boolean };

export type WriteResultError = AppError<"forbidden" | "conflict" | "invalid" | "not_found">;

const COLUMNS =
  "id, participant_id, scoring_rule_id, quantity, event_label, source, is_locked, updated_at";
const CHUNK = 500;

type Row = {
  id: string;
  participant_id: string;
  scoring_rule_id: string;
  quantity: number;
  event_label: string;
  source: ResultSource;
  is_locked: boolean;
  updated_at: string;
};

const toRow = (r: Row): ParticipantResultRow => ({
  id: r.id,
  participantId: r.participant_id,
  ruleId: r.scoring_rule_id,
  quantity: r.quantity,
  eventLabel: r.event_label,
  source: r.source,
  isLocked: r.is_locked,
  updatedAt: r.updated_at,
});

export type ParticipantResultsRepository = ReturnType<typeof createParticipantResultsRepository>;

export function createParticipantResultsRepository(db: DbClient) {
  const writeError = (error: { code?: string }): WriteResultError => {
    switch (error.code) {
      case PG.insufficientPrivilege:
        return { code: "forbidden", message: "Only admins can edit results." };
      case PG.uniqueViolation:
        return { code: "conflict", message: "That result already exists for this participant." };
      case PG.checkViolation:
        return { code: "invalid", message: "That result doesn't fit the rule." };
      default:
        throw error;
    }
  };

  return {
    async listForParticipants(
      seasonId: string,
      participantIds: readonly string[],
    ): Promise<ParticipantResultRow[]> {
      if (participantIds.length === 0) return [];
      const rows = await fetchAllRows<Row>((from, to) =>
        db
          .from("participant_results")
          .select(COLUMNS)
          .eq("season_id", seasonId)
          .in("participant_id", [...participantIds])
          .order("id")
          .range(from, to),
      );
      return rows.map(toRow);
    },

    /**
     * Sync's writer (secret-key client). Deletes skip locked rows even if the plan raced with an
     * admin locking one; upserts are idempotent on the table's natural key.
     */
    async applyChanges(
      seasonId: string,
      upserts: readonly ResultUpsert[],
      deleteIds: readonly string[],
    ): Promise<{ upserted: number; deleted: number }> {
      let deleted = 0;
      for (let i = 0; i < deleteIds.length; i += CHUNK) {
        const { data, error } = await db
          .from("participant_results")
          .delete()
          .in("id", deleteIds.slice(i, i + CHUNK))
          .eq("is_locked", false)
          .select("id");
        if (error) throw error;
        deleted += data.length;
      }
      for (let i = 0; i < upserts.length; i += CHUNK) {
        const chunk = upserts.slice(i, i + CHUNK).map((u) => ({
          season_id: seasonId,
          participant_id: u.participantId,
          scoring_rule_id: u.ruleId,
          quantity: u.quantity,
          event_label: u.eventLabel,
          source: "espn" as const,
        }));
        const { error } = await db
          .from("participant_results")
          .upsert(chunk, { onConflict: "season_id,participant_id,scoring_rule_id,event_label" });
        if (error) throw error;
      }
      return { upserted: upserts.length, deleted };
    },

    /** Admin writes run as the signed-in user: RLS admits admins and the trigger marks them manual. */
    async insert(
      seasonId: string,
      draft: ResultDraft,
    ): Promise<Result<ParticipantResultRow, WriteResultError>> {
      const { data, error } = await db
        .from("participant_results")
        .insert({
          season_id: seasonId,
          participant_id: draft.participantId,
          scoring_rule_id: draft.ruleId,
          quantity: draft.quantity,
          event_label: draft.eventLabel,
          is_locked: draft.isLocked,
        })
        .select(COLUMNS)
        .single();
      return error ? { ok: false, error: writeError(error) } : ok(toRow(data));
    },

    async update(
      id: string,
      draft: ResultDraft,
    ): Promise<Result<ParticipantResultRow, WriteResultError>> {
      const { data, error } = await db
        .from("participant_results")
        .update({
          participant_id: draft.participantId,
          scoring_rule_id: draft.ruleId,
          quantity: draft.quantity,
          event_label: draft.eventLabel,
          is_locked: draft.isLocked,
        })
        .eq("id", id)
        .select(COLUMNS)
        .maybeSingle();
      if (error) return { ok: false, error: writeError(error) };
      // RLS hides rows from non-admins, so "nothing updated" covers missing and forbidden alike.
      return data ? ok(toRow(data)) : err("not_found", "That result no longer exists.");
    },

    async setLocked(id: string, isLocked: boolean): Promise<Result<null, WriteResultError>> {
      const { data, error } = await db
        .from("participant_results")
        .update({ is_locked: isLocked })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) return { ok: false, error: writeError(error) };
      return data ? ok(null) : err("not_found", "That result no longer exists.");
    },

    async remove(id: string): Promise<Result<null, WriteResultError>> {
      const { data, error } = await db
        .from("participant_results")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) return { ok: false, error: writeError(error) };
      return data ? ok(null) : err("not_found", "That result no longer exists.");
    },
  };
}
