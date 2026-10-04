-- Matchups: schema constraints, public read, no client writes (allow AND deny), the service_role-
-- only roll_matchup_week function (create, idempotency, finalizing, every error token), cascade,
-- and the three rollover jobs. Fixtures are self-contained.
begin;
create extension if not exists pgtap with schema extensions;
select plan(100);

-- The seed may already have an active season; only one can be active at a time.
update public.seasons set is_active = false;
insert into public.seasons (id, name, starts_on, ends_on, is_active) values
  ('10000000-0000-0000-0000-000000000001', 'test-season', '2030-01-01', '2030-12-31', true),
  ('10000000-0000-0000-0000-000000000002', 'other-season', '2031-01-01', '2031-12-31', false);
-- T1..T4 are in the first season; T5 and T6 are in the other one.
insert into public.fantasy_teams (id, season_id, name, slug) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Team One', 'team-one'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Team Two', 'team-two'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Team Three', 'team-three'),
  ('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Team Four', 'team-four'),
  ('50000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 'Team Five', 'team-five'),
  ('50000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', 'Team Six', 'team-six');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'member@example.com');

create function pg_temp.set_caller(uid uuid, role_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', role_name)::text, true);
  execute format('set local role %I', role_name);
end $$;
grant execute on function pg_temp.set_caller(uuid, text) to public;

-- Dates: 2029-12-31 is a Monday, 2030-01-01 a Tuesday, 2030-01-07 / 14 / 21 Mondays.

-- ===== shape =====
select has_table('public', 'matchups', 'the matchups table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.matchups'::regclass), 'RLS is on for matchups');
select has_index('public', 'matchups', 'matchups_home_team_idx', 'home team lookups are indexed');
select has_index('public', 'matchups', 'matchups_away_team_idx', 'away team lookups are indexed');
select has_function('public', 'roll_matchup_week', array['uuid', 'date', 'jsonb', 'jsonb'], 'the rollover function exists');

-- ===== constraints (as the table owner, so RLS is out of the way) =====
insert into public.matchups (id, season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points)
values ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2029-12-31',
        '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 12.5, 10.25);
select ok(
  (select home_end_points is null and away_end_points is null and finalized_at is null
   from public.matchups where id = '60000000-0000-0000-0000-000000000001'),
  'a new matchup is open: no end points, not finalized');
select is(
  (select home_start_points::text || '/' || away_start_points::text from public.matchups where id = '60000000-0000-0000-0000-000000000001'),
  '12.5000/10.2500', 'start points keep four decimals');

select throws_ok(
  $$insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points)
    values ('10000000-0000-0000-0000-000000000001', '2030-01-01', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', 0, 0)$$,
  '23514', null, 'a week cannot start on a Tuesday');
select throws_ok(
  $$insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points)
    values ('10000000-0000-0000-0000-000000000001', '2030-01-07', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003', 0, 0)$$,
  '23514', null, 'a team cannot play itself');
select throws_ok(
  $$insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points, home_end_points)
    values ('10000000-0000-0000-0000-000000000001', '2030-01-07', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', 0, 0, 5)$$,
  '23514', null, 'one end score alone is rejected');
select throws_ok(
  $$insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points, finalized_at)
    values ('10000000-0000-0000-0000-000000000001', '2030-01-07', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', 0, 0, now())$$,
  '23514', null, 'finalized_at without end scores is rejected');
select throws_ok(
  $$insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points, home_end_points, away_end_points)
    values ('10000000-0000-0000-0000-000000000001', '2030-01-07', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', 0, 0, 5, 6)$$,
  '23514', null, 'end scores without finalized_at are rejected');
select lives_ok(
  $$insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points, home_end_points, away_end_points, finalized_at)
    values ('10000000-0000-0000-0000-000000000001', '2029-12-31', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', 0, 0, 5, 6, now())$$,
  'both end scores and finalized_at together are accepted');
select throws_ok(
  $$insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points)
    values ('10000000-0000-0000-0000-000000000001', '2029-12-31', '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 0, 0)$$,
  '23505', null, 'a team cannot be home twice in one week');
select throws_ok(
  $$insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points)
    values ('10000000-0000-0000-0000-000000000001', '2029-12-31', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002', 0, 0)$$,
  '23505', null, 'a team cannot be away twice in one week');
select lives_ok(
  $$insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points)
    values ('10000000-0000-0000-0000-000000000001', '2029-12-31', '50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', 0, 0)$$,
  'the table alone allows a team home in one row and away in another (roll_matchup_week is what rejects it)');
