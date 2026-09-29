import { FREE_AGENT_ATHLETE_POOL_SIZE, planPoolInserts } from "@/domain/free-agents/pool";
import type { NewParticipant, StoredParticipant } from "@/data/participants.repository";
import type { SportTarget } from "@/data/sport-targets.repository";
import type { Logger } from "@/lib/logger";
import { ok, type Result } from "@/lib/result";
import type { DirectoryProvider, ProviderError } from "./results-provider";

export type RosterDeps = {
  directory: DirectoryProvider;
  participants: {
    listForSport(sportId: string): Promise<StoredParticipant[]>;
    insertMany(rows: readonly NewParticipant[]): Promise<number>;
  };
  logger: Logger;
};

export type RosterSummary = {
  inserted: number;
  /** Listed by the vendor but deliberately not inserted: placeholders, duplicates, name clashes. */
  skipped: number;
};

/** Enough of a target to know which sport and which vendor season to list. */
export type RosterTarget = Pick<SportTarget, "sportId" | "sport" | "espnSeason">;

/** Names in a log line stay readable; the counts carry the rest. */
const LOGGED_SKIPS = 20;

/**
 * Loads every team or top athlete the vendor lists for a sport into `participants`, so members
 * can browse and pick up free agents.
 *
 * Insert-only and idempotent: existing rows (and their names, ids, logos) are never touched, so a
 * re-run inserts 0, and a team ESPN renames keeps its old name here. It ignores the season
 * window on purpose: the pool should be browsable before a season starts.
 */
export async function refreshRoster(
  deps: RosterDeps,
  target: RosterTarget,
): Promise<Result<RosterSummary, ProviderError>> {
  const log = deps.logger.child({ sport: target.sport });
  const stored = await deps.participants.listForSport(target.sportId);

  const directory = await deps.directory.fetchDirectory({
    sport: target.sport,
    season: target.espnSeason,
    knownExternalIds: new Set(stored.flatMap((p) => (p.espnId ? [p.espnId] : []))),
    athleteLimit: FREE_AGENT_ATHLETE_POOL_SIZE,
  });
  if (!directory.ok) return directory;

  const plan = planPoolInserts(
    stored,
    directory.value.entries.map((e) => ({
      espnId: e.externalId,
      name: e.name,
      shortName: e.shortName,
      logoUrl: e.logoUrl,
      primaryColor: e.primaryColor,
    })),
  );

  const inserted = await deps.participants.insertMany(
    plan.inserts.map((c) => ({ sportId: target.sportId, ...c })),
  );

  const skipped = plan.nameCollisions.length + directory.value.skipped.length;
  if (skipped > 0) {
    log.warn("roster entries skipped", {
      nameCollisions: plan.nameCollisions.slice(0, LOGGED_SKIPS),
      vendorSkips: directory.value.skipped.slice(0, LOGGED_SKIPS),
      total: skipped,
    });
  }
  log.info("roster refreshed", { inserted, skipped, listed: directory.value.entries.length });
  return ok({ inserted, skipped });
}
