-- Games: schema constraints, public read, no client writes (allow AND deny), service_role writes,
-- foreign-key behaviour, and the two refresh jobs. Fixtures are self-contained.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

-- The seed may already have an active season; only one can be active at a time.
update public.seasons set is_active = false;
insert into public.seasons (id, name, starts_on, ends_on, is_active) values
  ('10000000-0000-0000-0000-000000000001', 'test-season', '2030-01-01', '2030-12-31', true),
  ('10000000-0000-0000-0000-000000000002', 'other-season', '2031-01-01', '2031-12-31', false);
-- aa and bb are in the first season; cc exists but has no season_sports row there.
insert into public.sports (id, code, name, participant_kind, espn_sport, espn_league) values
  ('20000000-0000-0000-0000-000000000001', 'aa', 'Sport A', 'team', 'testa', 'a'),
  ('20000000-0000-0000-0000-000000000002', 'bb', 'Sport B', 'team', 'testb', 'b'),
  ('20000000-0000-0000-0000-000000000003', 'cc', 'Sport C', 'team', 'testc', 'c');
insert into public.season_sports (season_id, sport_id, starts_on, espn_season) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2030-01-01', 2030),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '2030-01-01', 2030),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '2031-01-01', 2031);
insert into public.participants (id, sport_id, name, short_name, espn_id) values
  ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'Alpha One', 'A1', '101'),
  ('40000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-000000000001', 'Alpha Two', 'A2', '102'),
  ('40000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000002', 'Beta One', 'B1', '201');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'member@example.com');

-- One stored game to read and to try to change (as the table owner, so RLS is out of the way).
insert into public.games (
  id, season_id, sport_id, external_id, starts_at,
  home_external_id, home_participant_id, home_name, home_short_name,
  away_external_id, away_participant_id, away_name, away_short_name
) values (
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'evt-1',
  '2030-01-05 18:00+00',
  '101', '40000000-0000-0000-0000-0000000000a1', 'Alpha One', 'A1',
  '102', '40000000-0000-0000-0000-0000000000a2', 'Alpha Two', 'A2'
);

create function pg_temp.set_caller(uid uuid, role_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', role_name)::text, true);
  execute format('set local role %I', role_name);
end $$;
grant execute on function pg_temp.set_caller(uuid, text) to public;

-- ===== shape =====
select has_table('public', 'games', 'the games table exists');
select enum_has_labels(
  'public', 'game_status',
  array['scheduled', 'in_progress', 'final', 'postponed', 'canceled'],
  'game_status mirrors GAME_STATUSES in the domain');
select ok((select relrowsecurity from pg_class where oid = 'public.games'::regclass), 'RLS is on for games');
select has_index('public', 'games', 'games_season_starts_at_idx', 'the week read is indexed by season and start');
select has_index('public', 'games', 'games_home_participant_idx', 'home participant lookups are indexed');
select has_index('public', 'games', 'games_away_participant_idx', 'away participant lookups are indexed');

select is(
  (select status::text || '/' || time_tbd::text || '/' || neutral_site::text from public.games where external_id = 'evt-1'),
  'scheduled/false/false', 'a new game defaults to scheduled, time set, home-field');

-- ===== constraints =====
select throws_ok(
  $$insert into public.games (season_id, sport_id, external_id, starts_at, home_external_id, home_name, home_short_name, away_external_id, away_name, away_short_name)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'evt-1', now(), '1', 'H', 'H', '2', 'A', 'A')$$,
  '23505', null, 'one vendor event id per sport: a repeat is a unique violation (the upsert key)');
select lives_ok(
  $$insert into public.games (season_id, sport_id, external_id, starts_at, home_external_id, home_name, home_short_name, away_external_id, away_name, away_short_name)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'evt-1', now(), '1', 'H', 'H', '2', 'A', 'A')$$,
  'the same event id in another sport is a different game');
