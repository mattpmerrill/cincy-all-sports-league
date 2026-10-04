import { clampWeekStart, easternWeekStart, formatWeekRange } from "@/domain/calendar";
import { buildLeagueModel } from "@/domain/league";
import type { LeagueData, StandingRow } from "@/domain/league";
import {
  buildMatchupStandings,
  displayWeek,
  formatMatchupRecord,
  scoreMatchup,
} from "@/domain/matchups";
import type {
  Matchup,
  MatchupLeader,
  MatchupResult,
  MatchupSideKey,
  MatchupStandingRow,
  MatchupStatus,
  ScoredMatchup,
  Streak,
} from "@/domain/matchups";
import { MATCHUP_SIDES, matchupStatus, opposite } from "@/domain/matchups";
import { easternDate } from "@/lib/time";

/** The cached league data: teams, owners, picks and the season's dates. */
export type LeagueDataSource = () => Promise<LeagueData | null>;
/** The cached matchups of a season, oldest week first. */
export type SeasonMatchupsSource = (seasonId: string) => Promise<Matchup[]>;

export type MatchupsDeps = {
  league: LeagueDataSource;
  matchups: SeasonMatchupsSource;
  now?: () => Date;
};

// ===== what the pages receive =====
// Everything a component prints is already here: names, ranks, records, gains, who is ahead. A
// component maps and formats; it never compares totals or looks a team up.

export type TeamLink = { teamId: string; slug: string; name: string };

export type MatchupRecord = { wins: number; losses: number; ties: number; label: string };

/** How a team stands in a live matchup: it can only be called with both gains known. */
export type TeamMatchupLead = "ahead" | "behind" | "tied";

/** A matchup from one team's point of view: its result once final, its lead while live. */
export type MatchupOutcome =
  { state: "final"; result: MatchupResult } | { state: "live"; lead: TeamMatchupLead | null };

/** One team's side of a matchup as the Week page draws it. */
export type MatchupSideView = TeamLink & {
  ownerName: string | null;
  /** The team's current season standings rank ("T3" style label included). */
  seasonRank: number;
  seasonRankLabel: string;
  /**
   * The team's matchup record over every finished week up to now (not "as of" a past week). Null
   * while no week has finished anywhere, when every team would just read 0-0-0.
   */
  record: MatchupRecord | null;
  /** Points gained over the week; null when the live total is unknown. */
  gain: number | null;
  /** Null while the matchup is live. */
  result: MatchupResult | null;
  /** How the team stands while the matchup is live; null once final or when a gain is unknown. */
  lead: TeamMatchupLead | null;
  /** True when the signed-in viewer owns this team. */
  isMine: boolean;
};

export type MatchupView = {
  id: string;
  weekStart: string;
  state: MatchupStatus;
  home: MatchupSideView;
  away: MatchupSideView;
  /** Who is ahead (live) or won (final); null when a live gain is unknown. */
  leader: MatchupLeader | null;
  /** True when the viewer owns either team. Such a matchup comes first. */
  isMine: boolean;
  /** How the viewer's own team is doing ("Winning", "Final: won"); null unless `isMine`. */
  viewerOutcome: MatchupOutcome | null;
};

/**
 * Why a week has no matchups:
 * - `starts_monday`: the season has none yet, so the first week opens on the next rollover.
 * - `none_this_week`: the season has matchups, just not for the shown week (before the first, or
 *   a week the rollover has not opened and no earlier week is still live).
 */
export type MatchupsEmpty = "starts_monday" | "none_this_week";

export type WeekMatchups = {
  seasonName: string;
  /** The Monday of the week actually shown. It is an earlier week when `awaitingRollover`. */
  weekStart: string;
  /** The label of the week actually shown ("Oct 5 – 11, 2026"), never of the one asked for. */
  rangeLabel: string;
  /**
   * True when this view is the current week's: either the calendar's current week, or (when
   * `awaitingRollover`) the earlier live week standing in for it. False when a specific other
   * week was asked for.
   */
  isCurrentWeek: boolean;
  /**
   * True when `weekStart` is last week (or older), still live because the Monday rollover has not
   * opened the current week yet. The page can say "Final scores post Monday morning".
   */
  awaitingRollover: boolean;
  /** Viewer's matchup first, then by the better season rank of the two teams. */
  matchups: MatchupView[];
  /** Teams with no matchup this week (an odd field leaves one). Empty when there are no matchups. */
  byeTeams: TeamLink[];
  empty: MatchupsEmpty | null;
};

