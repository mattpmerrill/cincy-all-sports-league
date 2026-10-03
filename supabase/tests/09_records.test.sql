-- Participant records: readable by everyone, writable only by the service (sync), with the
-- constraints and cascades the sync upsert relies on. Fixtures are self-contained.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into public.seasons (id, name, starts_on, ends_on)
values ('10000000-0000-0000-0000-000000000001', 'test-season', '2030-01-01', '2030-12-31');
insert into public.sports (id, code, name, participant_kind, espn_sport, espn_league)
values ('20000000-0000-0000-0000-000000000001', 'aa', 'Sport A', 'team', 'testa', 'a');
insert into public.participants (id, sport_id, name, short_name) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Alpha', 'A'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Beta', 'B');
insert into public.participant_records (season_id, participant_id, wins, losses, ties, ot_losses)
values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 10, 4, 1, 2);
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

-- ===== allow: everyone reads =====
select pg_temp.set_caller(null, 'anon');
select is(
  (select wins || '-' || losses || '-' || ties || '-' || ot_losses from public.participant_records),
  '10-4-1-2', 'anon reads a record');
reset role;
select pg_temp.set_caller('00000000-0000-0000-0000-000000000001', 'authenticated');
select isnt_empty($$select 1 from public.participant_records$$, 'a signed-in member reads records');
reset role;

-- ===== deny: no client write path, not even for an admin =====
select pg_temp.set_caller(null, 'anon');
select throws_ok(
  $$insert into public.participant_records (season_id, participant_id, wins)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 5)$$,
  '42501', null, 'anon cannot insert a record');
select throws_ok($$update public.participant_records set wins = 99$$, '42501', null, 'anon cannot update a record');
select throws_ok($$delete from public.participant_records$$, '42501', null, 'anon cannot delete a record');
reset role;

select pg_temp.set_caller('00000000-0000-0000-0000-000000000001', 'authenticated');
select throws_ok(
  $$insert into public.participant_records (season_id, participant_id, wins)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 5)$$,
  '42501', null, 'a member cannot insert a record');
select throws_ok($$update public.participant_records set wins = 99$$, '42501', null, 'a member cannot update a record');
select throws_ok($$delete from public.participant_records$$, '42501', null, 'a member cannot delete a record');
reset role;

-- Unlike participant_results, admins have no write path either: a record is ESPN's number.
select pg_temp.set_caller('00000000-0000-0000-0000-000000000002', 'authenticated');
select throws_ok($$update public.participant_records set wins = 99$$, '42501', null, 'an admin cannot update a record');
select throws_ok($$delete from public.participant_records$$, '42501', null, 'an admin cannot delete a record');
reset role;

select is(
  (select count(*)::int
   from unnest(array['anon', 'authenticated']) r
   cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
   where has_table_privilege(r, 'public.participant_records', p)),
  0, 'anon and authenticated hold no write privilege on records');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'participant_records' and cmd <> 'SELECT'),
  0, 'records have no write policies');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'participant_records' and cmd = 'SELECT'),
  1, 'records have exactly one read policy');
select is(
  (select relrowsecurity from pg_class where oid = 'public.participant_records'::regclass),
  true, 'RLS is enabled on records');

-- ===== allow: the service writes, and the upsert sync relies on is idempotent =====
select pg_temp.set_caller(null, 'service_role');
select lives_ok(
  $$insert into public.participant_records (season_id, participant_id, wins, losses, ties, ot_losses)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 3, 5, 0, 1)
    on conflict (season_id, participant_id)
    do update set wins = excluded.wins, losses = excluded.losses, ties = excluded.ties, ot_losses = excluded.ot_losses$$,
  'the service role inserts a record');
select lives_ok(
  $$insert into public.participant_records (season_id, participant_id, wins, losses, ties, ot_losses)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 4, 5, 0, 1)
    on conflict (season_id, participant_id)
    do update set wins = excluded.wins, losses = excluded.losses, ties = excluded.ties, ot_losses = excluded.ot_losses$$,
  'the same key upserts instead of failing');
select is(
  (select count(*)::int from public.participant_records where participant_id = '40000000-0000-0000-0000-000000000002'),
  1, 'the upsert kept one row per season and participant');
select is(
  (select wins from public.participant_records where participant_id = '40000000-0000-0000-0000-000000000002'),
  4, 'the upsert applied the new value');
reset role;

-- ===== constraints =====
select throws_ok(
  $$update public.participant_records set losses = -1$$,
  '23514', null, 'a negative count is rejected');
select throws_ok(
  $$insert into public.participant_records (season_id, participant_id)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000099')$$,
  '23503', null, 'a record needs a real participant');

-- updated_at moves on update (the set_updated_at trigger), created_at does not.
update public.participant_records set updated_at = '2000-01-01', created_at = '2000-01-01'
where participant_id = '40000000-0000-0000-0000-000000000001';
update public.participant_records set wins = 11 where participant_id = '40000000-0000-0000-0000-000000000001';
select is(
  (select updated_at > '2000-01-01' and created_at = '2000-01-01' from public.participant_records
   where participant_id = '40000000-0000-0000-0000-000000000001'),
  true, 'updated_at is bumped on update and created_at is not');

-- ===== cascades =====
delete from public.participants where id = '40000000-0000-0000-0000-000000000002';
select is(
  (select count(*)::int from public.participant_records where participant_id = '40000000-0000-0000-0000-000000000002'),
  0, 'deleting a participant deletes its record');
delete from public.seasons where id = '10000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.participant_records), 0, 'deleting a season deletes its records');

select * from finish();
rollback;
