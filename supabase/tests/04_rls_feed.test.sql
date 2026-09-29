-- League feed: messages, reactions, digest_sends and the weekly email opt-in.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- The seed may already have an active season; only one can be active at a time.
update public.seasons set is_active = false;
insert into public.seasons (id, name, starts_on, ends_on, is_active) values
  ('10000000-0000-0000-0000-000000000001', 'test-season', '2030-01-01', '2030-12-31', true),
  ('10000000-0000-0000-0000-000000000002', 'other-season', '2031-01-01', '2031-12-31', false);
insert into public.fantasy_teams (id, season_id, name, slug) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Team One', 'team-one'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Team Two', 'team-two');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner1@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'owner2@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'admin@example.com'),
  ('00000000-0000-0000-0000-000000000004', 'plain@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000003';
-- u1 and u2 own approved teams; u4 has none.
update public.fantasy_teams set owner_id = '00000000-0000-0000-0000-000000000001' where slug = 'team-one';
update public.fantasy_teams set owner_id = '00000000-0000-0000-0000-000000000002' where slug = 'team-two';

-- Seeded as the table owner (bypasses RLS and grants).
insert into public.messages (id, season_id, author_id, kind, body) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'member', 'u1 root'),
  ('a0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'member', 'u2 root'),
  ('a0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'member', 'u2 to delete');
insert into public.messages (id, season_id, author_id, kind, body, deleted_at) values
  ('a0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'member', 'already removed', now());
insert into public.message_reactions (message_id, user_id, emoji) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'fire'),
  ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'clap');

create function pg_temp.set_caller(uid uuid, role_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', role_name)::text, true);
  execute format('set local role %I', role_name);
end $$;
grant execute on function pg_temp.set_caller(uuid, text) to public;

-- ===== owner-level constraints and triggers (table owner) =====
select throws_ok(
  $$insert into public.messages (season_id, author_id, kind, body)
    values ('10000000-0000-0000-0000-000000000001', null, 'member', 'ghost')$$,
  '23514', null, 'a member message requires an author');
select throws_ok(
  $$insert into public.messages (season_id, kind, body, author_id)
    values ('10000000-0000-0000-0000-000000000001', 'league', 'x', '00000000-0000-0000-0000-000000000001')$$,
  '23514', null, 'a league message cannot have an author');
select throws_ok(
  $$insert into public.messages (season_id, kind, body, parent_id)
    values ('10000000-0000-0000-0000-000000000001', 'league', 'x', 'a0000000-0000-0000-0000-000000000001')$$,
  '23514', null, 'a league message cannot be a reply');
select throws_ok(
  $$insert into public.messages (season_id, author_id, kind, body)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'member', '   ')$$,
  '23514', null, 'a blank body is rejected');
select throws_ok(
  $$insert into public.messages (season_id, author_id, kind, body)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'member', repeat('x', 501))$$,
  '23514', null, 'a body over 500 characters is rejected');
select throws_ok(
  $$insert into public.messages (season_id, author_id, kind, body, parent_id)
    values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'member', 'x', 'a0000000-0000-0000-0000-000000000001')$$,
  '23514', null, 'a reply must be in its parent''s season');
select lives_ok(
  $$insert into public.messages (id, season_id, kind, body, payload)
    values ('a0000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 'league', 'Scores update', '{"teams": 2}')$$,
  'the secret-key path can insert a league message');

-- ===== anon =====
select pg_temp.set_caller(null, 'anon');
select is((select count(*)::int from public.messages), 5, 'anon reads messages (including removed rows, which the UI masks)');
select is((select count(*)::int from public.message_reactions), 2, 'anon reads reactions');
select throws_ok(
  $$insert into public.messages (season_id, author_id, kind, body)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'member', 'nope')$$,
  '42501', null, 'anon cannot insert a message');
select throws_ok($$select count(*) from public.digest_sends$$, '42501', null, 'anon cannot read digest_sends');
reset role;

-- ===== signed in, no team (u4) =====
select pg_temp.set_caller('00000000-0000-0000-0000-000000000004', 'authenticated');
select throws_ok(
  $$insert into public.messages (season_id, author_id, kind, body)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'member', 'let me in')$$,
  '42501', null, 'a member without an approved team cannot post');
select throws_ok(
  $$insert into public.message_reactions (message_id, user_id, emoji)
    values ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'fire')$$,
  '42501', null, 'a non-owner cannot react');
reset role;

-- ===== team owner (u1) =====
select pg_temp.set_caller('00000000-0000-0000-0000-000000000001', 'authenticated');
select lives_ok(
  $$insert into public.messages (id, season_id, author_id, kind, body)
    values ('a0000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'member', 'hello league')$$,
  'a team owner can post');
select throws_ok(
  $$insert into public.messages (season_id, author_id, kind, body)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'member', 'as u2')$$,
  '42501', null, 'cannot post as someone else');
select throws_ok(
  $$insert into public.messages (season_id, kind, body)
    values ('10000000-0000-0000-0000-000000000001', 'league', 'fake league post')$$,
  '42501', null, 'a signed-in user cannot insert a league message');
select throws_ok(
  $$insert into public.messages (season_id, author_id, kind, body, deleted_at)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'member', 'born deleted', now())$$,
  '42501', null, 'cannot insert an already-deleted message');
