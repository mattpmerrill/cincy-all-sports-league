import type { LeagueModel, ParticipantData } from "@/domain/league";
import type { SportCode } from "@/domain/sports/sports";

/** Ids of every participant some team holds in the sport, from the model's per-sport pick rows. */
export function heldParticipantIds(
  model: Pick<LeagueModel, "sportPicks">,
  sport: SportCode,
): Set<string> {
  return new Set(model.sportPicks[sport].map((row) => row.participant.id));
}

/**
 * Who a team may add from a sport's pool. Normally that is everyone nobody holds. The WNBA is the
 * one sport that lets teams share a participant, so there only the team's own current pick is off
 * the table (adding what you already hold is meaningless). `ownPickId` is null for a visitor.
 * SQL re-checks all of this under a lock; this only decides what the page offers.
 */
export function freeAgentsIn<T extends Pick<ParticipantData, "id">>(input: {
  pool: readonly T[];
  heldIds: ReadonlySet<string>;
  allowsDuplicatePicks: boolean;
  ownPickId: string | null;
}): T[] {
  const { pool, heldIds, allowsDuplicatePicks, ownPickId } = input;
  return pool.filter((p) => (allowsDuplicatePicks ? p.id !== ownPickId : !heldIds.has(p.id)));
}
