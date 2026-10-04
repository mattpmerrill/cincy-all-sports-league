import { easternDateOf, addDays, weekDays } from "@/domain/calendar";
import type { SportCode } from "@/domain/sports/sports";
import { SPORT_CODES } from "@/domain/sports/sports";
import type { Game, GameSideKey } from "./types";

export type SlateOwner = { id: string; displayName: string; avatarUrl: string | null };

/** A fantasy team and the participants it holds right now, which is all a slate needs to know. */
export type SlateTeam = {
  id: string;
  slug: string;
  name: string;
  owner: SlateOwner | null;
  picks: readonly { sport: SportCode; participantId: string }[];
};

/** A fantasy team with a stake in a game: it holds one of the two sides. */
export type Stake = {
  teamId: string;
  slug: string;
  name: string;
  owner: SlateOwner | null;
};

export type SlateGame = Game & {
  /** The Eastern calendar day the game starts on. */
  day: string;
  /** Who holds each side. In a sport that allows duplicate picks (the WNBA) a side can have several. */
  stakes: Record<GameSideKey, Stake[]>;
  /**
   * Two different fantasy teams hold opposite sides: a head-to-head. The first taste of weekly
   * matchups.
   */
  isShowdown: boolean;
};

export type SlateDay = { date: string; games: SlateGame[] };

/** How many games a fantasy team's picks play this week, zero included. */
export type TeamGameCount = { team: Stake; games: number };

export type WeekSlate = {
  weekStart: string;
  weekEnd: string;
  /** Always seven, Monday first, empty days included so the page can say "No games". */
  days: SlateDay[];
  gameCount: number;
  showdownCount: number;
  /** Every fantasy team, busiest first then by name. */
  teams: TeamGameCount[];
};

const stakeOf = (team: SlateTeam): Stake => ({
  teamId: team.id,
  slug: team.slug,
  name: team.name,
  owner: team.owner,
});

const byTeamName = (a: Stake, b: Stake) =>
  a.name.localeCompare(b.name) || a.teamId.localeCompare(b.teamId);

const sportOrder = (sport: SportCode) => SPORT_CODES.indexOf(sport);

/**
 * The week's games that matter to the league: for each of the seven Eastern days, the games where
 * at least one fantasy team holds a side (by its current picks), in start order, with who holds
 * what. Pure, so the same function serves the Week page, the team page and, later, weekly
 * head-to-head matchups.
 *
 * Games are placed by the Eastern day they start on, so a 10:30 pm tip-off stays on its own day
 * although UTC has rolled over. Games outside the week, unheld games and repeats of one game are
 * dropped. A team that holds both sides of a game cannot happen (one pick per sport), and if the
 * data ever said so it would count once and never be its own showdown.
 */
export function buildWeekSlate(input: {
  weekStart: string;
  games: readonly Game[];
  teams: readonly SlateTeam[];
}): WeekSlate {
  const { weekStart, teams } = input;
  const dates = weekDays(weekStart);

  const holders = new Map<string, Stake[]>();
  for (const team of teams) {
    for (const pick of team.picks) {
      const key = `${pick.sport}:${pick.participantId}`;
      holders.set(key, [...(holders.get(key) ?? []), stakeOf(team)]);
    }
  }
  const holdersOf = (game: Game, side: GameSideKey): Stake[] => {
    const participantId = game[side].participantId;
    if (participantId === null) return [];
    return [...(holders.get(`${game.sport}:${participantId}`) ?? [])].sort(byTeamName);
  };

  const seen = new Set<string>();
  const byDay = new Map<string, SlateGame[]>(dates.map((date) => [date, []]));
  const counts = new Map<string, number>(teams.map((team) => [team.id, 0]));
  let showdownCount = 0;

  for (const game of input.games) {
    const naturalKey = `${game.sport}:${game.externalId}`;
    if (seen.has(naturalKey)) continue;
    seen.add(naturalKey);

    const day = easternDateOf(new Date(game.startsAt));
    const bucket = byDay.get(day);
    if (!bucket) continue;

    const stakes = { home: holdersOf(game, "home"), away: holdersOf(game, "away") };
    if (stakes.home.length === 0 && stakes.away.length === 0) continue;

    const isShowdown = stakes.home.some((h) => stakes.away.some((a) => a.teamId !== h.teamId));
    if (isShowdown) showdownCount += 1;

    const involved = new Set([...stakes.home, ...stakes.away].map((s) => s.teamId));
    for (const teamId of involved) counts.set(teamId, (counts.get(teamId) ?? 0) + 1);

    bucket.push({ ...game, day, stakes, isShowdown });
  }

  const days = dates.map((date) => ({
    date,
    games: (byDay.get(date) ?? []).sort(
      (a, b) =>
        a.startsAt.localeCompare(b.startsAt) ||
        sportOrder(a.sport) - sportOrder(b.sport) ||
        a.externalId.localeCompare(b.externalId),
    ),
  }));

  return {
    weekStart,
    weekEnd: addDays(weekStart, 6),
    days,
    gameCount: days.reduce((sum, day) => sum + day.games.length, 0),
    showdownCount,
    teams: teams
      .map((team) => ({ team: stakeOf(team), games: counts.get(team.id) ?? 0 }))
      .sort((a, b) => b.games - a.games || byTeamName(a.team, b.team)),
  };
}

/** Which side of a game a fantasy team plays, or null when it has no stake in it. */
export function teamSide(game: SlateGame, teamId: string): GameSideKey | null {
  if (game.stakes.home.some((s) => s.teamId === teamId)) return "home";
  if (game.stakes.away.some((s) => s.teamId === teamId)) return "away";
  return null;
}

/** One fantasy team's games for the week in start order: what the team page lists. */
export function teamGames(slate: WeekSlate, teamId: string): SlateGame[] {
  return slate.days.flatMap((day) => day.games.filter((g) => teamSide(g, teamId) !== null));
}

/**
 * The same week narrowed to the games any of the given fantasy teams has a stake in (one team for
 * the team filter, two for a matchup). The per-team strip keeps every team on purpose: filtering
 * the list should not hide how the other teams' weeks look.
 */
export function filterSlateToTeams(slate: WeekSlate, teamIds: readonly string[]): WeekSlate {
  const days = slate.days.map((day) => ({
    date: day.date,
    games: day.games.filter((g) => teamIds.some((id) => teamSide(g, id) !== null)),
  }));
  const games = days.flatMap((day) => day.games);
  return {
    ...slate,
    days,
    gameCount: games.length,
    showdownCount: games.filter((g) => g.isShowdown).length,
  };
}
