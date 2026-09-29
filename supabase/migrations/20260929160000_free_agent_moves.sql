-- Free-agent moves: a member drops their pick in a sport and takes a participant nobody holds, in
-- one step. The write path is make_free_agent_move (free_agent_functions, service_role only);
-- access rules live in free_agent_rls_and_privileges.

-- Where a banked row came from. Stored, not derived from which foreign key is set: both keys go
-- null when their parent is deleted (on delete set null), and the team page still has to word the
-- line ("before the trade" vs "before dropping them").
create type public.banked_source as enum ('trade', 'free_agent');

-- One row per move: the public record of who dropped whom. History only; the current state is the
-- pick itself.
create table public.free_agent_moves (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  fantasy_team_id uuid not null,
  sport_id uuid not null references public.sports (id) on delete restrict,
  dropped_participant_id uuid not null,
  added_participant_id uuid not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Cascade: a deleted team takes its move history with it, like its picks and offers.
  constraint free_agent_moves_team_fkey foreign key (fantasy_team_id, season_id)
    references public.fantasy_teams (id, season_id) on delete cascade,
  -- Both participant references are composite with sport_id, so a move cannot cross sports.
  -- Named: PostgREST needs the names to embed participants twice in one select.
  constraint free_agent_moves_dropped_fkey foreign key (dropped_participant_id, sport_id)
    references public.participants (id, sport_id) on delete restrict,
  constraint free_agent_moves_added_fkey foreign key (added_participant_id, sport_id)
    references public.participants (id, sport_id) on delete restrict,
  check (dropped_participant_id <> added_participant_id)
);

-- The recent-moves feed reads the season newest first; a team's history reads by team.
create index free_agent_moves_season_created_idx on public.free_agent_moves (season_id, created_at desc);
create index free_agent_moves_team_idx on public.free_agent_moves (fantasy_team_id, created_at desc);

-- Existing rows are all trades, so the default keeps accept_trade_offer working unchanged.
-- Set null, not cascade: a move deleted on its own (admin cleanup) must not take the banked points
-- with it. A team delete cascades both anyway. The check keeps the two provenance columns from
-- contradicting the source. No >= 0 check on the values, as in the trade tables.
alter table public.banked_scores
  add column source public.banked_source not null default 'trade',
  add column free_agent_move_id uuid references public.free_agent_moves (id) on delete set null,
  add constraint banked_scores_provenance check (
    (source = 'trade' and free_agent_move_id is null)
    or (source = 'free_agent' and trade_offer_id is null)
  );
