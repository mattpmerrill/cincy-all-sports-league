-- Row Level Security is the authoritative access layer. Every table has it enabled; a table with
-- no policy for an operation denies that operation. Sync writes use the secret key (service_role
-- bypasses RLS) so the sync tables have no write policies at all.

alter table public.seasons enable row level security;
alter table public.sports enable row level security;
alter table public.season_sports enable row level security;
alter table public.scoring_rules enable row level security;
alter table public.participants enable row level security;
alter table public.fantasy_teams enable row level security;
alter table public.picks enable row level security;
alter table public.participant_results enable row level security;
alter table public.profiles enable row level security;
alter table public.team_claims enable row level security;
alter table public.sync_runs enable row level security;
alter table public.standings_snapshots enable row level security;

-- Public read: the leaderboard, rules and rosters are visible without signing in.
create policy "public read" on public.seasons for select to anon, authenticated using (true);
create policy "public read" on public.sports for select to anon, authenticated using (true);
create policy "public read" on public.season_sports for select to anon, authenticated using (true);
create policy "public read" on public.scoring_rules for select to anon, authenticated using (true);
create policy "public read" on public.participants for select to anon, authenticated using (true);
create policy "public read" on public.fantasy_teams for select to anon, authenticated using (true);
create policy "public read" on public.picks for select to anon, authenticated using (true);
create policy "public read" on public.participant_results for select to anon, authenticated using (true);
create policy "public read" on public.sync_runs for select to anon, authenticated using (true);
create policy "public read" on public.standings_snapshots for select to anon, authenticated using (true);
create policy "public read" on public.profiles for select to anon, authenticated using (true);

-- Results: admins only (manual edits and overrides).
create policy "admins insert" on public.participant_results
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins update" on public.participant_results
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete" on public.participant_results
  for delete to authenticated using ((select public.is_admin()));

-- Fantasy teams: admins rename and reassign owners (column grants limit which columns).
create policy "admins update" on public.fantasy_teams
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Profiles: a user edits their own row; role changes are additionally guarded by a trigger.
create policy "own update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "admins update" on public.profiles
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Claims: members see and create their own pending claims; admins see and review everything.
create policy "own or admin read" on public.team_claims
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "insert own pending" on public.team_claims
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    -- Only unowned teams can be claimed.
    and exists (
      select 1 from public.fantasy_teams t
      where t.id = fantasy_team_id and t.owner_id is null
    )
  );
create policy "admins update" on public.team_claims
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
