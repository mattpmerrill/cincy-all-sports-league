import {
  clampWeekStart,
  easternDateOf,
  easternWeekStart,
  formatDayHeading,
  formatWeekRange,
  seasonWeeks,
  stepWeek,
  weekInstants,
  weekdayShort,
} from "@/domain/calendar";
import type { LeagueData, TeamData } from "@/domain/league";
import {
  buildWeekSlate,
  describeGame,
  describeStatus,
  filterSlateToTeam,
  opposite,
  teamGames,
  teamSide,
  type Game,
  type GameLine,
  type GameSide,
  type GameSideKey,
  type SlateGame,
  type SlateTeam,
  type TeamGameCount,
} from "@/domain/schedule";
import { SPORTS, type SportCode } from "@/domain/sports/sports";

/** The cached league data, which carries every team's current picks and the season's dates. */
export type LeagueSource = () => Promise<LeagueData | null>;
/** The cached games of a season between two instants (ISO strings, `[from, to)`). */
export type GamesSource = (seasonId: string, fromIso: string, toIso: string) => Promise<Game[]>;

export type ScheduleDeps = {
  league: LeagueSource;
  games: GamesSource;
  now?: () => Date;
};

/** A game as the Week page shows it: the slate's facts plus the neutral status line. */
export type GameView = SlateGame & { line: GameLine };

export type DayView = {
  date: string;
  heading: string;
  isToday: boolean;
  games: GameView[];
};

export type TeamOption = { slug: string; name: string };

/**
 * Why a week has nothing to list, so the page can say the right thing:
 * - `not_loaded`: no games are stored for the week at all (before the first refresh, or a week
 *   the leagues are not playing).
 * - `no_games`: games exist, but none of them involve a pick.
 * - `team_idle`: the chosen team's picks have no game this week.
 */
export type WeekEmpty = "not_loaded" | "no_games" | "team_idle";

export type WeekPage = {
  seasonName: string;
  weekStart: string;
  rangeLabel: string;
  isCurrentWeek: boolean;
  /** The current week's Monday (inside the season), for the "This week" link. */
  currentWeek: string;
  /** Null at the first and last week of the season. */
  prevWeek: string | null;
  nextWeek: string | null;
  days: DayView[];
  /** Games shown, after any team filter. */
  gameCount: number;
  showdownCount: number;
  /** Every team's game count for the week, whatever the filter. */
  teams: TeamGameCount[];
  teamOptions: TeamOption[];
  selectedTeam: TeamOption | null;
  /** The signed-in viewer's own team, for the "My team" shortcut. */
  myTeam: TeamOption | null;
  empty: WeekEmpty | null;
};

/** One game in a team's week, from that team's side. */
export type TeamWeekGame = {
  id: string;
  sport: SportCode;
  sportLabel: string;
  /** "Sun": the Eastern weekday the game is on. */
  day: string;
  side: GameSideKey;
  /** "@" when the team travels, "vs" at home or on a neutral field. */
  connector: "vs" | "@";
  opponent: GameSide;
  neutralSite: boolean;
  isShowdown: boolean;
  /** The result, the live score or the start time, as the team's pick sees it. */
  result: GameLine;
};

export type TeamWeek = {
  teamName: string;
  slug: string;
  weekStart: string;
  rangeLabel: string;
  games: TeamWeekGame[];
};

const slateTeamOf = (team: TeamData): SlateTeam => ({
  id: team.id,
  slug: team.slug,
  name: team.name,
  owner: team.owner,
  picks: team.picks.map((pick) => ({ sport: pick.sport, participantId: pick.participant.id })),
});

export type ScheduleService = ReturnType<typeof createScheduleService>;