select throws_ok(
  $$insert into public.messages (season_id, author_id, kind, body)
    values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'member', 'wrong season')$$,
  '42501', null, 'cannot post outside the active season');
select lives_ok(
  $$insert into public.messages (id, season_id, author_id, kind, body, parent_id)
    values ('a0000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'member', 'a reply', 'a0000000-0000-0000-0000-000000000002')$$,
  'a reply to a top-level message works');
select throws_ok(
  $$insert into public.messages (season_id, author_id, kind, body, parent_id)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'member', 'nested', 'a0000000-0000-0000-0000-000000000011')$$,
  '23514', null, 'a reply to a reply is rejected');

-- soft delete and edit rules
select lives_ok(
  $$update public.messages set deleted_at = now() where id = 'a0000000-0000-0000-0000-000000000010'$$,
  'author can soft delete their own message');
select throws_ok(
  $$update public.messages set body = 'edited' where id = 'a0000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'author cannot edit the body (no column grant)');
select lives_ok(
  $$update public.messages set deleted_at = now() where id = 'a0000000-0000-0000-0000-000000000002'$$,
  'soft deleting someone else''s message is a silent no-op (RLS)');
select throws_ok(
  $$update public.messages set deleted_at = null where id = 'a0000000-0000-0000-0000-000000000004'$$,
  '42501', null, 'author cannot un-delete');
select throws_ok(
  $$delete from public.messages where id = 'a0000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'no hard delete for authenticated');

-- reactions
select lives_ok(
  $$insert into public.message_reactions (message_id, user_id, emoji)
    values ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'goat')$$,
  'owner can react as themselves');
select throws_ok(
  $$insert into public.message_reactions (message_id, user_id, emoji)
    values ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'goat')$$,
  '42501', null, 'cannot react as another user');
select throws_ok(
  $$insert into public.message_reactions (message_id, user_id, emoji)
    values ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'goat')$$,
  '23505', null, 'duplicate reaction is rejected');
select throws_ok(
  $$insert into public.message_reactions (message_id, user_id, emoji)
    values ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'fire')$$,
  '42501', null, 'cannot react to a removed message');
select lives_ok(
  $$delete from public.message_reactions
    where message_id = 'a0000000-0000-0000-0000-000000000002' and user_id = '00000000-0000-0000-0000-000000000001'$$,
  'owner can delete their own reaction');
select lives_ok(
  $$delete from public.message_reactions where user_id = '00000000-0000-0000-0000-000000000002'$$,
  'deleting others'' reactions is a silent no-op (RLS)');

-- digest_sends
select throws_ok($$select count(*) from public.digest_sends$$, '42501', null, 'authenticated cannot read digest_sends');
select throws_ok(
  $$insert into public.digest_sends (week_start, recipient_count, status) values ('2030-01-07', 1, 'sent')$$,
  '42501', null, 'authenticated cannot write digest_sends');

-- weekly_email_opt_in
select lives_ok(
  $$update public.profiles set weekly_email_opt_in = false where id = '00000000-0000-0000-0000-000000000001'$$,
  'user can toggle their own email opt-in');
select lives_ok(
  $$update public.profiles set weekly_email_opt_in = false where id = '00000000-0000-0000-0000-000000000002'$$,
  'toggling someone else''s opt-in is a silent no-op (RLS)');
select throws_ok(
  $$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'role protection still holds alongside the new grant');
reset role;

select is((select weekly_email_opt_in from public.profiles where id = '00000000-0000-0000-0000-000000000001'), false, 'own opt-in changed');
select is((select weekly_email_opt_in from public.profiles where id = '00000000-0000-0000-0000-000000000002'), true, 'other opt-in untouched (defaults to true)');
select is((select body from public.messages where id = 'a0000000-0000-0000-0000-000000000001'), 'u1 root', 'body unchanged');
select is((select deleted_at is null from public.messages where id = 'a0000000-0000-0000-0000-000000000002'), true, 'others'' message not deleted');
select is((select count(*)::int from public.message_reactions where user_id = '00000000-0000-0000-0000-000000000002'), 1, 'others'' reaction survived');

-- ===== owner (u2) soft delete; admin =====
select pg_temp.set_caller('00000000-0000-0000-0000-000000000003', 'authenticated');
select lives_ok(
  $$update public.messages set deleted_at = now() where id = 'a0000000-0000-0000-0000-000000000003'$$,
  'admin can soft delete any message');
reset role;
select is((select deleted_at is not null from public.messages where id = 'a0000000-0000-0000-0000-000000000003'), true, 'admin delete applied');

-- ===== rate limit =====
-- u2 already has 2 member messages this transaction (fixtures share one now()), so 8 more are
-- allowed and the next is the 11th in the window.
select pg_temp.set_caller('00000000-0000-0000-0000-000000000002', 'authenticated');
insert into public.messages (season_id, author_id, kind, body)
select '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'member', 'spam ' || g
from generate_series(1, 8) g;
select throws_ok(
  $$insert into public.messages (season_id, author_id, kind, body)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'member', 'one too many')$$,
  'P0001', 'rate_limited', 'the 11th member message within a minute is rate limited');
reset role;

select * from finish();
rollback;
