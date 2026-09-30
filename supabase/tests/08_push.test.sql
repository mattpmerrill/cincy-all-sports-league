-- Web Push: subscription and send-ledger constraints, the service_role-only boundary on both
-- tables and all three functions (including the row's own owner being denied), the profile push_*
-- switches and their column grants, device registration (upsert, ownership move, cap, not_found),
-- per-topic targeting, failure counting and pruning, send dedupe, cascade, and the cleanup job.
-- Fixtures are self-contained.
begin;
create extension if not exists pgtap with schema extensions;
select plan(102);

create function pg_temp.set_caller(uid uuid, role_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', role_name)::text, true);
  execute format('set local role %I', role_name);
end $$;
grant execute on function pg_temp.set_caller(uuid, text) to public;

-- Short forms: user n, a distinct valid endpoint, and keys that satisfy the length checks.
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
grant execute on function pg_temp.u(int) to public;
create function pg_temp.ep(k text) returns text language sql as $$ select 'https://push.example.com/send/' || k $$;
grant execute on function pg_temp.ep(text) to public;
create function pg_temp.p256(n int) returns text language sql as $$ select rpad('P' || n, 87, 'x') $$;
grant execute on function pg_temp.p256(int) to public;
create function pg_temp.authkey(n int) returns text language sql as $$ select rpad('A' || n, 22, 'y') $$;
grant execute on function pg_temp.authkey(int) to public;
-- Direct insert (as the test's superuser) for fixtures that need exact timestamps.
create function pg_temp.sub(uid int, k text, age interval default interval '0') returns void language sql as $$
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, created_at, updated_at)
  values (pg_temp.u(uid), pg_temp.ep(k), pg_temp.p256(uid), pg_temp.authkey(uid), now() - age, now() - age) $$;

-- u1..u6 are members; u7 is an id with no profile.
insert into auth.users (id, email)
select pg_temp.u(n), 'push' || n || '@example.com' from generate_series(1, 6) n;

-- u1 owns one device and one ledger row: the fixtures for the "owner is denied too" checks.
select pg_temp.sub(1, 'owner-device');
insert into public.push_sends (recipient_id, dedupe_key) values (pg_temp.u(1), 'fixture');

-- ===== schema =====
select has_table('public', 'push_subscriptions', 'push_subscriptions exists');
select has_table('public', 'push_sends', 'push_sends exists');
select is((select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass), true, 'RLS is enabled on push_subscriptions');
select is((select relrowsecurity from pg_class where oid = 'public.push_sends'::regclass), true, 'RLS is enabled on push_sends');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('push_subscriptions', 'push_sends')),
  0, 'neither table has any policy');
select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder) from pg_enum e where e.enumtypid = 'public.push_topic'::regtype),
  array['trades', 'feed', 'scores'], 'push_topic has the three alert topics');
select is(
  (select count(*)::int from public.profiles where push_trades and push_feed and push_scores),
  (select count(*)::int from public.profiles), 'every profile starts with all three push switches on');

select throws_ok(
  $$select pg_temp.sub(2, 'owner-device')$$,
  '23505', null, 'an endpoint can exist only once across all members');
select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (pg_temp.u(2), 'http://push.example.com/x', pg_temp.p256(2), pg_temp.authkey(2))$$,
  '23514', null, 'a plain http endpoint is rejected');
select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (pg_temp.u(2), 'https://push.example.com/a b', pg_temp.p256(2), pg_temp.authkey(2))$$,
  '23514', null, 'an endpoint with whitespace is rejected');
select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (pg_temp.u(2), 'https://push.example.com/' || repeat('a', 1000), pg_temp.p256(2), pg_temp.authkey(2))$$,
  '23514', null, 'an endpoint over 1024 characters is rejected');
select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (pg_temp.u(2), pg_temp.ep('bad1'), repeat('x', 86), pg_temp.authkey(2))$$,
  '23514', null, 'a p256dh key that is not 87 characters is rejected');
