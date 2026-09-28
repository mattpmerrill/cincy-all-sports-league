-- Season configuration: which sports exist, how each is scored this season, and when it runs.

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_on date not null,
  ends_on date not null,
  playoff_scoring_mode public.playoff_scoring_mode not null default 'cumulative',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on)
);

-- The app reads "the" active season; two would make that ambiguous.
create unique index seasons_one_active_idx on public.seasons ((true)) where is_active;

create table public.sports (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z]+$'),
  name text not null,
  participant_kind public.participant_kind not null,
  espn_sport text not null,
  espn_league text not null,
  -- Only the WNBA (12 teams, 20 fantasy teams) forces two people onto the same participant.
  allows_duplicate_picks boolean not null default false,
  sort_order integer not null default 0,
  unique (espn_sport, espn_league)
);

create table public.season_sports (
  season_id uuid not null references public.seasons (id) on delete cascade,
  sport_id uuid not null references public.sports (id) on delete restrict,
  starts_on date not null,
  espn_season integer not null check (espn_season between 2000 and 2100),
  -- Tennis and golf only: cap on the summed major_finish points.
  major_points_cap numeric(7, 2) check (major_points_cap > 0),
  primary key (season_id, sport_id)
);

create index season_sports_sport_id_idx on public.season_sports (sport_id);

create table public.scoring_rules (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  sport_id uuid not null,
  code text not null,
  label text not null,
  kind public.scoring_rule_kind not null,
  points numeric(7, 4) not null check (points >= 0),
  -- Only final_rank_band rules use these: the band of final ranks that earns `points`.
  rank_from integer,
  rank_to integer,
  -- True for every "Champion" rule; the leaderboard's first tiebreaker counts these.
  is_championship boolean not null default false,
  sort_order integer not null default 0,
  unique (season_id, sport_id, code),
  -- Lets participant_results prove a rule belongs to the same season as the result.
  unique (id, season_id),
  foreign key (season_id, sport_id)
    references public.season_sports (season_id, sport_id) on delete cascade,
  constraint scoring_rules_rank_band_shape check (
    case kind
      when 'final_rank_band'
        then rank_from is not null and rank_to is not null and rank_from >= 1 and rank_from <= rank_to
      else rank_from is null and rank_to is null
    end
  ),
  -- Ties and wins are counts, never championships.
  constraint scoring_rules_championship_kind check (
    not is_championship or kind in ('playoff_milestone', 'major_finish')
  )
);

create index scoring_rules_sport_id_idx on public.scoring_rules (sport_id);
