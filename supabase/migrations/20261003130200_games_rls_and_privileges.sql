-- RLS and grants for games. The schedule is public like standings and rosters: anyone can read it.
-- There are deliberately NO insert, update or delete policies and no write grants for anon or
-- authenticated: only the games refresh (service_role, through the app's secret key) writes, so a
-- direct write from a browser is denied twice over.

alter table public.games enable row level security;

create policy "public read" on public.games for select to anon, authenticated using (true);

-- Same pattern as free_agent_rls_and_privileges: strip everything, grant back only what the app
-- needs. service_role needs explicit grants in this CLI version.
revoke all on public.games from anon, authenticated, service_role;
grant all on public.games to service_role;
grant select on public.games to anon, authenticated;
