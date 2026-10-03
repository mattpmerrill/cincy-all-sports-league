import { addDays, easternDateOf } from "@/domain/calendar";
import { isGameSport, type GameStatus } from "@/domain/schedule";
import { SPORTS, type SportCode } from "@/domain/sports/sports";
import { err, ok, type Result } from "@/lib/result";
import type { ScheduledGame, ScheduledGameSide } from "./facts";
import { getJson, mapWithConcurrency, type EspnClientOptions, type EspnError } from "./http";
import { isPerTeamRecordsSport } from "./records";
import { gamesScoreboardSchema, gamesTeamScheduleSchema, type GameEvent } from "./schemas";
import { espnUrls } from "./urls";

/** Inclusive Eastern calendar days, `YYYY-MM-DD`. */
export type GamesWindow = { from: string; to: string };

export type ScheduledGamesRequest = {
  window: GamesWindow;
  espnSeason: number;
  /** Required for college sports, which have no league-wide feed: only these teams' games load. */
  espnTeamIds?: readonly string[];
};

export type ScheduledGamesFeed = {
  /** Games starting inside the window, each event once. */
  games: ScheduledGame[];
  /** ESPN calls made, and how many of them failed after retries. */
  requests: number;
  failedRequests: number;
  /** Events dropped because they lacked a home or away side or a readable start time. */
  skipped: number;
};

const FETCH_CONCURRENCY = 6;

// Column lengths are generous; clipping keeps a freak ESPN string from failing a whole upsert.
const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);
const firstText = (...values: (string | undefined)[]): string | undefined =>
  values.map((v) => v?.trim()).find((v) => v !== undefined && v !== "");

type StatusType = GameEvent["competitions"][number]["status"]["type"];

/**
 * ESPN's status to ours. The name decides first because a postponed or canceled game still has
 * state "post"; after that the state does: pre is scheduled, in is being played, post is over.
 * A delay or suspension counts as in progress (the game is on, just paused). A "post" game ESPN
 * does not call completed is shown as postponed rather than as a result nobody can read.
 */
export function mapGameStatus(type: StatusType): GameStatus {
  const name = (type.name ?? "").toUpperCase();
  if (name.includes("POSTPONED")) return "postponed";
  if (name.includes("CANCEL")) return "canceled";
  if (name.includes("DELAY") || name.includes("SUSPEND")) return "in_progress";
  switch (type.state) {
    case "pre":
      return "scheduled";
    case "in":
      return "in_progress";
    case "post":
      return type.completed ? "final" : "postponed";
    default:
      return type.completed ? "final" : "scheduled";
  }
}

function sideOf(
  competitor: GameEvent["competitions"][number]["competitors"][number],
  status: GameStatus,
): ScheduledGameSide {
  const team = competitor.team;
  const name =
    firstText(team.displayName, [team.location, team.name].join(" "), team.shortDisplayName) ??
    team.abbreviation ??
    team.id;
  const started = status === "in_progress" || status === "final";
  return {
    espnTeamId: team.id,
    name: clip(name, 120),
    shortName: clip(firstText(team.abbreviation, team.shortDisplayName, name) ?? name, 40),
    // ESPN sends "0" and winner=false for a game that has not started; neither is a result.
    score: started ? (competitor.score ?? null) : null,
    winner: status === "final" ? (competitor.winner ?? null) : null,
  };
}

/**
 * One ESPN event as a game, or null when it cannot be one: no competition, no home and away
 * pair, or no readable start. Pure, so the quirks are covered by fixtures.
 */
export function gameFromEvent(event: GameEvent): ScheduledGame | null {
  const competition = event.competitions[0];
  if (!competition) return null;

  const home = competition.competitors.find((c) => c.homeAway === "home");
  const away = competition.competitors.find((c) => c.homeAway === "away");
  if (!home || !away || home.team.id === away.team.id) return null;

  const startsAt = new Date(competition.date ?? event.date ?? "");
  if (Number.isNaN(startsAt.getTime())) return null;

  const type = competition.status.type;
  const status = mapGameStatus(type);
  const detail = type.shortDetail?.trim();
  const headline = competition.notes?.map((n) => n.headline?.trim()).find((h) => h);

  return {
    espnEventId: event.id,
    startsAt,
    timeTbd: competition.timeValid === false || detail?.toUpperCase() === "TBD",
    status,
    // Before the game the short detail is just the date again, which the page already shows.
    statusDetail: status === "scheduled" || !detail ? null : clip(detail, 80),
    note: headline ? clip(headline, 160) : null,
    neutralSite: competition.neutralSite ?? false,
    home: sideOf(home, status),
    away: sideOf(away, status),
  };
}

const inWindow = (game: ScheduledGame, window: GamesWindow): boolean => {
  const day = easternDateOf(game.startsAt);
  return day >= window.from && day <= window.to;
};

/** ESPN's season type for preseason (exhibition) games. */
const PRESEASON = 1;