select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (pg_temp.u(2), pg_temp.ep('bad2'), repeat('x', 86) || '=', pg_temp.authkey(2))$$,
  '23514', null, 'a padded or non-base64url p256dh key is rejected');
select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (pg_temp.u(2), pg_temp.ep('bad3'), pg_temp.p256(2), repeat('y', 21))$$,
  '23514', null, 'an auth secret that is not 22 characters is rejected');
select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, failure_count) values (pg_temp.u(2), pg_temp.ep('bad4'), pg_temp.p256(2), pg_temp.authkey(2), -1)$$,
  '23514', null, 'a negative failure_count is rejected');
select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device_label) values (pg_temp.u(2), pg_temp.ep('bad5'), pg_temp.p256(2), pg_temp.authkey(2), '   ')$$,
  '23514', null, 'a blank device label is rejected');
select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device_label) values (pg_temp.u(2), pg_temp.ep('bad6'), pg_temp.p256(2), pg_temp.authkey(2), repeat('d', 41))$$,
  '23514', null, 'a device label over 40 characters is rejected');
select throws_ok(
  $$insert into public.push_sends (recipient_id, dedupe_key) values (pg_temp.u(2), '')$$,
  '23514', null, 'an empty dedupe key is rejected');
select throws_ok(
  $$insert into public.push_sends (recipient_id, dedupe_key) values (pg_temp.u(2), repeat('k', 201))$$,
  '23514', null, 'a dedupe key over 200 characters is rejected');

-- ===== privileges: nobody but service_role touches either table =====
select is(
  (select count(*)::int
   from unnest(array['public.push_subscriptions', 'public.push_sends']) t
   cross join unnest(array['anon', 'authenticated']) r
   cross join unnest(array['select', 'insert', 'update', 'delete']) p
   where has_table_privilege(r, t, p)),
  0, 'anon and authenticated hold no privilege on either table');
select is(
  (select count(*)::int
   from unnest(array['public.push_subscriptions', 'public.push_sends']) t
   cross join unnest(array['select', 'insert', 'update', 'delete']) p
   where has_table_privilege('service_role', t, p)),
  8, 'service_role can select, insert, update and delete on both tables');

-- Each check below names the row's own owner (u1) for the signed-in case: owning the row grants
-- nothing, because there is no policy and no grant to fall back on.
select pg_temp.set_caller(pg_temp.u(1), 'authenticated');
select throws_ok($$select * from public.push_subscriptions$$, '42501', null, 'the owner cannot read their own subscription');
select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (pg_temp.u(1), pg_temp.ep('own-insert'), pg_temp.p256(1), pg_temp.authkey(1))$$,
  '42501', null, 'the owner cannot insert a subscription');
select throws_ok($$update public.push_subscriptions set failure_count = 0$$, '42501', null, 'the owner cannot update their own subscription');
select throws_ok($$delete from public.push_subscriptions$$, '42501', null, 'the owner cannot delete their own subscription');
select throws_ok($$select * from public.push_sends$$, '42501', null, 'the owner cannot read the send ledger');
select throws_ok(
  $$insert into public.push_sends (recipient_id, dedupe_key) values (pg_temp.u(1), 'own-insert')$$,
  '42501', null, 'the owner cannot write the send ledger');
select throws_ok($$update public.push_sends set dedupe_key = 'x'$$, '42501', null, 'the owner cannot update the send ledger');
select throws_ok($$delete from public.push_sends$$, '42501', null, 'the owner cannot delete from the send ledger');
reset role;

select pg_temp.set_caller(null, 'anon');
select throws_ok($$select * from public.push_subscriptions$$, '42501', null, 'anon cannot read subscriptions');
select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (pg_temp.u(1), pg_temp.ep('anon-insert'), pg_temp.p256(1), pg_temp.authkey(1))$$,
  '42501', null, 'anon cannot insert a subscription');
