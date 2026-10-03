import { err, ok, type Result } from "@/lib/result";
import { SPORTS, type Sport, type SportCode } from "@/domain/sports/sports";
import type { TeamRecord } from "./facts";
import { getJson, mapWithConcurrency, type EspnClientOptions, type EspnError } from "./http";
import { standingsSchema, teamScheduleSchema, type StandingsNode } from "./schemas";
import { espnUrls } from "./urls";

export type TeamRecordsOptions = EspnClientOptions & {
  /** Only return these teams. Required for college sports, where we never fetch whole leagues. */
  espnTeamIds?: readonly string[];
};

const COLLEGE_SPORTS: ReadonlySet<SportCode> = new Set(["ncaaf", "ncaab", "ncaasb"]);
/**
 * True for sports whose records cost one ESPN call per team (college), so a caller must name the
 * teams it wants. The one owner of that knowledge: sync uses it to decide what a regular run can
 * afford to include.
 */
export const isPerTeamRecordsSport = (sport: SportCode): boolean => COLLEGE_SPORTS.has(sport);

const PRO_STANDINGS_SPORTS: ReadonlySet<SportCode> = new Set([
  "nfl",
  "nba",
  "nhl",
  "mlb",
  "mls",
  "wnba",
]);
const TEAM_FETCH_CONCURRENCY = 6;
const REGULAR_SEASON = 2;

/**
 * Regular-season record per team.
 *
 * Pro leagues: one standings call, which already excludes the postseason and carries ties
 * (NFL) and draws (MLS, exposed as `ties`). NHL overtime losses are kept apart from `losses`
 * (`otLosses`, ESPN's own split) so the NHL record can read W-L-OTL; scoring only uses wins.
 *
 * College: a team schedule per requested id, counted game by game. See {@link recordFromSchedule}.
 */
export async function fetchTeamRecords(
  sportCode: SportCode,
  espnSeason: number,
  options: TeamRecordsOptions = {},
): Promise<Result<TeamRecord[], EspnError>> {
  const sport = SPORTS[sportCode];
  const wanted = options.espnTeamIds ? new Set(options.espnTeamIds) : null;

  if (PRO_STANDINGS_SPORTS.has(sportCode)) {
    const standings = await getJson(
      espnUrls.standings(sport, espnSeason),
      standingsSchema,
      options,
    );
    if (!standings.ok) return standings;
    return ok(
      recordsFromStandings(standings.value).filter((r) => !wanted || wanted.has(r.espnTeamId)),
    );
  }

  if (COLLEGE_SPORTS.has(sportCode)) {
    if (!options.espnTeamIds || options.espnTeamIds.length === 0) {
      return err(
        "espn_unsupported",
        `${sportCode} records need espnTeamIds (no league-wide fetch)`,
      );
    }
    return recordsFromTeamSchedules(sport, espnSeason, [...new Set(options.espnTeamIds)], options);
  }

  return err("espn_unsupported", `${sportCode} has no team records`);
}

export function recordsFromStandings(root: StandingsNode): TeamRecord[] {
  const byTeam = new Map<string, TeamRecord>();
  const walk = (node: StandingsNode) => {
    for (const entry of node.standings?.entries ?? []) {
      const stat = (name: string) => entry.stats.find((s) => s.name === name)?.value ?? 0;
      byTeam.set(entry.team.id, {
        espnTeamId: entry.team.id,
        wins: stat("wins"),
        losses: stat("losses"),
        ties: stat("ties"),
        otLosses: stat("otLosses"),
      });
    }
    node.children?.forEach(walk);
  };
  walk(root);
  return [...byTeam.values()];
}

async function recordsFromTeamSchedules(
  sport: Sport,
  espnSeason: number,
  teamIds: string[],
  options: EspnClientOptions,
): Promise<Result<TeamRecord[], EspnError>> {
  const results = await mapWithConcurrency(teamIds, TEAM_FETCH_CONCURRENCY, async (teamId) => {
    const schedule = await getJson(
      espnUrls.teamSchedule(sport, teamId, espnSeason),
      teamScheduleSchema,
      options,
    );
    return schedule.ok ? ok(recordFromSchedule(schedule.value, teamId)) : schedule;
  });

  const records: TeamRecord[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    records.push(result.value);
  }
  return ok(records);
}

type Schedule = ReturnType<typeof teamScheduleSchema.parse>;

/**
 * College basketball wins = ESPN "regular season" games, which INCLUDES conference tournaments
 * and EXCLUDES the NCAA Tournament, NIT and Crown.
 *
 * ESPN files conference-tournament games under season type 2 (competition type "tournament",
 * headline like "Big 12 Tournament - Semifinal"), while the NCAA Tournament and other
 * postseason events are season type 3. The team schedule returns type 2 by default, but we
 * filter on `seasonType` anyway so a mixed response can never leak postseason games in.
 * The same rule covers football (conference title games count, bowls and the CFP do not)
 * and softball (SEC tournament counts, regionals onward do not).
 *
 * Only completed games count: postponed and future games have `completed: false`.
 */
export function recordFromSchedule(schedule: Schedule, espnTeamId: string): TeamRecord {
  // A schedule has no overtime-loss concept (college has none), so `otLosses` stays 0.
  const record: TeamRecord = { espnTeamId, wins: 0, losses: 0, ties: 0, otLosses: 0 };
  for (const event of schedule.events) {
    if (event.seasonType.type !== REGULAR_SEASON) continue;
    for (const competition of event.competitions) {
      if (!competition.status.type.completed) continue;
      const me = competition.competitors.find((c) => c.team.id === espnTeamId);
      const them = competition.competitors.find((c) => c.team.id !== espnTeamId);
      if (!me || !them) continue;

      const outcome = gameOutcome(me, them);
      if (outcome === "win") record.wins += 1;
      else if (outcome === "loss") record.losses += 1;
      else if (outcome === "tie") record.ties += 1;
    }
  }
  return record;
}

type Side = Schedule["events"][number]["competitions"][number]["competitors"][number];

// Trust ESPN's winner flag first; fall back to scores so a missing flag never drops a game.
// A completed game with neither flag and equal scores is a genuine tie.
function gameOutcome(me: Side, them: Side): "win" | "loss" | "tie" | null {
  if (me.winner) return "win";
  if (them.winner) return "loss";
  if (me.score == null || them.score == null) return null;
  if (me.score === them.score) return "tie";
  return me.score > them.score ? "win" : "loss";
}
