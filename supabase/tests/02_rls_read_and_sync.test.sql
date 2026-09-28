-- Public read access and the "no client writes" rules for league, sync and result tables.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.seasons (id, name, starts_on, ends_on)
values ('10000000-0000-0000-0000-000000000001', 'test-season', '2030-01-01', '2030-12-31');
insert into public.sports (id, code, name, participant_kind, espn_sport, espn_league)
values ('20000000-0000-0000-0000-000000000001', 'aa', 'Sport A', 'team', 'testa', 'a');
insert into public.season_sports (season_id, sport_id, starts_on, espn_season)
values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2030-01-01', 2030);
insert into public.scoring_rules (id, season_id, sport_id, code, label, kind, points)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'win', 'Win', 'per_win', 1);
insert into public.participants (id, sport_id, name, short_name)
values ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Alpha', 'A');
insert into public.fantasy_teams (id, season_id, name, slug)
values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Team One', 'team-one');
insert into public.picks (fantasy_team_id, sport_id, participant_id)
values ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001');
insert into public.participant_results (season_id, participant_id, scoring_rule_id, quantity)
values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 3);
insert into public.sync_runs (sport_id, status, finished_at)
values ('20000000-0000-0000-0000-000000000001', 'succeeded', now());
insert into public.standings_snapshots (season_id, fantasy_team_id, snapshot_date, total_points, rank)
values ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '2030-01-02', 3, 1);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'member@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000002';

create function pg_temp.set_caller(uid uuid, role_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', role_name)::text, true);
  execute format('set local role %I', role_name);
end $$;
grant execute on function pg_temp.set_caller(uuid, text) to public;

-- Allow: anonymous visitors can read every leaderboard table.
set local role anon;
select isnt_empty($$select 1 from public.seasons$$, 'anon reads seasons');
select isnt_empty($$select 1 from public.sports$$, 'anon reads sports');
select isnt_empty($$select 1 from public.season_sports$$, 'anon reads season_sports');
select isnt_empty($$select 1 from public.scoring_rules$$, 'anon reads scoring_rules');
select isnt_empty($$select 1 from public.participants$$, 'anon reads participants');
select isnt_empty($$select 1 from public.fantasy_teams$$, 'anon reads fantasy_teams');
select isnt_empty($$select 1 from public.picks$$, 'anon reads picks');
select isnt_empty($$select 1 from public.participant_results$$, 'anon reads participant_results');
select isnt_empty($$select 1 from public.sync_runs$$, 'anon reads sync_runs');
select isnt_empty($$select 1 from public.standings_snapshots$$, 'anon reads standings_snapshots');
select isnt_empty($$select 1 from public.profiles$$, 'anon reads profiles');

-- Deny: anonymous visitors cannot write anything or read claims.
select throws_ok(
  $$insert into public.participant_results (season_id, participant_id, scoring_rule_id, quantity)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 9)$$,
  '42501', null, 'anon cannot insert results');
select throws_ok($$update public.participant_results set quantity = 99$$, '42501', null, 'anon cannot update results');
select throws_ok($$update public.fantasy_teams set name = 'Hacked'$$, '42501', null, 'anon cannot rename teams');
select throws_ok($$insert into public.sync_runs (status) values ('running')$$, '42501', null, 'anon cannot write sync_runs');
select throws_ok(
  $$insert into public.standings_snapshots (season_id, fantasy_team_id, snapshot_date, total_points, rank)
    values ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '2030-01-03', 1, 1)$$,
  '42501', null, 'anon cannot write standings_snapshots');
select throws_ok($$select * from public.team_claims$$, '42501', null, 'anon cannot read claims');

-- Deny: signed-in members cannot write sync tables or picks either.
reset role;
select pg_temp.set_caller('00000000-0000-0000-0000-000000000001', 'authenticated');
select throws_ok($$insert into public.sync_runs (status) values ('running')$$, '42501', null, 'members cannot write sync_runs');
select throws_ok(
  $$insert into public.picks (fantasy_team_id, sport_id, participant_id)
    values ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'members cannot write picks');

-- Allow: the service (secret key) role writes sync tables; RLS is bypassed.
reset role;
select pg_temp.set_caller('00000000-0000-0000-0000-000000000001', 'service_role');
select lives_ok($$insert into public.sync_runs (status) values ('running')$$, 'service role can write sync_runs');

select * from finish();
rollback;