select throws_ok(
  $$insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points)
    values ('10000000-0000-0000-0000-000000000001', '2030-01-07', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000005', 0, 0)$$,
  '23503', null, 'a matchup cannot pair a team of another season');
select throws_ok(
  $$insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points)
    values ('10000000-0000-0000-0000-000000000001', '2030-01-07', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', 'NaN', 0)$$,
  '23514', null, 'a NaN home start is rejected');
select throws_ok(
  $$insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points)
    values ('10000000-0000-0000-0000-000000000001', '2030-01-07', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', 0, 'NaN')$$,
  '23514', null, 'a NaN away start is rejected');
select throws_ok(
  $$insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points, home_end_points, away_end_points, finalized_at)
    values ('10000000-0000-0000-0000-000000000001', '2030-01-07', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', 0, 0, 'NaN', 1, now())$$,
  '23514', null, 'a NaN home end is rejected');
select throws_ok(
  $$insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points, home_end_points, away_end_points, finalized_at)
    values ('10000000-0000-0000-0000-000000000001', '2030-01-07', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', 0, 0, 1, 'NaN', now())$$,
  '23514', null, 'a NaN away end is rejected');

-- ===== foreign-key behaviour =====
insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points)
values ('10000000-0000-0000-0000-000000000002', '2031-01-06', '50000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000006', 1, 2);
delete from public.fantasy_teams where id = '50000000-0000-0000-0000-000000000005';
select is((select count(*)::int from public.matchups where season_id = '10000000-0000-0000-0000-000000000002'), 0, 'deleting a team deletes its matchups');
select is((select count(*)::int from public.matchups where season_id = '10000000-0000-0000-0000-000000000001'), 3, 'other seasons'' matchups are untouched');

-- ===== allow: everyone reads =====
select pg_temp.set_caller(null, 'anon');
select isnt_empty($$select 1 from public.matchups$$, 'anon reads matchups');
reset role;
select pg_temp.set_caller('00000000-0000-0000-0000-000000000001', 'authenticated');
select isnt_empty($$select 1 from public.matchups$$, 'a signed-in member reads matchups');
reset role;

-- ===== deny: no client writes, no client rollover =====
select pg_temp.set_caller(null, 'anon');
select throws_ok(
  $$insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points)
    values ('10000000-0000-0000-0000-000000000001', '2030-01-07', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', 0, 0)$$,
  '42501', null, 'anon cannot insert a matchup');
select throws_ok($$update public.matchups set home_start_points = 99$$, '42501', null, 'anon cannot update a matchup');
select throws_ok($$delete from public.matchups$$, '42501', null, 'anon cannot delete a matchup');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-07', '[]', '[]')$$,
  '42501', null, 'anon cannot run the rollover');
reset role;

select pg_temp.set_caller('00000000-0000-0000-0000-000000000001', 'authenticated');
select throws_ok(
  $$insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points)
    values ('10000000-0000-0000-0000-000000000001', '2030-01-07', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', 0, 0)$$,
  '42501', null, 'a signed-in member cannot insert a matchup');
select throws_ok($$update public.matchups set home_start_points = 99$$, '42501', null, 'a signed-in member cannot update a matchup');
select throws_ok($$delete from public.matchups$$, '42501', null, 'a signed-in member cannot delete a matchup');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-07', '[]', '[]')$$,
  '42501', null, 'a signed-in member cannot run the rollover');
reset role;

select is(
  (select count(*)::int
   from unnest(array['anon', 'authenticated']) r
   cross join unnest(array['insert', 'update', 'delete', 'truncate']) p
   where has_table_privilege(r, 'public.matchups', p)),
  0, 'neither client role holds a write privilege on matchups, even before RLS');
select ok(has_table_privilege('anon', 'public.matchups', 'select'), 'anon holds select');
select ok(has_table_privilege('authenticated', 'public.matchups', 'select'), 'authenticated holds select');
select ok(
  not has_function_privilege('anon', 'public.roll_matchup_week(uuid, date, jsonb, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.roll_matchup_week(uuid, date, jsonb, jsonb)', 'execute'),
  'neither client role can execute roll_matchup_week');
select ok(has_function_privilege('service_role', 'public.roll_matchup_week(uuid, date, jsonb, jsonb)', 'execute'), 'service_role can execute roll_matchup_week');

-- ===== roll_matchup_week =====
-- Start from an empty table so only the function's own rows are counted.
delete from public.matchups;
select pg_temp.set_caller(null, 'service_role');

