import type { RecordData } from "@/domain/league";
import type { RecordFact } from "./results-provider";

export type RecordPlanParticipant = { id: string; externalId: string | null };

export type RecordPlan = {
  /** Records that are new or differ from what is stored: the only rows worth writing. */
  writes: RecordData[];
  /** Rows already equal to the fact. */
  unchanged: number;
};

// The table checks counts are whole and non-negative; one bad number from the vendor would fail
// the whole batch, so such a fact is skipped here and the rest still land.
const isCount = (n: number) => Number.isInteger(n) && n >= 0;

/**
 * Turns vendor record facts plus what is stored into the rows to write. Pure, and deliberately
 * separate from `planSportSync`: a record is a display fact, so it has no rules, no locks and no
 * way to change a score. A fact for someone outside `participants` is ignored (the results plan
 * already reports unmatched ids), and a fact with a count the table would reject is skipped. An
 * unchanged record is not rewritten, so a quiet sync run touches no rows and `updated_at` keeps
 * meaning "the record last changed".
 */
export function planRecordWrites(input: {
  participants: readonly RecordPlanParticipant[];
  existing: readonly RecordData[];
  facts: readonly RecordFact[];
}): RecordPlan {
  const factByExternalId = new Map(input.facts.map((f) => [f.externalId, f]));
  const existingById = new Map(input.existing.map((r) => [r.participantId, r]));

  const writes: RecordData[] = [];
  let unchanged = 0;
  for (const participant of input.participants) {
    if (!participant.externalId) continue;
    const fact = factByExternalId.get(participant.externalId);
    if (!fact || ![fact.wins, fact.losses, fact.ties, fact.otLosses].every(isCount)) continue;

    const next: RecordData = {
      participantId: participant.id,
      wins: fact.wins,
      losses: fact.losses,
      ties: fact.ties,
      otLosses: fact.otLosses,
    };
    const current = existingById.get(participant.id);
    if (
      current &&
      current.wins === next.wins &&
      current.losses === next.losses &&
      current.ties === next.ties &&
      current.otLosses === next.otLosses
    ) {
      unchanged += 1;
    } else {
      writes.push(next);
    }
  }
  return { writes, unchanged };
}