select throws_ok($$update public.push_subscriptions set failure_count = 0$$, '42501', null, 'anon cannot update subscriptions');
select throws_ok($$delete from public.push_subscriptions$$, '42501', null, 'anon cannot delete subscriptions');
select throws_ok($$select * from public.push_sends$$, '42501', null, 'anon cannot read the send ledger');
select throws_ok(
  $$insert into public.push_sends (recipient_id, dedupe_key) values (pg_temp.u(1), 'anon-insert')$$,
  '42501', null, 'anon cannot write the send ledger');
select throws_ok($$update public.push_sends set dedupe_key = 'x'$$, '42501', null, 'anon cannot update the send ledger');
select throws_ok($$delete from public.push_sends$$, '42501', null, 'anon cannot delete from the send ledger');
reset role;

-- ===== function execution =====
select is(
  (select count(*)::int
   from unnest(array[
     'public.register_push_subscription(uuid,text,text,text,text)',
     'public.push_targets(uuid[],public.push_topic)',
     'public.record_push_failure(uuid,integer)'
   ]) f
   cross join unnest(array['anon', 'authenticated']) r
   where has_function_privilege(r, f::regprocedure, 'execute')),
  0, 'anon and authenticated cannot execute any push function');
select is(
  (select count(*)::int
   from unnest(array[
     'public.register_push_subscription(uuid,text,text,text,text)',
     'public.push_targets(uuid[],public.push_topic)',
     'public.record_push_failure(uuid,integer)'
   ]) f
   where has_function_privilege('service_role', f::regprocedure, 'execute')),
  3, 'service_role can execute all three push functions');
select is(
  (select count(*)::int
   from pg_proc
   where oid in (
     'public.register_push_subscription(uuid,text,text,text,text)'::regprocedure,
     'public.push_targets(uuid[],public.push_topic)'::regprocedure,
     'public.record_push_failure(uuid,integer)'::regprocedure
   ) and not prosecdef and proconfig @> array['search_path=""']),
  3, 'the push functions are SECURITY INVOKER with an empty search_path');

select pg_temp.set_caller(pg_temp.u(1), 'authenticated');
select throws_ok(
  $$select public.register_push_subscription(pg_temp.u(1), pg_temp.ep('direct'), pg_temp.p256(1), pg_temp.authkey(1), 'Phone')$$,
  '42501', null, 'a signed-in user cannot register a device directly, even as themselves');
select throws_ok(
  $$select * from public.push_targets(array[pg_temp.u(1)], 'trades')$$,
  '42501', null, 'a signed-in user cannot read push targets');
select throws_ok(
  $$select public.record_push_failure(gen_random_uuid(), 5)$$,
  '42501', null, 'a signed-in user cannot record a push failure');
reset role;
select pg_temp.set_caller(null, 'anon');
select throws_ok(
  $$select public.register_push_subscription(pg_temp.u(1), pg_temp.ep('direct'), pg_temp.p256(1), pg_temp.authkey(1), 'Phone')$$,
  '42501', null, 'anon cannot register a device');
select throws_ok(
  $$select * from public.push_targets(array[pg_temp.u(1)], 'trades')$$,
  '42501', null, 'anon cannot read push targets');
select throws_ok(
  $$select public.record_push_failure(gen_random_uuid(), 5)$$,
  '42501', null, 'anon cannot record a push failure');
reset role;

-- ===== profile switches =====
select pg_temp.set_caller(pg_temp.u(1), 'authenticated');
select lives_ok($$update public.profiles set push_scores = false where id = pg_temp.u(1)$$, 'a member can update their own push switch');
select is((select push_scores from public.profiles where id = pg_temp.u(1)), false, 'and it stuck');
with changed as (update public.profiles set push_scores = false where id = pg_temp.u(2) returning 1)
select is((select count(*)::int from changed), 0, 'a member cannot change another member''s push switch (no row is updated)');
select is((select push_scores from public.profiles where id = pg_temp.u(2)), true, 'the other member''s switch is untouched');
select lives_ok(
  $$update public.profiles set push_trades = false, push_feed = false, push_scores = true where id = pg_temp.u(1)$$,
  'all three switches are updatable together');