select is(
  public.roll_matchup_week(
    '10000000-0000-0000-0000-000000000001', '2030-01-07', '[]',
    '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 10, "away_start_points": 8.5},
      {"home_team_id": "50000000-0000-0000-0000-000000000003", "away_team_id": "50000000-0000-0000-0000-000000000004", "home_start_points": 6, "away_start_points": 4}]'),
  '{"rolled": true, "finalized": 0, "created": 2}'::jsonb,
  'the first call for a week creates its matchups and finalizes nothing');
select is((select count(*)::int from public.matchups where week_start = '2030-01-07'), 2, 'two rows exist for the week');
select is(
  (select home_start_points::text || '/' || away_start_points::text from public.matchups where home_team_id = '50000000-0000-0000-0000-000000000001'),
  '10.0000/8.5000', 'the start points are stored as given');
select is((select count(*)::int from public.matchups where finalized_at is not null), 0, 'a first week has nothing to finalize');

select is(
  public.roll_matchup_week(
    '10000000-0000-0000-0000-000000000001', '2030-01-07', '[]',
    '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000003", "home_start_points": 99, "away_start_points": 99}]'),
  '{"rolled": false, "finalized": 0, "created": 0}'::jsonb,
  'a second call for the same week reports it already existed');
select is((select count(*)::int from public.matchups), 2, 'and adds no rows');
select is(
  (select home_start_points::text from public.matchups where home_team_id = '50000000-0000-0000-0000-000000000001'),
  '10.0000', 'and changes no start points');

-- The next week: closes the open rows with the given totals and opens new ones.
select is(
  public.roll_matchup_week(
    '10000000-0000-0000-0000-000000000001', '2030-01-14',
    '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 14.25},
      {"team_id": "50000000-0000-0000-0000-000000000002", "points": 9},
      {"team_id": "50000000-0000-0000-0000-000000000003", "points": 7},
      {"team_id": "50000000-0000-0000-0000-000000000004", "points": 7.5},
      {"team_id": "50000000-0000-0000-0000-000000000005", "points": 100}]',
    '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000003", "home_start_points": 14.25, "away_start_points": 7},
      {"home_team_id": "50000000-0000-0000-0000-000000000004", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 7.5, "away_start_points": 9}]'),
  '{"rolled": true, "finalized": 2, "created": 2}'::jsonb,
  'the next week finalizes last week''s open rows and creates its own');
select is(
  (select home_end_points::text || '/' || away_end_points::text from public.matchups
   where week_start = '2030-01-07' and home_team_id = '50000000-0000-0000-0000-000000000001'),
  '14.2500/9.0000', 'each side got its own team''s total as end points');
select is(
  (select home_end_points::text || '/' || away_end_points::text from public.matchups
   where week_start = '2030-01-07' and home_team_id = '50000000-0000-0000-0000-000000000003'),
  '7.0000/7.5000', 'including the other pairing');