export function createScheduleService(deps: ScheduleDeps) {
  const now = deps.now ?? (() => new Date());

  /** The slate for a week of the active season, or null before a season exists. */
  async function loadSlate(requestedWeek: string | undefined) {
    const league = await deps.league();
    if (!league) return null;

    const today = easternDateOf(now());
    const { startsOn, endsOn } = league.season;
    const currentWeek = clampWeekStart(easternWeekStart(now()), startsOn, endsOn);
    const weekStart = clampWeekStart(requestedWeek ?? currentWeek, startsOn, endsOn);

    const { from, to } = weekInstants(weekStart);
    const games = await deps.games(league.season.id, from.toISOString(), to.toISOString());
    const teams = league.teams.map(slateTeamOf);
    const slate = buildWeekSlate({ weekStart, games, teams });
    return { league, today, currentWeek, weekStart, storedGames: games.length, slate, teams };
  }

  return {
    /**
     * The Week page: a week's games for the picks in play. An unusable `weekStart` (outside the
     * season) is pulled to the nearest week the season covers; an unknown `teamSlug` shows all
     * teams. Null before a season exists.
     */
    async getWeek(input: {
      weekStart?: string;
      teamSlug?: string;
      /** The signed-in user, for the "My team" shortcut. */
      viewerId?: string | null;
    }): Promise<WeekPage | null> {
      const loaded = await loadSlate(input.weekStart);
      if (!loaded) return null;
      const { league, today, currentWeek, weekStart, slate } = loaded;

      const teamOptions: TeamOption[] = league.teams
        .map((t) => ({ slug: t.slug, name: t.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const selected = league.teams.find((t) => t.slug === input.teamSlug) ?? null;
      const selectedTeam = selected ? { slug: selected.slug, name: selected.name } : null;
      const mine = input.viewerId
        ? league.teams.find((t) => t.owner?.id === input.viewerId)
        : undefined;

      const shown = selected ? filterSlateToTeam(slate, selected.id) : slate;
      const days = shown.days.map((day): DayView => ({
        date: day.date,
        heading: formatDayHeading(day.date),
        isToday: day.date === today,
        games: day.games.map((game) => ({ ...game, line: describeStatus(game) })),
      }));

      const { first, last } = seasonWeeks(league.season.startsOn, league.season.endsOn);

      return {
        seasonName: league.season.name,
        weekStart,
        rangeLabel: formatWeekRange(weekStart),
        isCurrentWeek: weekStart === currentWeek,
        currentWeek,
        prevWeek: weekStart > first ? stepWeek(weekStart, -1) : null,
        nextWeek: weekStart < last ? stepWeek(weekStart, 1) : null,
        days,
        gameCount: shown.gameCount,
        showdownCount: shown.showdownCount,
        teams: slate.teams,
        teamOptions,
        selectedTeam,
        myTeam: mine ? { slug: mine.slug, name: mine.name } : null,
        empty:
          loaded.storedGames === 0
            ? "not_loaded"
            : slate.gameCount === 0
              ? "no_games"
              : selected && shown.gameCount === 0
                ? "team_idle"
                : null,
      };
    },

    /**
     * One team's current-week games for its page, each read from the team's own side. Null when
     * the slug matches no team or no season exists.
     */
    async getTeamWeek(slug: string): Promise<TeamWeek | null> {
      const loaded = await loadSlate(undefined);
      const team = loaded?.league.teams.find((t) => t.slug === slug);
      if (!loaded || !team) return null;

      const games = teamGames(loaded.slate, team.id).flatMap((game): TeamWeekGame[] => {
        const side = teamSide(game, team.id);
        if (!side) return [];
        return [
          {
            id: game.id,
            sport: game.sport,
            sportLabel: SPORTS[game.sport].shortLabel,
            day: weekdayShort(game.day),
            side,
            connector: side === "away" && !game.neutralSite ? "@" : "vs",
            opponent: game[opposite(side)],
            neutralSite: game.neutralSite,
            isShowdown: game.isShowdown,
            result: describeGame(game, side, { withDay: true }),
          },
        ];
      });

      return {
        teamName: team.name,
        slug: team.slug,
        weekStart: loaded.weekStart,
        rangeLabel: formatWeekRange(loaded.weekStart),
        games,
      };
    },
  };
}