reset role;
select pg_temp.set_caller(null, 'anon');
select throws_ok($$update public.profiles set push_trades = false$$, '42501', null, 'anon cannot update a push switch');
reset role;
-- Back to u1's defaults so later steps read a known state.
update public.profiles set push_trades = true, push_feed = true, push_scores = true where id = pg_temp.u(1);

-- ===== register_push_subscription =====
select pg_temp.set_caller(null, 'service_role');
select lives_ok(
  $$select set_config('t.s1', public.register_push_subscription(pg_temp.u(2), pg_temp.ep('r1'), pg_temp.p256(1), pg_temp.authkey(1), 'iPhone')::text, true)$$,
  'service_role can register a device');
select is(
  (select count(*)::int from public.push_subscriptions where user_id = pg_temp.u(2) and endpoint = pg_temp.ep('r1')
     and p256dh = pg_temp.p256(1) and device_label = 'iPhone' and id = current_setting('t.s1')::uuid),
  1, 'it creates one row for the member and returns its id');

select lives_ok(
  $$select public.register_push_subscription(pg_temp.u(2), pg_temp.ep('r1'), pg_temp.p256(2), pg_temp.authkey(2), 'Mac')$$,
  'registering the same endpoint again succeeds');
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = pg_temp.ep('r1')),
  1, 'it still leaves one row for that endpoint');
select is(
  (select count(*)::int from public.push_subscriptions
   where endpoint = pg_temp.ep('r1') and p256dh = pg_temp.p256(2) and auth = pg_temp.authkey(2)
     and device_label = 'Mac' and id = current_setting('t.s1')::uuid),
  1, 'the keys and label are refreshed on the same row');

-- A shared device: another member turns alerts on in the same browser, so the endpoint moves.
select lives_ok($$update public.push_subscriptions set failure_count = 3 where endpoint = pg_temp.ep('r1')$$, 'service_role can update a subscription');
select lives_ok(
  $$select public.register_push_subscription(pg_temp.u(1), pg_temp.ep('r1'), pg_temp.p256(3), pg_temp.authkey(3), 'iPhone')$$,
  'a different member can register the same endpoint');
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = pg_temp.ep('r1') and user_id = pg_temp.u(1)),
  1, 'ownership moves to the new member');
select is(
  (select count(*)::int from public.push_subscriptions where user_id = pg_temp.u(2)),
  0, 'the previous owner no longer has it');
select is(
  (select failure_count from public.push_subscriptions where endpoint = pg_temp.ep('r1')),
  0, 're-registering resets the failure count');
reset role;

-- Device cap: u3 already holds five devices, c1 the oldest. Explicit ages, because every call in
-- this file shares one transaction timestamp.
select pg_temp.sub(3, 'c1', interval '5 days');
select pg_temp.sub(3, 'c2', interval '4 days');
select pg_temp.sub(3, 'c3', interval '3 days');
select pg_temp.sub(3, 'c4', interval '2 days');
select pg_temp.sub(3, 'c5', interval '1 day');
select pg_temp.set_caller(null, 'service_role');
select lives_ok(
  $$select public.register_push_subscription(pg_temp.u(3), pg_temp.ep('c6'), pg_temp.p256(3), pg_temp.authkey(3), 'Android')$$,
  'a member with five devices can register a sixth');
select is((select count(*)::int from public.push_subscriptions where user_id = pg_temp.u(3)), 5, 'the member is held at five devices');
select is(
  (select array_agg(endpoint order by endpoint) from public.push_subscriptions where user_id = pg_temp.u(3)),
  array[pg_temp.ep('c2'), pg_temp.ep('c3'), pg_temp.ep('c4'), pg_temp.ep('c5'), pg_temp.ep('c6')],
  'the oldest device was dropped and the new one kept');
