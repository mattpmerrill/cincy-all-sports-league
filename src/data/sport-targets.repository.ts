import type { ScoringRuleKind } from "@/domain/scoring";
import { isSportCode, type SportCode } from "@/domain/sports/sports";
import type { DbClient } from "./db-client";
import { fetchAllRows } from "./paginate";

/** A scoring rule as sync and the admin editor need it: enough to map a fact to a rule. */
export type TargetRule = {
  id: string;
  code: string;
  label: string;
  kind: ScoringRuleKind;
  points: number;
  rankFrom: number | null;
  rankTo: number | null;
  sortOrder: number;
};

export type TargetParticipant = {
  id: string;
  name: string;
  shortName: string;
  /** The vendor's id; null when ESPN has no record (an amateur golfer). */
  externalId: string | null;
};

/**
 * One sport in the active season: its window, its rules, the participants somebody picked and,
 * separately, the ones nobody holds.
 */
export type SportTarget = {
  seasonId: string;
  sportId: string;
  sport: SportCode;
  startsOn: string;
  /** Last day sync runs for this sport: its own end date, else the season's. */
  endsOn: string;
  espnSeason: number;
  rules: TargetRule[];
  /** Held only: the admin results editor lists exactly these, so free agents stay out of it. */
  participants: TargetParticipant[];
  /**
   * Every other participant in the sport (the free-agent pool). Always filled by this repository;
   * optional in the type only so older hand-built targets (the results editor's tests) still fit.
   */
  freeAgents?: TargetParticipant[];
};

export type SportTargetsRepository = ReturnType<typeof createSportTargetsRepository>;

export function createSportTargetsRepository(db: DbClient) {
  return {
    /** Every sport of the active season (or just `only`), in one round of parallel reads. */
    async listSportTargets(only?: readonly SportCode[]): Promise<SportTarget[]> {
      const { data: season, error: seasonError } = await db
        .from("seasons")
        .select("id, ends_on")
        .eq("is_active", true)
        .maybeSingle();
      if (seasonError) throw seasonError;
      if (!season) return [];

      const [seasonSports, rules, picks] = await Promise.all([
        db
          .from("season_sports")
          .select("starts_on, ends_on, espn_season, sports(id, code)")
          .eq("season_id", season.id),
        fetchAllRows((from, to) =>
          db
            .from("scoring_rules")
            .select("id, sport_id, code, label, kind, points, rank_from, rank_to, sort_order")
            .eq("season_id", season.id)
            .order("id")
            .range(from, to),
        ),
        fetchAllRows((from, to) =>
          db
            .from("picks")
            .select(
              "id, sport_id, participants(id, name, short_name, espn_id), fantasy_teams!inner(season_id)",
            )
            .eq("fantasy_teams.season_id", season.id)
            .order("id")
            .range(from, to),
        ),
      ]);
      if (seasonSports.error) throw seasonSports.error;

      // Read after season_sports so a one-sport run (the daily pool refresh, "Sync now") does not
      // pull all ~1,450 rows.
      const wantedSportIds = seasonSports.data.flatMap((row) =>
        row.sports && (!only || (isSportCode(row.sports.code) && only.includes(row.sports.code)))
          ? [row.sports.id]
          : [],
      );
      const pool =
        wantedSportIds.length === 0
          ? []
          : await fetchAllRows((from, to) =>
              db
                .from("participants")
                .select("id, sport_id, name, short_name, espn_id")
                .in("sport_id", wantedSportIds)
                .order("id")
                .range(from, to),
            );

      return seasonSports.data.flatMap((row) => {
        const sport = row.sports;
        if (!sport || !isSportCode(sport.code)) return [];
        if (only && !only.includes(sport.code)) return [];

        // A WNBA team can be picked twice; one participant appears once.
        const seen = new Set<string>();
        const participants: TargetParticipant[] = [];
        for (const pick of picks) {
          const p = pick.participants;
          if (pick.sport_id !== sport.id || !p || seen.has(p.id)) continue;
          seen.add(p.id);
          participants.push({
            id: p.id,
            name: p.name,
            shortName: p.short_name,
            externalId: p.espn_id,
          });
        }
        participants.sort((a, b) => a.name.localeCompare(b.name));

        const freeAgents = pool
          .filter((p) => p.sport_id === sport.id && !seen.has(p.id))
          .map((p) => ({ id: p.id, name: p.name, shortName: p.short_name, externalId: p.espn_id }))
          .sort((a, b) => a.name.localeCompare(b.name));

        return [
          {
            seasonId: season.id,
            sportId: sport.id,
            sport: sport.code,
            startsOn: row.starts_on,
            endsOn: row.ends_on ?? season.ends_on,
            espnSeason: row.espn_season,
            rules: rules
              .filter((r) => r.sport_id === sport.id)
              .map((r) => ({
                id: r.id,
                code: r.code,
                label: r.label,
                kind: r.kind,
                points: r.points,
                rankFrom: r.rank_from,
                rankTo: r.rank_to,
                sortOrder: r.sort_order,
              }))
              .sort((a, b) => a.sortOrder - b.sortOrder),
            participants,
            freeAgents,
          },
        ];
      });
    },
  };
}
