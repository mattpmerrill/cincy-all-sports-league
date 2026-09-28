-- Operational tables written only by the sync job (secret key, bypasses RLS).

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  -- Null for runs that are not about one sport (e.g. the daily snapshot).
  sport_id uuid references public.sports (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status public.sync_status not null default 'running',
  summary jsonb not null default '{}'::jsonb,
  check ((status = 'running') = (finished_at is null)),
  check (finished_at is null or finished_at >= started_at)
);

-- "Last synced" lookups are always the latest run per sport.
create index sync_runs_sport_started_idx on public.sync_runs (sport_id, started_at desc);
create index sync_runs_started_at_idx on public.sync_runs (started_at desc);

-- One row per team per day, so the daily job can upsert and the UI can show rank movement.
create table public.standings_snapshots (
  season_id uuid not null,
  fantasy_team_id uuid not null,
  snapshot_date date not null,
  total_points numeric(9, 4) not null,
  rank integer not null check (rank >= 1),
  primary key (season_id, fantasy_team_id, snapshot_date),
  foreign key (fantasy_team_id, season_id)
    references public.fantasy_teams (id, season_id) on delete cascade
);

create index standings_snapshots_team_idx on public.standings_snapshots (fantasy_team_id);
create index standings_snapshots_date_idx on public.standings_snapshots (season_id, snapshot_date desc);