select lives_ok(
  $$select public.register_push_subscription(pg_temp.u(3), pg_temp.ep('c3'), pg_temp.p256(4), pg_temp.authkey(4), 'Android')$$,
  'refreshing an existing device of a full member succeeds');
select is(
  (select count(*)::int from public.push_subscriptions where user_id = pg_temp.u(3) and endpoint = pg_temp.ep('c2')),
  1, 'a refresh does not evict anything');
select lives_ok(
  $$select public.register_push_subscription(pg_temp.u(3), pg_temp.ep('r1'), pg_temp.p256(5), pg_temp.authkey(5), 'iPhone')$$,
  'moving an endpoint onto a full member succeeds');
select is(
  (select array_agg(endpoint order by endpoint) from public.push_subscriptions where user_id = pg_temp.u(3)),
  array[pg_temp.ep('c3'), pg_temp.ep('c4'), pg_temp.ep('c5'), pg_temp.ep('c6'), pg_temp.ep('r1')],
  'the move counts against the cap and drops the least recently used device');
select is(
  (select count(*)::int from public.push_subscriptions where user_id = pg_temp.u(1) and endpoint = pg_temp.ep('owner-device')),
  1, 'other members'' devices are never touched by the cap');

select throws_ok(
  $$select public.register_push_subscription(pg_temp.u(7), pg_temp.ep('ghost'), pg_temp.p256(1), pg_temp.authkey(1), 'Phone')$$,
  'P0001', 'not_found', 'an actor with no profile is not_found');
select throws_ok(
  $$select public.register_push_subscription(null, pg_temp.ep('ghost'), pg_temp.p256(1), pg_temp.authkey(1), 'Phone')$$,
  'P0001', 'not_found', 'a null actor is not_found');
select is((select count(*)::int from public.push_subscriptions where endpoint = pg_temp.ep('ghost')), 0, 'and no row was created');
select throws_ok(
  $$select public.register_push_subscription(pg_temp.u(2), 'http://push.example.com/x', pg_temp.p256(1), pg_temp.authkey(1), 'Phone')$$,
  '23514', null, 'the table checks still apply through the function');
reset role;

-- ===== push_targets =====
-- u4 has two devices and scores off; u5 has one device and feed off; u6 has no device.
select pg_temp.sub(4, 't4a');
select pg_temp.sub(4, 't4b');
select pg_temp.sub(5, 't5a');
update public.profiles set push_scores = false where id = pg_temp.u(4);
update public.profiles set push_feed = false where id = pg_temp.u(5);
select pg_temp.set_caller(null, 'service_role');
select is(
  (select count(*)::int from public.push_targets(array[pg_temp.u(4), pg_temp.u(5)], 'trades')),
  3, 'trades reaches every device of members with trades on');
select is(
  (select array_agg(endpoint order by endpoint) from public.push_targets(array[pg_temp.u(4), pg_temp.u(5)], 'feed')),
  array[pg_temp.ep('t4a'), pg_temp.ep('t4b')], 'a member with feed off is excluded from feed');
select is(
  (select array_agg(endpoint) from public.push_targets(array[pg_temp.u(4), pg_temp.u(5)], 'scores')),
  array[pg_temp.ep('t5a')], 'a member with scores off is excluded from scores');
select is(
  (select count(*)::int from public.push_targets(array[pg_temp.u(5)], 'trades')
   where user_id = pg_temp.u(5) and p256dh = pg_temp.p256(5) and auth = pg_temp.authkey(5)),
  1, 'a member with only one topic off still gets the others, with the keys to send to');
select is(
  (select count(*)::int from public.push_targets(array[pg_temp.u(4)], 'trades') where user_id <> pg_temp.u(4)),
  0, 'only the requested members are returned');