/**
 * True for an exhibition game. The refresh asks about a sport up to two weeks before its season
 * starts, which is exactly when the scoreboard is full of preseason games (NBA in October, MLB
 * spring training in March); they decide nothing and would show on the Week page, even as fake
 * showdowns. An event without a season type is kept: only an explicit preseason is dropped.
 */
export const isPreseason = (event: GameEvent): boolean =>
  (event.season?.type ?? event.seasonType?.type) === PRESEASON;

/**
 * Events to games inside the window, each ESPN event once (adjacent days can repeat one).
 * Preseason games are left out, and are not counted as `skipped`, which is for events we could
 * not read.
 */
export function gamesFromEvents(
  events: readonly GameEvent[],
  window: GamesWindow,
): { games: ScheduledGame[]; skipped: number } {
  const seen = new Set<string>();
  const games: ScheduledGame[] = [];
  let skipped = 0;
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    if (isPreseason(event)) continue;
    const game = gameFromEvent(event);
    if (!game) skipped += 1;
    else if (inWindow(game, window)) games.push(game);
  }
  return { games, skipped };
}

type EventsResult = Result<GameEvent[], EspnError>;

function summarize(
  results: readonly EventsResult[],
  window: GamesWindow,
): Result<ScheduledGamesFeed, EspnError> {
  const failures = results.filter((r) => !r.ok);
  const firstFailure = failures[0];
  // Only a total outage is an error. A partial one still has games worth storing, and the next
  // run fills the gap, because everything downstream is an idempotent upsert.
  if (firstFailure && !firstFailure.ok && failures.length === results.length) {
    return { ok: false, error: firstFailure.error };
  }
  const events = results.flatMap((r) => (r.ok ? r.value : []));
  return ok({
    ...gamesFromEvents(events, window),
    requests: results.length,
    failedRequests: failures.length,
  });
}

/**
 * Pro leagues: the league-wide scoreboard, one call per day. It includes the postseason, which
 * has no schedule of its own until the previous round ends.
 *
 * The day before the window is fetched too. ESPN files a late-night game under the scoreboard
 * day it assigns itself, which is not guaranteed to be our Eastern calendar day, and one extra
 * call means a game just after Eastern midnight is never missed. Games outside the window are
 * dropped by their Eastern start day afterwards. (`dev/smoke.ts` prints where late games land.)
 */
async function fetchScoreboardGames(
  sportCode: SportCode,
  window: GamesWindow,
  options: EspnClientOptions,
): Promise<Result<ScheduledGamesFeed, EspnError>> {
  const sport = SPORTS[sportCode];
  const days: string[] = [];
  for (let day = addDays(window.from, -1); day <= window.to; day = addDays(day, 1)) {
    days.push(day);
  }
  const results = await mapWithConcurrency(days, FETCH_CONCURRENCY, async (day) => {
    const page = await getJson(espnUrls.scoreboardDay(sport, day), gamesScoreboardSchema, options);
    return page.ok ? ok(page.value.events) : page;
  });
  return summarize(results, window);
}

/**
 * College sports: each requested team's own schedule, one call per team, which covers its whole
 * season and postseason in one response. There is no usable league-wide college feed (hundreds
 * of teams, most of them unheld), so only the held teams' ids are asked for. A game between two
 * held teams comes back from both calls and is kept once.
 */
async function fetchTeamScheduleGames(
  sportCode: SportCode,
  request: ScheduledGamesRequest,
  teamIds: readonly string[],
  options: EspnClientOptions,
): Promise<Result<ScheduledGamesFeed, EspnError>> {
  const sport = SPORTS[sportCode];
  const results = await mapWithConcurrency(teamIds, FETCH_CONCURRENCY, async (teamId) => {
    const schedule = await getJson(
      espnUrls.teamSchedule(sport, teamId, request.espnSeason),
      gamesTeamScheduleSchema,
      options,
    );
    return schedule.ok ? ok(schedule.value.events) : schedule;
  });
  return summarize(results, request.window);
}

/**
 * Games for a team sport inside a window of Eastern days, as vendor-neutral facts. Pro sports
 * read the scoreboard and ignore `espnTeamIds`; college sports need them.
 */
export async function fetchScheduledGames(
  sportCode: SportCode,
  request: ScheduledGamesRequest,
  options: EspnClientOptions = {},
): Promise<Result<ScheduledGamesFeed, EspnError>> {
  if (!isGameSport(sportCode)) {
    return err("espn_unsupported", `${sportCode} has no games (it is not a team sport)`);
  }
  if (!isPerTeamRecordsSport(sportCode)) {
    return fetchScoreboardGames(sportCode, request.window, options);
  }
  const teamIds = [...new Set(request.espnTeamIds ?? [])];
  if (teamIds.length === 0) {
    return err("espn_unsupported", `${sportCode} games need espnTeamIds (no league-wide fetch)`);
  }
  return fetchTeamScheduleGames(sportCode, request, teamIds, options);
}
