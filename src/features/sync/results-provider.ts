import type { AppError, Result } from "@/lib/result";
import type { SportCode } from "@/domain/sports/sports";

/**
 * What sync needs from a data vendor, in league vocabulary. Nothing here names ESPN: `externalId`
 * is whatever id the vendor uses, and it is stored in `participants.espn_id`.
 */
export type RecordFact = {
  externalId: string;
  wins: number;
  losses: number;
  /** NFL ties and MLS draws. */
  ties: number;
  /** NHL overtime and shootout losses. */
  otLosses: number;
};
/** `stage` equals a playoff_milestone `scoring_rules.code` for the sport. */
export type StageFact = { externalId: string; stage: string };
/** `finish` equals a major_finish rule code, or is "earlier" / "missed_cut" (no points). */
export type MajorFact = {
  externalId: string;
  eventName: string;
  finish: string;
  completed: boolean;
};
export type RankFact = { externalId: string; rank: number };

/** A fact list is `undefined` when the sport has no such feed; an empty array means "none yet". */
export type SportFacts = {
  records?: RecordFact[];
  stages?: StageFact[];
  majors?: MajorFact[];
  ranks?: RankFact[];
};

export type FactsRequest = {
  sport: SportCode;
  season: number;
  /** The vendor ids of the participants somebody picked (college sports fetch only these). */
  externalIds: readonly string[];
};

export type ProviderError = AppError;

export interface ResultsProvider {
  fetchFacts(request: FactsRequest): Promise<Result<SportFacts, ProviderError>>;
  /**
   * True when this sport's facts cost one vendor call per participant (college records), so the
   * caller must name the participants it wants and should budget how many. False for league-wide
   * feeds, where every participant comes back in the same response for free.
   */
  fetchesPerParticipant(sport: SportCode): boolean;
}

/** A team or athlete the vendor lists for a sport, in the shape of a participants row. */
export type DirectoryEntry = {
  externalId: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  /** `#rrggbb` lowercase, or null. */
  primaryColor: string | null;
};

/** A listed row the provider left out on purpose (a placeholder, a duplicate), for the log. */
export type DirectorySkip = { externalId: string; name: string; reason: string };

export type DirectoryRequest = {
  sport: SportCode;
  season: number;
  /** Vendor ids already stored: not returned, and athletes' detail calls are skipped for them. */
  knownExternalIds: ReadonlySet<string>;
  /** Athlete sports only: how many of the best-ranked to list. */
  athleteLimit: number;
};

/** Who exists in a sport, as opposed to how they are doing. */
export interface DirectoryProvider {
  fetchDirectory(
    request: DirectoryRequest,
  ): Promise<Result<{ entries: DirectoryEntry[]; skipped: DirectorySkip[] }, ProviderError>>;
}
