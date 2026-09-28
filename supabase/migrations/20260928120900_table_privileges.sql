-- Defense in depth under RLS. Depending on the platform version, new tables get broad grants for
-- anon and authenticated (older) or almost none (newer). Either way, state the grants explicitly:
-- strip everything, then grant back only what the app needs, so a missing policy is never the only
-- thing standing between a caller and a write.

revoke all on
  public.seasons, public.sports, public.season_sports, public.scoring_rules,
  public.participants, public.fantasy_teams, public.picks, public.participant_results,
  public.profiles, public.team_claims, public.sync_runs, public.standings_snapshots
from anon, authenticated, service_role;

-- The secret key (service_role) bypasses RLS but still needs table privileges: sync and seeding.
grant all on
  public.seasons, public.sports, public.season_sports, public.scoring_rules,
  public.participants, public.fantasy_teams, public.picks, public.participant_results,
  public.profiles, public.team_claims, public.sync_runs, public.standings_snapshots
to service_role;

grant select on
  public.seasons, public.sports, public.season_sports, public.scoring_rules,
  public.participants, public.fantasy_teams, public.picks, public.participant_results,
  public.profiles, public.sync_runs, public.standings_snapshots
to anon, authenticated;

-- Signed-in users: claims, plus the writes the admin policies above gate.
grant insert, update on public.team_claims to authenticated;
grant select on public.team_claims to authenticated;
grant insert, update, delete on public.participant_results to authenticated;
grant update (name, slug, owner_id) on public.fantasy_teams to authenticated;
grant update (display_name, avatar_url, role) on public.profiles to authenticated;
