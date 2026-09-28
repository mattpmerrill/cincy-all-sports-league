-- The league itself: real-world participants, the 20 fantasy teams, and their picks.

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports (id) on delete restrict,
  name text not null,
  short_name text not null,
  -- ESPN's id; null only when ESPN has no record (e.g. an amateur golfer).
  espn_id text,
  -- A team logo, or an athlete headshot for tennis and golf.
  logo_url text,
  primary_color text check (primary_color ~ '^#[0-9a-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sport_id, name),
  unique (sport_id, espn_id),
  -- Lets picks prove the participant belongs to the pick's sport.
  unique (id, sport_id)
);

create trigger participants_set_updated_at
  before update on public.participants
  for each row execute function public.set_updated_at();

create table public.fantasy_teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Set by approve_team_claim, or directly by an admin. A deleted profile frees the team.
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, name),
  unique (season_id, slug),
  -- One person, one team per season. Nulls are distinct, so unowned teams don't collide.
  unique (season_id, owner_id),
  -- Lets standings_snapshots prove the team belongs to the snapshot's season.
  unique (id, season_id)
);

create index fantasy_teams_owner_id_idx on public.fantasy_teams (owner_id);

create trigger fantasy_teams_set_updated_at
  before update on public.fantasy_teams
  for each row execute function public.set_updated_at();

create table public.picks (
  id uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  sport_id uuid not null references public.sports (id) on delete restrict,
  participant_id uuid not null,
  unique (fantasy_team_id, sport_id),
  foreign key (participant_id, sport_id)
    references public.participants (id, sport_id) on delete restrict
);

create index picks_participant_id_idx on public.picks (participant_id, sport_id);
create index picks_sport_id_idx on public.picks (sport_id);

-- "No two teams share a participant" holds per season and only where the sport forbids
-- duplicates, so it cannot be a plain unique index. Picks are written by seed/service only.
create function public.enforce_pick_uniqueness()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not (select allows_duplicate_picks from public.sports where id = new.sport_id)
     and exists (
       select 1
       from public.picks p
       join public.fantasy_teams t on t.id = p.fantasy_team_id
       where p.participant_id = new.participant_id
         and p.id <> new.id
         and t.season_id = (select season_id from public.fantasy_teams where id = new.fantasy_team_id)
     ) then
    raise exception 'participant already picked by another team in this sport'
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

create trigger picks_enforce_uniqueness
  before insert or update on public.picks
  for each row execute function public.enforce_pick_uniqueness();