select is((select count(*)::int from public.matchups where week_start = '2030-01-07' and finalized_at is not null), 2, 'both last-week rows are stamped finalized');
select is((select count(*)::int from public.matchups where week_start = '2030-01-14' and finalized_at is null and home_end_points is null), 2, 'the new week''s rows are open');
select is(public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-14', '[]', '[]') ->> 'rolled', 'false', 'repeating that call is a no-op');

-- A week that already has rows changes nothing at all: last week's open rows stay open.
reset role;
insert into public.matchups (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points)
values ('10000000-0000-0000-0000-000000000001', '2030-01-21', '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 0, 0);
select pg_temp.set_caller(null, 'service_role');
select is(
  public.roll_matchup_week(
    '10000000-0000-0000-0000-000000000001', '2030-01-21',
    '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 20},
      {"team_id": "50000000-0000-0000-0000-000000000002", "points": 20},
      {"team_id": "50000000-0000-0000-0000-000000000003", "points": 20},
      {"team_id": "50000000-0000-0000-0000-000000000004", "points": 20}]',
    '[{"home_team_id": "50000000-0000-0000-0000-000000000003", "away_team_id": "50000000-0000-0000-0000-000000000004", "home_start_points": 20, "away_start_points": 20}]'),
  '{"rolled": false, "finalized": 0, "created": 0}'::jsonb,
  'a week that already has any row is reported as existing');
select is((select count(*)::int from public.matchups where week_start = '2030-01-14' and finalized_at is null), 2, 'and it finalized nothing');
reset role;
delete from public.matchups where week_start = '2030-01-21';
select pg_temp.set_caller(null, 'service_role');

-- Failures. Each leaves the week 2030-01-14 open and 2030-01-21 empty, which the last check of this
-- block confirms.
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[]',
    '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1},
      {"home_team_id": "50000000-0000-0000-0000-000000000003", "away_team_id": "50000000-0000-0000-0000-000000000001", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'duplicate_team', 'a team home in one pairing and away in another is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[]',
    '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1},
      {"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000004", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'duplicate_team', 'a team home in two pairings is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21',
    '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 1},
      {"team_id": "50000000-0000-0000-0000-000000000003", "points": 1},
      {"team_id": "50000000-0000-0000-0000-000000000004", "points": 1},
      {"team_id": "50000000-0000-0000-0000-000000000002", "points": null}]',
    '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'invalid_finals', 'a final whose points are null is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21',
    '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 1},
      {"team_id": "50000000-0000-0000-0000-000000000002", "points": 1},
      {"team_id": "50000000-0000-0000-0000-000000000003", "points": 1}]',
    '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'missing_final', 'an open row whose team is absent from the finals is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-22', '[]',
    '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'invalid_week_start', 'a week that does not start on a Monday is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000009', '2030-01-21', '[]',
    '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'season_not_found', 'an unknown season is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[]',
    '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1}]')$$,
  'P0001', 'invalid_pairings', 'a pairing without both start points is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21',
    '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000001", "points": 2}]',
    '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'invalid_finals', 'a team given two finals is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21',
    '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 1},
      {"team_id": "50000000-0000-0000-0000-000000000002", "points": 1},
      {"team_id": "50000000-0000-0000-0000-000000000003", "points": 1},
      {"team_id": "50000000-0000-0000-0000-000000000004", "points": 1}]',
    '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000005", "home_start_points": 1, "away_start_points": 1}]')$$,
  '23503', null, 'a pairing with a team of another season is rejected, and the finalizing rolls back with it');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000002", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000003", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000004", "points": 1}]', null)$$,
  'P0001', 'invalid_pairings', 'null pairings are rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000002", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000003", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000004", "points": 1}]', '{"a": 1}')$$,
  'P0001', 'invalid_pairings', 'pairings that are not an array are rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000002", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000003", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000004", "points": 1}]', '[1]')$$,
  'P0001', 'invalid_pairings', 'a pairing that is not an object is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000002", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000003", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000004", "points": 1}]', '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": "5", "away_start_points": 1}]')$$,
  'P0001', 'invalid_pairings', 'a start point given as a string is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000002", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000003", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000004", "points": 1}]', '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": "NaN", "away_start_points": 1}]')$$,
  'P0001', 'invalid_pairings', 'the string NaN as a start point is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000002", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000003", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000004", "points": 1}]', '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": null}]')$$,
  'P0001', 'invalid_pairings', 'a null start point is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000002", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000003", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000004", "points": 1}]', '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 100000}]')$$,
  'P0001', 'invalid_pairings', 'a start point too large for the column is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000002", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000003", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000004", "points": 1}]', '[{"home_team_id": "not-a-uuid", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'invalid_pairings', 'a malformed team id in a pairing is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000002", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000003", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000004", "points": 1}]', '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": 5, "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'invalid_pairings', 'a team id that is not a string is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000002", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000003", "points": 1}, {"team_id": "50000000-0000-0000-0000-000000000004", "points": 1}]', '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000001", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'duplicate_team', 'a team paired with itself is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', null, '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'invalid_finals', 'a null finals value is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '{"a": 1}', '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'invalid_finals', 'finals that are not an array are rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[1]', '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'invalid_finals', 'a final that is not an object is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[{"team_id": null, "points": 1}]', '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'invalid_finals', 'a final with a null team id is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[{"points": 1}]', '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'invalid_finals', 'a final with no team id is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[{"team_id": "not-a-uuid", "points": 1}]', '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'invalid_finals', 'a malformed team id in a final is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": "NaN"}]', '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'invalid_finals', 'the string NaN as final points is rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": "7"}]', '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'invalid_finals', 'final points given as a string are rejected');
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": -100000}]', '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'invalid_finals', 'final points too large for the column are rejected');
select is(
  (select count(*)::int from public.matchups where week_start = '2030-01-14' and finalized_at is null)
  || '/' || (select count(*)::int from public.matchups where week_start = '2030-01-21'),
  '2/0', 'after every failure the open week is still open and the next week was not created');

-- A missed week: week 2030-01-28 closes the still-open 2030-01-14 rows, and leaves the already
-- final 2030-01-07 rows as they were.
select is(
  public.roll_matchup_week(
    '10000000-0000-0000-0000-000000000001', '2030-01-28',
    '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 30},
      {"team_id": "50000000-0000-0000-0000-000000000002", "points": 30},
      {"team_id": "50000000-0000-0000-0000-000000000003", "points": 30},
      {"team_id": "50000000-0000-0000-0000-000000000004", "points": 30}]',
    '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 30.12345, "away_start_points": 30},
      {"home_team_id": "50000000-0000-0000-0000-000000000003", "away_team_id": "50000000-0000-0000-0000-000000000004", "home_start_points": 30, "away_start_points": 30}]') ->> 'finalized',
  '2', 'a skipped Monday''s open rows are closed by the next rollover');