select throws_ok(
  $$insert into public.games (season_id, sport_id, external_id, starts_at, home_external_id, home_name, home_short_name, away_external_id, away_name, away_short_name)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'evt-9', now(), '1', 'H', 'H', '2', 'A', 'A')$$,
  '23503', null, 'a game cannot use a sport that is not part of its season');
select throws_ok(
  $$insert into public.games (season_id, sport_id, external_id, starts_at, home_external_id, home_participant_id, home_name, home_short_name, away_external_id, away_name, away_short_name)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'evt-2', now(), '201', '40000000-0000-0000-0000-0000000000b1', 'Beta One', 'B1', '2', 'A', 'A')$$,
  '23503', null, 'a side cannot point at a participant of another sport (home)');
select throws_ok(
  $$insert into public.games (season_id, sport_id, external_id, starts_at, home_external_id, home_name, home_short_name, away_external_id, away_participant_id, away_name, away_short_name)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'evt-3', now(), '1', 'H', 'H', '201', '40000000-0000-0000-0000-0000000000b1', 'Beta One', 'B1')$$,
  '23503', null, 'a side cannot point at a participant of another sport (away)');
select throws_ok(
  $$insert into public.games (season_id, sport_id, external_id, starts_at, home_external_id, home_name, home_short_name, home_score, away_external_id, away_name, away_short_name)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'evt-4', now(), '1', 'H', 'H', -1, '2', 'A', 'A')$$,
  '23514', null, 'a score cannot be negative');
select throws_ok(
  $$insert into public.games (season_id, sport_id, external_id, starts_at, home_external_id, home_name, home_short_name, away_external_id, away_name, away_short_name)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'evt-5', now(), '1', '  ', 'H', '2', 'A', 'A')$$,
  '23514', null, 'a side needs a name');
select throws_ok(
  $$insert into public.games (season_id, sport_id, external_id, starts_at, home_external_id, home_name, home_short_name, away_external_id, away_name, away_short_name, status)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'evt-6', now(), '1', 'H', 'H', '2', 'A', 'A', 'rained_out')$$,
  '22P02', null, 'status must be one of the enum labels');

-- updated_at: the trigger overrides whatever the writer sends.
update public.games set updated_at = '2000-01-01', status = 'in_progress', home_score = 3, away_score = 2
  where external_id = 'evt-1' and sport_id = '20000000-0000-0000-0000-000000000001';
select ok(
  (select updated_at > '2000-01-02' from public.games where id = '60000000-0000-0000-0000-000000000001'),
  'updating a game stamps updated_at');

-- ===== foreign-key behaviour =====
delete from public.participants where id = '40000000-0000-0000-0000-0000000000a2';
select is(
  (select away_participant_id::text from public.games where id = '60000000-0000-0000-0000-000000000001'),
  null, 'deleting a participant clears that side''s participant id');
select is(
  (select away_name || '/' || home_participant_id::text || '/' || sport_id::text from public.games where id = '60000000-0000-0000-0000-000000000001'),
  'Alpha Two/40000000-0000-0000-0000-0000000000a1/20000000-0000-0000-0000-000000000001',
  'but keeps the game, its stored name, the other side and the sport');

insert into public.games (season_id, sport_id, external_id, starts_at, home_external_id, home_name, home_short_name, away_external_id, away_name, away_short_name)
values ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'evt-other', '2031-01-05 18:00+00', '1', 'H', 'H', '2', 'A', 'A');
select is((select count(*)::int from public.games where season_id = '10000000-0000-0000-0000-000000000002'), 1, 'before the delete, the other season has a game');
delete from public.seasons where id = '10000000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.games where external_id = 'evt-other'), 0, 'deleting a season deletes its games');
select is((select count(*)::int from public.games where season_id = '10000000-0000-0000-0000-000000000001'), 2, 'other seasons'' games are untouched');

