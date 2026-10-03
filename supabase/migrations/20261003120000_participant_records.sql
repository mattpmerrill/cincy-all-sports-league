-- A team's regular-season record, for display. These are NOT scoring facts: wins keep scoring
-- through participant_results exactly as before (ADR-001), and nothing in the domain's scoring
-- reads this table. Keeping them apart means a display-only stat can never change a leaderboard
-- and sync can overwrite a record freely (there is no locked or manual variant).
--
-- One row per (season, participant). A participant with no row has no record yet (the season has
-- not started), which the app shows as nothing. Athletes (WTA, PGA) never get a row: their ranking
-- line is derived from the final_rank_band result they already have.

create table public.participant_records (
  season_id uuid not null references public.seasons (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  -- NFL ties, and MLS draws (the app words them by sport).
  ties integer not null default 0 check (ties >= 0),
  -- NHL overtime and shootout losses; 0 in every other sport.
  ot_losses integer not null default 0 check (ot_losses >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The natural key sync upserts against, which keeps sync idempotent.
  primary key (season_id, participant_id)
);

-- The primary key serves season lookups; this one serves the cascade from participants.
create index participant_records_participant_id_idx on public.participant_records (participant_id);

create trigger participant_records_set_updated_at
  before update on public.participant_records
  for each row execute function public.set_updated_at();
