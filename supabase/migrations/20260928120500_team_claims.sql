-- A member asks to own a fantasy team; an admin approves or rejects (see claim functions).

create table public.team_claims (
  id uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.claim_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A reviewed claim records when; a pending one never has.
  check ((status = 'pending') = (reviewed_at is null))
);

create index team_claims_fantasy_team_id_idx on public.team_claims (fantasy_team_id);
create index team_claims_user_id_idx on public.team_claims (user_id);
create index team_claims_reviewed_by_idx on public.team_claims (reviewed_by);

-- One approved claim per team and per user; and no duplicate pending requests.
create unique index team_claims_one_approved_per_team_idx
  on public.team_claims (fantasy_team_id) where status = 'approved';
create unique index team_claims_one_approved_per_user_idx
  on public.team_claims (user_id) where status = 'approved';
create unique index team_claims_one_pending_per_user_team_idx
  on public.team_claims (user_id, fantasy_team_id) where status = 'pending';

create trigger team_claims_set_updated_at
  before update on public.team_claims
  for each row execute function public.set_updated_at();