export type MatchupStandingsRowView = TeamLink & {
  ownerName: string | null;
  /** Position in the matchup table (shared on ties, like the season table). */
  rank: number;
  rankLabel: string;
  isTied: boolean;
  seasonRank: number;
  seasonRankLabel: string;
  /** Always present here: the table is only meant to be shown once `hasFinishedWeek`. */
  record: MatchupRecord;
  /** Total weekly points gained across finished matchups. */
  pointsGained: number;
  streak: Streak | null;
  /** The opponent in the live matchup, or null (no live week, or a bye). */
  opponent: TeamLink | null;
  isMine: boolean;
};

export type MatchupStandings = {
  seasonName: string;
  /** The Monday of the live week the opponents belong to; null when no matchup is live. */
  liveWeekStart: string | null;
  /** False until a week has closed: show an empty state, not twenty teams tied at 0-0-0. */
  hasFinishedWeek: boolean;
  rows: MatchupStandingsRowView[];
};

export type TeamMatchupEntry = {
  id: string;
  weekStart: string;
  rangeLabel: string;
  side: MatchupSideKey;
  opponent: TeamLink & { ownerName: string | null };
  /** The team's gain and its opponent's, for the week. Null when a live total is unknown. */
  gain: number | null;
  opponentGain: number | null;
  status: MatchupOutcome;
};

export type TeamMatchups = TeamLink & {
  ownerName: string | null;
  seasonRank: number;
  seasonRankLabel: string;
  /** Null until a week has finished. */
  record: MatchupRecord | null;
  streak: Streak | null;
  /** Newest week first. Empty before the team's first matchup. */
  entries: TeamMatchupEntry[];
};

/** One call gives the Standings page every team's record. */
export type MatchupRecords = {
  /** Null for an unknown team, and for every team while no week has finished. */
  recordFor(teamId: string): MatchupRecord | null;
};

const recordOf = (row: Pick<MatchupStandingRow, "wins" | "losses" | "ties">): MatchupRecord => ({
  wins: row.wins,
  losses: row.losses,
  ties: row.ties,
  label: formatMatchupRecord(row.wins, row.losses, row.ties),
});

const teamLink = (team: Pick<StandingRow, "teamId" | "slug" | "teamName">): TeamLink => ({
  teamId: team.teamId,
  slug: team.slug,
  name: team.teamName,
});

export type MatchupsService = ReturnType<typeof createMatchupsService>;