select is(
  (select home_end_points::text from public.matchups where week_start = '2030-01-07' and home_team_id = '50000000-0000-0000-0000-000000000001'),
  '14.2500', 'and a week that was already final keeps its result');
select is(
  (select home_start_points::text from public.matchups where week_start = '2030-01-28' and home_team_id = '50000000-0000-0000-0000-000000000001'),
  '30.1235', 'a fifth decimal is rounded half away from zero by the column (30.12345 becomes 30.1235)');

-- Out of order: a week earlier than one the season already has is rejected, and nothing is written.
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-21', '[]',
    '[{"home_team_id": "50000000-0000-0000-0000-000000000001", "away_team_id": "50000000-0000-0000-0000-000000000002", "home_start_points": 1, "away_start_points": 1}]')$$,
  'P0001', 'week_out_of_order', 'a week before the season''s latest week is rejected');
select is((select count(*)::int from public.matchups where week_start = '2030-01-21'), 0, 'and no row was created for it');
select is(
  public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-01-28', '[]', '[]') ->> 'rolled',
  'false', 'a repeat for the existing latest week is still a no-op, not out of order');

-- Close only: an empty pairing list ends the season's last week and opens nothing.
select throws_ok(
  $$select public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-02-04',
    '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 40},
      {"team_id": "50000000-0000-0000-0000-000000000002", "points": 40},
      {"team_id": "50000000-0000-0000-0000-000000000003", "points": 40}]', '[]')$$,
  'P0001', 'missing_final', 'a close-only call still needs a final for every open row');
select is(
  public.roll_matchup_week(
    '10000000-0000-0000-0000-000000000001', '2030-02-04',
    '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 40.00005},
      {"team_id": "50000000-0000-0000-0000-000000000002", "points": 41},
      {"team_id": "50000000-0000-0000-0000-000000000003", "points": 42},
      {"team_id": "50000000-0000-0000-0000-000000000004", "points": 43}]', '[]'),
  '{"rolled": true, "finalized": 2, "created": 0}'::jsonb,
  'close-only finalizes the open rows and creates none');
select is((select count(*)::int from public.matchups where week_start = '2030-02-04'), 0, 'and no row exists for the closing week');
select is(
  (select home_end_points::text || '/' || away_end_points::text from public.matchups where week_start = '2030-01-28' and home_team_id = '50000000-0000-0000-0000-000000000001'),
  '40.0001/41.0000', 'the closed rows carry the given totals (a fifth decimal in an end point rounds the same way)');
select is((select count(*)::int from public.matchups where finalized_at is null), 0, 'nothing is left open');
select is(
  public.roll_matchup_week('10000000-0000-0000-0000-000000000001', '2030-02-04',
    '[{"team_id": "50000000-0000-0000-0000-000000000001", "points": 99}]', '[]'),
  '{"rolled": false, "finalized": 0, "created": 0}'::jsonb,
  'repeating a close-only call changes nothing and reports rolled false');
select is(
  (select home_end_points::text from public.matchups where week_start = '2030-01-28' and home_team_id = '50000000-0000-0000-0000-000000000001'),
  '40.0001', 'and leaves the result alone');
reset role;

-- ===== rollover jobs =====
select is((select count(*)::int from cron.job where jobname in ('cincy-matchups-edt', 'cincy-matchups-est', 'cincy-matchups-retry')), 3, 'all three matchups rollover jobs are scheduled');
select is((select schedule from cron.job where jobname = 'cincy-matchups-edt'), '45 10 * * *', 'the EDT job runs daily at 10:45 UTC (6:45 am Eastern)');
select is((select schedule from cron.job where jobname = 'cincy-matchups-est'), '45 11 * * *', 'the EST job runs daily at 11:45 UTC (6:45 am Eastern)');
select is((select schedule from cron.job where jobname = 'cincy-matchups-retry'), '15 12 * * *', 'the retry job runs daily at 12:15 UTC (7:15 am EST, 8:15 am EDT)');
select ok(
  (select bool_and(command like '%https://www.cincysports.xyz/api/cron/matchups%' and command like '%cron_secret%')
   from cron.job where jobname in ('cincy-matchups-edt', 'cincy-matchups-est', 'cincy-matchups-retry')),
  'all three jobs call the matchups route with the vault bearer');

select * from finish();
rollback;
