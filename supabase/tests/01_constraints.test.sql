-- Data-integrity rules enforced by the schema itself (constraints, unique indexes, triggers),
-- exercised as the table owner so RLS is out of the picture. Access rules live in 02/03.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Self-contained fixtures: nothing here depends on the seed data.
insert into public.seasons (id, name, starts_on, ends_on)
values ('10000000-0000-0000-0000-000000000001', 'test-season', '2030-01-01', '2030-12-31');
insert into public.sports (id, code, name, participant_kind, espn_sport, espn_league, allows_duplicate_picks)
values
  ('20000000-0000-0000-0000-000000000001', 'aa', 'Sport A', 'team', 'testa', 'a', false),
  ('20000000-0000-0000-0000-000000000002', 'bb', 'Sport B', 'team', 'testb', 'b', true);
insert into public.season_sports (season_id, sport_id, starts_on, espn_season)
select '10000000-0000-0000-0000-000000000001', id, '2030-01-01', 2030 from public.sports where code in ('aa', 'bb');
insert into public.scoring_rules (id, season_id, sport_id, code, label, kind, points, rank_from, rank_to, is_championship)
values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'win', 'Win', 'per_win', 1, null, null, false),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'champion', 'Champion', 'playoff_milestone', 50, null, null, true),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'open', 'US Open', 'major_finish', 5, null, null, false),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'win', 'Win', 'per_win', 1, null, null, false);
insert into public.participants (id, sport_id, name, short_name)
values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Alpha', 'A'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Beta', 'B');
insert into public.fantasy_teams (id, season_id, name, slug)
values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Team One', 'team-one'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Team Two', 'team-two');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'jane.doe@example.com', '{"full_name": "Jane Doe", "avatar_url": "https://img.test/j.png"}'),
  ('00000000-0000-0000-0000-000000000002', 'bob@example.com', '{"name": "Bob B", "picture": "https://img.test/b.png"}'),
  ('00000000-0000-0000-0000-000000000003', 'plain@example.com', '{}');

-- profiles trigger
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000001'), 'Jane Doe', 'profile takes display_name from full_name');
select is((select avatar_url from public.profiles where id = '00000000-0000-0000-0000-000000000001'), 'https://img.test/j.png', 'profile takes avatar_url from metadata');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000002'), 'Bob B', 'profile falls back to metadata name');
select is((select avatar_url from public.profiles where id = '00000000-0000-0000-0000-000000000002'), 'https://img.test/b.png', 'profile falls back to metadata picture');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000003'), 'plain', 'profile falls back to the email prefix');
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-000000000003'), 'member', 'new profiles are members');
select hasnt_column('public', 'profiles', 'email', 'profiles never stores an email (they are publicly readable)');

-- every table has RLS on
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'RLS is enabled on every public table');

-- scoring_rules shape
select throws_ok(
  $$insert into public.scoring_rules (season_id, sport_id, code, label, kind, points)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'band', 'Band', 'final_rank_band', 5)$$,
  '23514', null, 'a rank band without ranks is rejected');
select throws_ok(
  $$insert into public.scoring_rules (season_id, sport_id, code, label, kind, points, rank_from, rank_to)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'band', 'Band', 'final_rank_band', 5, 10, 5)$$,
  '23514', null, 'rank_from above rank_to is rejected');
select throws_ok(
  $$insert into public.scoring_rules (season_id, sport_id, code, label, kind, points, rank_from, rank_to)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'w2', 'W', 'per_win', 1, 1, 2)$$,
  '23514', null, 'ranks on a non-band rule are rejected');
select throws_ok(
  $$insert into public.scoring_rules (season_id, sport_id, code, label, kind, points)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'neg', 'Neg', 'per_win', -1)$$,
  '23514', null, 'negative points are rejected');
select lives_ok(
  $$insert into public.scoring_rules (season_id, sport_id, code, label, kind, points, rank_from, rank_to)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'band', 'Band', 'final_rank_band', 5, 6, 10)$$,
  'a valid rank band is accepted');

-- picks
insert into public.picks (fantasy_team_id, sport_id, participant_id)
values ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001');
select throws_ok(
  $$insert into public.picks (fantasy_team_id, sport_id, participant_id)
    values ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001')$$,
  '23505', null, 'two teams cannot pick the same participant in a no-duplicate sport');
insert into public.picks (fantasy_team_id, sport_id, participant_id)
values ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002');
select lives_ok(
  $$insert into public.picks (fantasy_team_id, sport_id, participant_id)
    values ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002')$$,
  'teams can share a participant where the sport allows duplicates');

-- results
select throws_ok(
  $$insert into public.participant_results (season_id, participant_id, scoring_rule_id, quantity)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 1)$$,
  '23514', null, 'a result cannot pair a participant with another sport''s rule');
select throws_ok(
  $$insert into public.participant_results (season_id, participant_id, scoring_rule_id, quantity)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 2)$$,
  '23514', null, 'a playoff milestone must have quantity 1');
select throws_ok(
  $$insert into public.participant_results (season_id, participant_id, scoring_rule_id, quantity)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 1)$$,
  '23514', null, 'a major finish needs an event label');

-- claims: one approved per team and per user
insert into public.team_claims (fantasy_team_id, user_id, status, reviewed_at) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'approved', now());
select throws_ok(
  $$insert into public.team_claims (fantasy_team_id, user_id, status, reviewed_at)
    values ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'approved', now())$$,
  '23505', null, 'a team cannot have two approved claims');
select throws_ok(
  $$insert into public.team_claims (fantasy_team_id, user_id, status, reviewed_at)
    values ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'approved', now())$$,
  '23505', null, 'a user cannot have two approved claims');

-- per-sport end date
select throws_ok(
  $$update public.season_sports set ends_on = '2029-12-31'
    where sport_id = '20000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a sport cannot end before it starts');
select lives_ok(
  $$update public.season_sports set ends_on = '2030-05-31'
    where sport_id = '20000000-0000-0000-0000-000000000001'$$,
  'a sport can end after it starts (and ends_on may stay null)');

select * from finish();
rollback;
