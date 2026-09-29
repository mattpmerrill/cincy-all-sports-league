import type { AppError, Result } from "@/lib/result";
import type { SportCode } from "@/domain/sports/sports";

/**
 * What sync needs from a data vendor, in league vocabulary. Nothing here names ESPN: `externalId`
 * is whatever id the vendor uses, and it is stored in `participants.espn_id`.
 */
export type RecordFact = { externalId: string; wins: number; ties: number };
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
}
