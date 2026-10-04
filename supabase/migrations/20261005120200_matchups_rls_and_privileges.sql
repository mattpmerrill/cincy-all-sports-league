-- RLS and grants for matchups. Pairings and results are public like standings and rosters: anyone
-- can read them. There are deliberately NO insert, update or delete policies and no write grants
-- for anon or authenticated: only the weekly rollover (roll_matchup_week, called by the app with
-- the service role) writes, so a direct write from a browser is denied twice over.

alter table public.matchups enable row level security;

create policy "public read" on public.matchups for select to anon, authenticated using (true);

-- Same pattern as games_rls_and_privileges: strip everything, grant back only what the app
-- needs. service_role needs explicit grants in this CLI version.
revoke all on public.matchups from anon, authenticated, service_role;
grant all on public.matchups to service_role;
grant select on public.matchups to anon, authenticated;
