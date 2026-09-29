import type { PlayoffScoringMode, ScoringRule } from "@/domain/scoring";
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
  snapshots: SnapshotData[];
  /** ISO time of the last successful sync, or null when none has finished yet. */
  lastSyncAt: string | null;
};

export type SportSeasonData = {
  code: SportCode;
  /** ISO date the sport's season begins. */
  startsOn: string;
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

export type PickData = { sport: SportCode; participant: ParticipantData };

export type TeamData = {
  id: string;
  slug: string;
  name: string;
  owner: OwnerData | null;
  picks: PickData[];
};

export type ResultData = {
  participantId: string;
  ruleId: string;
  quantity: number;
  eventLabel: string;
};

export type SnapshotData = { teamId: string; date: string; rank: number; totalPoints: number };