-- ===== allow: everyone reads =====
select pg_temp.set_caller(null, 'anon');
select isnt_empty($$select 1 from public.games$$, 'anon reads games');
reset role;
select pg_temp.set_caller('00000000-0000-0000-0000-000000000001', 'authenticated');
select isnt_empty($$select 1 from public.games$$, 'a signed-in member reads games');
reset role;

-- ===== deny: no client writes =====
select pg_temp.set_caller(null, 'anon');
select throws_ok(
  $$insert into public.games (season_id, sport_id, external_id, starts_at, home_external_id, home_name, home_short_name, away_external_id, away_name, away_short_name)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'evt-anon', now(), '1', 'H', 'H', '2', 'A', 'A')$$,
  '42501', null, 'anon cannot insert a game');
select throws_ok($$update public.games set home_score = 99$$, '42501', null, 'anon cannot update a game');
select throws_ok($$delete from public.games$$, '42501', null, 'anon cannot delete a game');
reset role;

select pg_temp.set_caller('00000000-0000-0000-0000-000000000001', 'authenticated');
select throws_ok(
  $$insert into public.games (season_id, sport_id, external_id, starts_at, home_external_id, home_name, home_short_name, away_external_id, away_name, away_short_name)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'evt-member', now(), '1', 'H', 'H', '2', 'A', 'A')$$,
  '42501', null, 'a signed-in member cannot insert a game');
select throws_ok($$update public.games set home_score = 99$$, '42501', null, 'a signed-in member cannot update a game');
select throws_ok($$delete from public.games$$, '42501', null, 'a signed-in member cannot delete a game');
reset role;

select is(
  (select count(*)::int
   from unnest(array['anon', 'authenticated']) r
   cross join unnest(array['insert', 'update', 'delete', 'truncate']) p
   where has_table_privilege(r, 'public.games', p)),
  0, 'neither client role holds a write privilege on games, even before RLS');
select ok(has_table_privilege('anon', 'public.games', 'select'), 'anon holds select');
select ok(has_table_privilege('authenticated', 'public.games', 'select'), 'authenticated holds select');

-- ===== allow: the service role writes =====
select pg_temp.set_caller(null, 'service_role');
select lives_ok(
  $$insert into public.games (season_id, sport_id, external_id, starts_at, home_external_id, home_name, home_short_name, away_external_id, away_name, away_short_name)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'evt-svc', now(), '1', 'H', 'H', '2', 'A', 'A')$$,
  'the service role can insert a game');
select lives_ok(
  $$insert into public.games (season_id, sport_id, external_id, starts_at, home_external_id, home_name, home_short_name, away_external_id, away_name, away_short_name)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'evt-svc', now(), '1', 'H', 'H', '2', 'A', 'A')
    on conflict (sport_id, external_id) do update set status = 'final', home_score = 4$$,
  'and the refresh''s upsert on (sport, event id) updates it in place');
select is((select status::text || '/' || home_score::text from public.games where external_id = 'evt-svc'), 'final/4', 'the upsert changed the stored game');
select lives_ok($$delete from public.games where external_id = 'evt-svc'$$, 'the service role can delete a game');
reset role;

-- ===== refresh jobs =====
select is((select count(*)::int from cron.job where jobname in ('cincy-games-live', 'cincy-games-weeks')), 2, 'both games refresh jobs are scheduled');
select is((select schedule from cron.job where jobname = 'cincy-games-live'), '10,40 * * * *', 'the live job runs every 30 minutes, ten minutes off the score sync');
select ok(
  (select command like '%/api/cron/games?range=live%' and command like '%cron_secret%' from cron.job where jobname = 'cincy-games-live'),
  'the live job calls the games route with the vault bearer');
select is((select schedule from cron.job where jobname = 'cincy-games-weeks'), '25 9 * * *', 'the weeks job runs daily at 09:25 UTC');
select ok(
  (select command like '%/api/cron/games?range=weeks%' and command like '%cron_secret%' from cron.job where jobname = 'cincy-games-weeks'),
  'the weeks job calls the games route with the vault bearer');

select * from finish();
rollback;
