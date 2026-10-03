-- Games: the schedule of team-sport games (a home side, an away side, a start time, a status and
-- a score), refreshed from ESPN by /api/cron/games. The weekly "Week" page reads them; nothing here
-- is scoring data (ADR-001 is unchanged: wins still score through participant_results).
--
-- Why stored rather than fetched on render: see docs/decisions/ADR-006-weekly-games-feed.md.
-- Access rules live in games_rls_and_privileges; the refresh jobs in schedule_games_refresh.

create table public.games (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  sport_id uuid not null,
  -- The vendor's event id. With the sport it is the natural key a refresh upserts against, which
  -- is what makes re-running a refresh (or two overlapping ones) harmless.
  external_id text not null check (length(btrim(external_id)) > 0),
  starts_at timestamptz not null,
  -- The vendor knows the day but not the kickoff yet ("Time TBD"). starts_at then holds the
  -- vendor's placeholder, which still lands on the right Eastern day; the page shows "TBD".
  time_tbd boolean not null default false,
  status public.game_status not null default 'scheduled',
  -- The vendor's short status text: "Q3 4:12", "Final/OT".
  status_detail text,
  -- The event's headline: "World Series - Game 1".
  note text,
  neutral_site boolean not null default false,

  -- Each side keeps the vendor's id and name as well as our participant, because a game's
  -- opponent is often a team nobody in the league holds (or, rarely, one we have no row for).
  home_external_id text not null check (length(btrim(home_external_id)) > 0),
  home_participant_id uuid,
  home_name text not null check (length(btrim(home_name)) > 0),
  home_short_name text not null check (length(btrim(home_short_name)) > 0),
  home_score integer check (home_score >= 0),
  -- Null until the game is decided.
  home_winner boolean,
  away_external_id text not null check (length(btrim(away_external_id)) > 0),
  away_participant_id uuid,
  away_name text not null check (length(btrim(away_name)) > 0),
  away_short_name text not null check (length(btrim(away_short_name)) > 0),
  away_score integer check (away_score >= 0),
  away_winner boolean,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (sport_id, external_id),
  -- A game belongs to a sport that is part of its season, like a scoring rule does. Deleting the
  -- season (or the sport's place in it) takes its games with it.
  foreign key (season_id, sport_id)
    references public.season_sports (season_id, sport_id) on delete cascade,
  -- Composite with sport_id, so a game cannot point at a participant of another sport. Set null
  -- (the column list needs Postgres 15) keeps the game and its sport when a participant is
  -- deleted, and the name stored above still says who played. Named: PostgREST needs the names
  -- to embed participants twice in one select.
  constraint games_home_participant_fkey foreign key (home_participant_id, sport_id)
    references public.participants (id, sport_id) on delete set null (home_participant_id),
  constraint games_away_participant_fkey foreign key (away_participant_id, sport_id)
    references public.participants (id, sport_id) on delete set null (away_participant_id)
);

-- The week page reads one season between two instants.
create index games_season_starts_at_idx on public.games (season_id, starts_at);
-- Foreign-key checks and "what is this participant playing" both look games up by participant.
create index games_home_participant_idx on public.games (home_participant_id);
create index games_away_participant_idx on public.games (away_participant_id);

create trigger games_set_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();
