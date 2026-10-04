-- Matchups: every Monday all fantasy teams in a season are paired, and whoever gains more season
-- points over the week wins. A row freezes both teams' season totals when the week opens
-- (start_points); the next rollover writes the then-current totals (end_points) and the row is
-- final. A team's weekly score is end minus start. The result (win, loss, tie) is derived in
-- application code and never stored, so a scoring correction can never leave a stale winner.
--
-- Bragging rights only: nothing here feeds season scoring or standings (ADR-001 is unchanged).
-- Access rules live in matchups_rls_and_privileges; the rollover write path in
-- roll_matchup_week; the daily trigger in schedule_matchups_rollover.

create table public.matchups (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  -- The Monday the week opens. The week closes at the next rollover (Monday 7:00 am Eastern, not
  -- midnight Sunday, so a late Sunday game still lands in the week it was played in).
  week_start date not null check (extract(isodow from week_start) = 1),

  -- "Home" and "away" carry no meaning beyond a stable display order: home is the better-ranked
  -- team at pairing time. Neither side has an advantage.
  --
  -- Composite foreign keys, as in standings_snapshots: a matchup cannot pair a team with a team
  -- of another season, and deleting a team takes its matchups with it.
  home_team_id uuid not null,
  away_team_id uuid not null,
  home_start_points numeric(9, 4) not null,
  away_start_points numeric(9, 4) not null,

  -- Null while the week is open. Written together by roll_matchup_week, which is the only writer,
  -- so a half-finished result (one side scored, no finalized_at) cannot exist.
  home_end_points numeric(9, 4),
  away_end_points numeric(9, 4),
  finalized_at timestamptz,

  created_at timestamptz not null default now(),

  constraint matchups_distinct_teams check (home_team_id <> away_team_id),
  -- numeric stores NaN, and NaN would silently poison every comparison (it sorts above all
  -- numbers and equals itself). The function only accepts JSON numbers, so this guards direct
  -- writes. A null end point passes, as it should while the week is open.
  constraint matchups_home_start_not_nan check (home_start_points <> 'NaN'),
  constraint matchups_away_start_not_nan check (away_start_points <> 'NaN'),
  constraint matchups_home_end_not_nan check (home_end_points <> 'NaN'),
  constraint matchups_away_end_not_nan check (away_end_points <> 'NaN'),
  constraint matchups_result_all_or_nothing check (
    (home_end_points is null) = (away_end_points is null)
    and (home_end_points is null) = (finalized_at is null)
  ),
  foreign key (home_team_id, season_id)
    references public.fantasy_teams (id, season_id) on delete cascade,
  foreign key (away_team_id, season_id)
    references public.fantasy_teams (id, season_id) on delete cascade,
  -- A team is paired at most once per side per week. These two do not stop a team being home in
  -- one row and away in another, so roll_matchup_week checks that across both sides.
  unique (season_id, week_start, home_team_id),
  unique (season_id, week_start, away_team_id)
);

-- Reading a whole season in week order needs no index of its own: the unique constraints above
-- lead with (season_id, week_start), and the planner uses them.

-- The team page reads one team's matchups, and the cascade from fantasy_teams looks rows up by
-- team.
create index matchups_home_team_idx on public.matchups (home_team_id);
create index matchups_away_team_idx on public.matchups (away_team_id);
