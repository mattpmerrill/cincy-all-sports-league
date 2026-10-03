import type {
  LeagueData,
  ResultData,
  RuleData,
  SnapshotData,
  SportSeasonData,
} from "@/domain/league";
import type { ScoringRule } from "@/domain/scoring";
import type { DbClient } from "./db-client";
import type { Tables } from "./database.types";
import { createFantasyTeamsRepository } from "./fantasy-teams.repository";
import { toSportCode as sportCode } from "./mappers";
import { fetchAllRows } from "./paginate";
import { createParticipantRecordsRepository } from "./participant-records.repository";

type SeasonRow = Pick<
  Tables<"seasons">,
  "id" | "name" | "starts_on" | "ends_on" | "playoff_scoring_mode"
>;
type RuleRow = Pick<
  Tables<"scoring_rules">,
  | "id"
  | "code"
  | "label"
  | "kind"
  | "points"
  | "rank_from"
  | "rank_to"
  | "is_championship"
  | "sort_order"
  | "sport_id"
>;

export const toSeason = (row: SeasonRow): LeagueData["season"] => ({
  id: row.id,
  name: row.name,
  startsOn: row.starts_on,
  endsOn: row.ends_on,
  playoffScoringMode: row.playoff_scoring_mode,
});

/** Row to domain rule. Rank-band rows must carry both bounds (a DB check guarantees it). */
export function toRuleData(row: RuleRow, sportCodeById: ReadonlyMap<string, string>): RuleData {
  const base = {
    id: row.id,
    label: row.label,
    points: row.points,
    isChampionship: row.is_championship,
  };
  let rule: ScoringRule;
  if (row.kind === "final_rank_band") {
    if (row.rank_from === null || row.rank_to === null) {
      throw new Error(`Rank band rule ${row.code} is missing its bounds`);
    }
    rule = { ...base, kind: row.kind, rankFrom: row.rank_from, rankTo: row.rank_to };
  } else {
    rule = { ...base, kind: row.kind };
  }
  const code = sportCodeById.get(row.sport_id);
  if (!code) throw new Error(`Rule ${row.code} points at an unknown sport`);
  return { sport: sportCode(code), code: row.code, sortOrder: row.sort_order, rule };
}

export type LeagueRepository = ReturnType<typeof createLeagueRepository>;

export function createLeagueRepository(db: DbClient) {
  const teams = createFantasyTeamsRepository(db);
  const records = createParticipantRecordsRepository(db);

  async function getActiveSeason() {
    const { data, error } = await db
      .from("seasons")
      .select("id, name, starts_on, ends_on, playoff_scoring_mode")
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    return data ? toSeason(data) : null;
  }

  async function listSeasonSports(seasonId: string): Promise<SportSeasonData[]> {
    const { data, error } = await db
      .from("season_sports")
      .select("starts_on, ends_on, major_points_cap, sports(code, allows_duplicate_picks)")
      .eq("season_id", seasonId);
    if (error) throw error;
    return data.flatMap((row) => {
      const sport = row.sports;
      if (!sport) return [];
      return [
        {
          code: sportCode(sport.code),
          startsOn: row.starts_on,
          endsOn: row.ends_on,
          majorPointsCap: row.major_points_cap,
          allowsDuplicatePicks: sport.allows_duplicate_picks,
        },
      ];
    });
  }

  // scoring_rules reaches sports only through season_sports (composite FK), so PostgREST can't
  // embed it; look the codes up instead.
  async function listRules(seasonId: string): Promise<RuleData[]> {
    const { data: sportRows, error: sportsError } = await db.from("sports").select("id, code");
    if (sportsError) throw sportsError;
    const sportCodeById = new Map(sportRows.map((s) => [s.id, s.code]));
    const rows = await fetchAllRows<RuleRow>((from, to) =>
      db
        .from("scoring_rules")
        .select(
          "id, code, label, kind, points, rank_from, rank_to, is_championship, sort_order, sport_id",
        )
        .eq("season_id", seasonId)
        .order("id")
        .range(from, to),
    );
    return rows.map((row) => toRuleData(row, sportCodeById));
  }

  async function listResults(seasonId: string): Promise<ResultData[]> {
    const rows = await fetchAllRows((from, to) =>
      db
        .from("participant_results")
        .select("participant_id, scoring_rule_id, quantity, event_label")
        .eq("season_id", seasonId)
        .order("id")
        .range(from, to),
    );
    return rows.map((r) => ({
      participantId: r.participant_id,
      ruleId: r.scoring_rule_id,
      quantity: r.quantity,
      eventLabel: r.event_label,
    }));
  }

  /** Newest 60 rows: three days of a 20-team league, enough to find "the last day before today". */
  async function listRecentSnapshots(seasonId: string): Promise<SnapshotData[]> {
    const { data, error } = await db
      .from("standings_snapshots")
      .select("fantasy_team_id, snapshot_date, rank, total_points")
      .eq("season_id", seasonId)
      .order("snapshot_date", { ascending: false })
      .limit(60);
    if (error) throw error;
    return data.map((r) => ({
      teamId: r.fantasy_team_id,
      date: r.snapshot_date,
      rank: r.rank,
      totalPoints: r.total_points,
    }));
  }

  /** Finish time of the newest successful sync: what "Updated 12 min ago" reports. */
  async function getLastSyncAt(): Promise<string | null> {
    const { data, error } = await db
      .from("sync_runs")
      .select("finished_at")
      .eq("status", "succeeded")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.finished_at ?? null;
  }

  return {
    getActiveSeason,
    listSeasonSports,
    listRules,
    listResults,
    listRecentSnapshots,
    getLastSyncAt,

    /** The whole public read model in one round of parallel queries; null before a season exists. */
    async load(): Promise<LeagueData | null> {
      const season = await getActiveSeason();
      if (!season) return null;
      const [sports, rules, leagueTeams, results, recordRows, snapshots, lastSyncAt] =
        await Promise.all([
          listSeasonSports(season.id),
          listRules(season.id),
          teams.listWithPicks(season.id),
          listResults(season.id),
          records.listForSeason(season.id),
          listRecentSnapshots(season.id),
          getLastSyncAt(),
        ]);
      return {
        season,
        sports,
        rules,
        teams: leagueTeams,
        results,
        records: recordRows,
        snapshots,
        lastSyncAt,
      };
    },
  };
}