select is((select count(*)::int from public.push_targets(array[pg_temp.u(6)], 'trades')), 0, 'a member with no device yields nothing');
select is((select count(*)::int from public.push_targets(array[]::uuid[], 'trades')), 0, 'an empty recipient list yields nothing');
reset role;

-- ===== record_push_failure =====
select pg_temp.sub(6, 'f6');
select pg_temp.set_caller(null, 'service_role');
select lives_ok(
  $$select set_config('t.f6', (select id::text from public.push_subscriptions where endpoint = pg_temp.ep('f6')), true)$$,
  'the failing device can be looked up');
select is(public.record_push_failure(current_setting('t.f6')::uuid, 3), 'counted', 'the first failure is counted');
select is(public.record_push_failure(current_setting('t.f6')::uuid, 3), 'counted', 'the second failure is counted');
select is((select failure_count from public.push_subscriptions where id = current_setting('t.f6')::uuid), 2, 'the count is kept on the row');
select is(public.record_push_failure(current_setting('t.f6')::uuid, 3), 'pruned', 'the failure that reaches the limit prunes the device');
select is((select count(*)::int from public.push_subscriptions where id = current_setting('t.f6')::uuid), 0, 'the pruned row is gone');
select is(public.record_push_failure(current_setting('t.f6')::uuid, 3), 'missing', 'a device that is already gone is reported missing');
select is(public.record_push_failure(gen_random_uuid(), 3), 'missing', 'an unknown id is reported missing');

-- ===== push_sends dedupe =====
select lives_ok(
  $$insert into public.push_sends (recipient_id, dedupe_key) values (pg_temp.u(4), 'trade:1:offer')$$,
  'service_role can claim a send');
with ins as (
  insert into public.push_sends (recipient_id, dedupe_key) values (pg_temp.u(4), 'trade:1:offer')
  on conflict do nothing returning 1)
select is((select count(*)::int from ins), 0, 'claiming the same key for the same member again inserts nothing');
with ins as (
  insert into public.push_sends (recipient_id, dedupe_key) values (pg_temp.u(4), 'trade:1:accepted')
  on conflict do nothing returning 1)
select is((select count(*)::int from ins), 1, 'a different key for the same member is a new send');
with ins as (
  insert into public.push_sends (recipient_id, dedupe_key) values (pg_temp.u(5), 'trade:1:offer')
  on conflict do nothing returning 1)
select is((select count(*)::int from ins), 1, 'the same key for another member is a new send');
reset role;

-- ===== cascade =====
-- u5 has a device (t5a) and a ledger row; deleting the user removes both and only theirs.
select is((select count(*)::int from public.push_subscriptions where user_id = pg_temp.u(5)), 1, 'before the delete, the member has a device');
select lives_ok($$delete from auth.users where id = pg_temp.u(5)$$, 'a member with devices and sends can be deleted');
select is((select count(*)::int from public.push_subscriptions where user_id = pg_temp.u(5)), 0, 'deleting a member deletes their devices');
select is((select count(*)::int from public.push_sends where recipient_id = pg_temp.u(5)), 0, 'and their ledger rows');
select is((select count(*)::int from public.push_subscriptions where user_id = pg_temp.u(4)), 2, 'other members'' devices are untouched');
select is((select count(*)::int from public.push_sends where recipient_id = pg_temp.u(4)), 2, 'and their ledger rows');

-- ===== cleanup job =====
select is((select count(*)::int from cron.job where jobname = 'cincy-push-sends-cleanup'), 1, 'the send ledger cleanup job is scheduled');
select is((select schedule from cron.job where jobname = 'cincy-push-sends-cleanup'), '40 9 * * *', 'it runs daily at 09:40 UTC, clear of the other daily jobs');
select ok(
  (select command like '%delete from public.push_sends%' and command like '%90 days%'
   from cron.job where jobname = 'cincy-push-sends-cleanup'),
  'it deletes ledger rows older than 90 days');

select * from finish();
rollback;