export function createMatchupsService(deps: MatchupsDeps) {
  const now = deps.now ?? (() => new Date());

  /**
   * Everything the three reads share: the scored league (teams, ranks, current season totals),
   * the season's matchups and the matchup table. Both sources are cached, so this is two cache
   * hits. Live scores come from the league model's totals, so a sync moves them with no change to
   * the matchups cache.
   */
  async function load() {
    const data = await deps.league();
    if (!data) return null;
    const model = buildLeagueModel(data, easternDate(now()));
    const matchups = await deps.matchups(data.season.id);

    const teams = new Map(model.standings.map((row) => [row.teamId, row]));
    const totals = new Map(model.standings.map((row) => [row.teamId, row.total]));

    // The calendar's current week, pulled into the season like the Week page does, and the week
    // the pages should show for it (`displayWeek` owns the early-Monday and missed-Monday cases).
    const { startsOn, endsOn } = data.season;
    const currentWeek = clampWeekStart(easternWeekStart(now()), startsOn, endsOn);
    const display = displayWeek(currentWeek, matchups);
    // The table's "opponent" column reads the displayed week, when it is still being played.
    const liveWeekStart = matchups.some(
      (m) => m.weekStart === display.weekStart && matchupStatus(m) === "live",
    )
      ? display.weekStart
      : null;

    const table = buildMatchupStandings(
      model.standings.map((row) => ({
        teamId: row.teamId,
        teamName: row.teamName,
        rank: row.rank,
      })),
      matchups,
      { currentWeekStart: liveWeekStart },
    );
    const hasFinishedWeek = matchups.some((m) => matchupStatus(m) === "final");
    const tableRow = new Map(table.map((row) => [row.teamId, row]));
    const viewerTeamId = (viewerId: string | null | undefined): string | null =>
      (viewerId ? model.standings.find((row) => row.owner?.id === viewerId)?.teamId : null) ?? null;

    return {
      data,
      model,
      matchups,
      currentWeek,
      display,
      teams,
      totals,
      table,
      tableRow,
      liveWeekStart,
      hasFinishedWeek,
      viewerTeamId,
    };
  }
  type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;

  const recordFor = (loaded: Loaded, teamId: string): MatchupRecord | null => {
    const row = loaded.tableRow.get(teamId);
    return loaded.hasFinishedWeek && row ? recordOf(row) : null;
  };

  function sideView(
    loaded: Loaded,
    team: StandingRow,
    score: { gain: number | null; result: MatchupResult | null; lead: TeamMatchupLead | null },
    viewerTeam: string | null,
  ): MatchupSideView {
    return {
      ...teamLink(team),
      ownerName: team.owner?.displayName ?? null,
      seasonRank: team.rank,
      seasonRankLabel: team.rankLabel,
      record: recordFor(loaded, team.teamId),
      gain: score.gain,
      result: score.result,
      lead: score.lead,
      isMine: team.teamId === viewerTeam,
    };
  }

  /** The matchup as `side` sees it: its result when final, its lead while live. */
  const outcomeOf = (scored: ScoredMatchup, side: MatchupSideKey): MatchupOutcome => {
    if (scored.state === "final") return { state: "final", result: scored[side].result };
    if (scored.leader === null) return { state: "live", lead: null };
    if (scored.leader === "tied") return { state: "live", lead: "tied" };
    return { state: "live", lead: scored.leader === side ? "ahead" : "behind" };
  };

  const scoreOf = (scored: ScoredMatchup, key: MatchupSideKey) => {
    const outcome = outcomeOf(scored, key);
    return {
      gain: scored[key].gain,
      result: outcome.state === "final" ? outcome.result : null,
      lead: outcome.state === "live" ? outcome.lead : null,
    };
  };

  return {
    /**
     * One league week's matchups, scored against the current season totals (final weeks use their
     * frozen end totals). `weekStart` defaults to the current Eastern week and is pulled into the
     * weeks the season covers, like the Week page does. Null before a season exists.
     */
    async getWeekMatchups(
      input: { weekStart?: string; viewerId?: string | null } = {},
    ): Promise<WeekMatchups | null> {
      const loaded = await load();
      if (!loaded) return null;
      const { season } = loaded.data;
      const { currentWeek } = loaded;
      const requested = clampWeekStart(
        input.weekStart ?? currentWeek,
        season.startsOn,
        season.endsOn,
      );
      // Only the current week is ever swapped for a live earlier one; any other week is honoured.
      const asksForCurrent = requested === currentWeek;
      const { weekStart, awaitingRollover } = asksForCurrent
        ? loaded.display
        : { weekStart: requested, awaitingRollover: false };
      const viewerTeam = loaded.viewerTeamId(input.viewerId);

      const views = loaded.matchups
        .filter((m) => m.weekStart === weekStart)
        .flatMap((m): MatchupView[] => {
          const home = loaded.teams.get(m.home.teamId);
          const away = loaded.teams.get(m.away.teamId);
          // A team the cached league no longer lists (deleted since): nothing honest to show.
          if (!home || !away) return [];
          const scored = scoreMatchup(m, loaded.totals);
          const mine = viewerTeam
            ? MATCHUP_SIDES.find((k) => m[k].teamId === viewerTeam)
            : undefined;
          return [
            {
              id: m.id,
              weekStart: m.weekStart,
              state: scored.state,
              home: sideView(loaded, home, scoreOf(scored, "home"), viewerTeam),
              away: sideView(loaded, away, scoreOf(scored, "away"), viewerTeam),
              leader: scored.leader,
              isMine: mine !== undefined,
              viewerOutcome: mine ? outcomeOf(scored, mine) : null,
            },
          ];
        });

      const bestRank = (v: MatchupView) => Math.min(v.home.seasonRank, v.away.seasonRank);
      const matchups = views.sort(
        (a, b) =>
          Number(b.isMine) - Number(a.isMine) ||
          bestRank(a) - bestRank(b) ||
          a.home.name.localeCompare(b.home.name, "en", { sensitivity: "base" }),
      );

      const playing = new Set(matchups.flatMap((v) => [v.home.teamId, v.away.teamId]));
      const byeTeams =
        matchups.length === 0
          ? []
          : loaded.model.standings.filter((t) => !playing.has(t.teamId)).map(teamLink);

      return {
        seasonName: season.name,
        weekStart,
        rangeLabel: formatWeekRange(weekStart),
        isCurrentWeek: asksForCurrent,
        awaitingRollover,
        matchups,
        byeTeams,
        empty:
          matchups.length > 0
            ? null
            : loaded.matchups.length === 0
              ? "starts_monday"
              : "none_this_week",
      };
    },

    /**
     * The matchup table: record, streak and points gained for every team, plus the live
     * opponent. Null before a season exists. Show an empty state while `hasFinishedWeek` is false.
     */
    async getMatchupStandings(
      input: { viewerId?: string | null } = {},
    ): Promise<MatchupStandings | null> {
      const loaded = await load();
      if (!loaded) return null;
      const viewerTeam = loaded.viewerTeamId(input.viewerId);

      const rows = loaded.table.flatMap((row): MatchupStandingsRowView[] => {
        const team = loaded.teams.get(row.teamId);
        if (!team) return [];
        const opponent = row.currentOpponentId
          ? loaded.teams.get(row.currentOpponentId)
          : undefined;
        return [
          {
            ...teamLink(team),
            ownerName: team.owner?.displayName ?? null,
            rank: row.rank,
            rankLabel: row.rankLabel,
            isTied: row.isTied,
            seasonRank: team.rank,
            seasonRankLabel: team.rankLabel,
            record: recordOf(row),
            pointsGained: row.pointsGained,
            streak: row.streak,
            opponent: opponent ? teamLink(opponent) : null,
            isMine: team.teamId === viewerTeam,
          },
        ];
      });

      return {
        seasonName: loaded.data.season.name,
        liveWeekStart: loaded.liveWeekStart,
        hasFinishedWeek: loaded.hasFinishedWeek,
        rows,
      };
    },

    /**
     * One team's matchup record and its week-by-week list, newest first. Null when the slug
     * matches no team or no season exists.
     */
    async getTeamMatchups(input: { teamSlug: string }): Promise<TeamMatchups | null> {
      const loaded = await load();
      if (!loaded) return null;
      const team = loaded.model.standings.find((t) => t.slug === input.teamSlug);
      if (!team) return null;

      const entries = loaded.matchups
        .filter((m) => m.home.teamId === team.teamId || m.away.teamId === team.teamId)
        .flatMap((m): TeamMatchupEntry[] => {
          const side = MATCHUP_SIDES.find((key) => m[key].teamId === team.teamId);
          if (!side) return [];
          const other = opposite(side);
          const opponent = loaded.teams.get(m[other].teamId);
          if (!opponent) return [];
          const scored = scoreMatchup(m, loaded.totals);
          const mine = scoreOf(scored, side);
          const theirs = scoreOf(scored, other);
          return [
            {
              id: m.id,
              weekStart: m.weekStart,
              rangeLabel: formatWeekRange(m.weekStart),
              side,
              opponent: { ...teamLink(opponent), ownerName: opponent.owner?.displayName ?? null },
              gain: mine.gain,
              opponentGain: theirs.gain,
              status: outcomeOf(scored, side),
            },
          ];
        })
        .sort((a, b) => b.weekStart.localeCompare(a.weekStart));

      return {
        ...teamLink(team),
        ownerName: team.owner?.displayName ?? null,
        seasonRank: team.rank,
        seasonRankLabel: team.rankLabel,
        record: recordFor(loaded, team.teamId),
        streak: loaded.tableRow.get(team.teamId)?.streak ?? null,
        entries,
      };
    },

    /**
     * Every team's matchup record from one read, for the Standings page's season rows. Without a
     * season, or before any week has finished, `recordFor` returns null so nothing is drawn.
     */
    async getMatchupRecords(): Promise<MatchupRecords> {
      const loaded = await load();
      return { recordFor: (teamId) => (loaded ? recordFor(loaded, teamId) : null) };
    },
  };
}
