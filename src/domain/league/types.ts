import type { PlayoffScoringMode, ScoreTotals, ScoringRule } from "@/domain/scoring";
import type { ParticipantRecord } from "@/domain/records";
import type { SportCode } from "@/domain/sports/sports";

/**
 * Everything the public pages need, as plain JSON-safe facts (it is stored in Next's data cache,
 * so no Dates or class instances). Repositories produce it; `buildLeagueModel` scores it.
 */
export type LeagueData = {
  season: { id: string; name: string; startsOn: string; endsOn: string } & {
    playoffScoringMode: PlayoffScoringMode;
  };
  sports: SportSeasonData[];
  rules: RuleData[];
  teams: TeamData[];
  results: ResultData[];
  /** Regular-season records, one per participant the vendor has reported on (free agents too). */
  records: RecordData[];
  snapshots: SnapshotData[];
  /** ISO time of the last successful sync, or null when none has finished yet. */
  lastSyncAt: string | null;
};

export type SportSeasonData = {
  code: SportCode;
  /** ISO date the sport's season begins. */
  startsOn: string;
  /** ISO date the sport's scored window closes; null runs to the season's end. */
  endsOn: string | null;
  majorPointsCap: number | null;
  allowsDuplicatePicks: boolean;
};

export type RuleData = { sport: SportCode; code: string; sortOrder: number; rule: ScoringRule };

export type OwnerData = { id: string; displayName: string; avatarUrl: string | null };

export type ParticipantData = {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  primaryColor: string | null;
};

export type PickData = {
  sport: SportCode;
  participant: ParticipantData;
  /**
   * The participant's live score when this team acquired the pick, which the team is not credited
   * for. All zeros for a drafted pick.
   */
  baseline: ScoreTotals;
  /** ISO time the pick arrived by trade; null when drafted. */
  acquiredAt: string | null;
};

/** Why a team stopped holding a participant and froze what it had earned from them. */
export const BANKED_SOURCES = ["trade", "free_agent"] as const;
export type BankedSource = (typeof BANKED_SOURCES)[number];

/**
 * Points a team earned from a participant it has since let go (traded away, or dropped for a free
 * agent), frozen at that moment. The participant is here so the UI can say whose points they were;
 * the source is here so it can say why they left.
 */
export type BankedScoreData = ScoreTotals & {
  sport: SportCode;
  participant: ParticipantData;
  source: BankedSource;
};

export type TeamData = {
  id: string;
  slug: string;
  name: string;
  owner: OwnerData | null;
  picks: PickData[];
  /** Empty until the team's first trade. */
  banked: BankedScoreData[];
};

export type ResultData = {
  participantId: string;
  ruleId: string;
  quantity: number;
  eventLabel: string;
};

/** A display fact beside the results: never scored (ADR-001). */
export type RecordData = ParticipantRecord & { participantId: string };

export type SnapshotData = { teamId: string; date: string; rank: number; totalPoints: number };
