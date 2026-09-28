-- Claims, profiles and admin write access.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

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
insert into public.fantasy_teams (id, season_id, name, slug) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Team One', 'team-one'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Team Two', 'team-two'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Team Three', 'team-three');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'm1@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'm2@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000003';
-- m2 already has a pending claim on team two, and m1 one on team one.
insert into public.team_claims (id, fantasy_team_id, user_id) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002'),
  ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');

create function pg_temp.set_caller(uid uuid, role_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', role_name)::text, true);
  execute format('set local role %I', role_name);
end $$;
grant execute on function pg_temp.set_caller(uuid, text) to public;

-- ===== member (m1) =====
select pg_temp.set_caller('00000000-0000-0000-0000-000000000001', 'authenticated');

select lives_ok(
  $$insert into public.team_claims (fantasy_team_id, user_id)
    values ('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001')$$,
  'member can insert their own pending claim');
select throws_ok(
  $$insert into public.team_claims (fantasy_team_id, user_id)
    values ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'member cannot insert a claim for someone else');
select throws_ok(
  $$insert into public.team_claims (fantasy_team_id, user_id, status, reviewed_at)
    values ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'approved', now())$$,
  '42501', null, 'member cannot insert an already-approved claim');
select is((select count(*)::int from public.team_claims), 2, 'member sees exactly their own two claims');
select is_empty($$select 1 from public.team_claims where user_id <> '00000000-0000-0000-0000-000000000001'$$, 'member sees no one else''s claims');

select throws_ok($$select public.approve_team_claim('60000000-0000-0000-0000-000000000001')$$, '42501', null, 'member cannot approve a claim');
select throws_ok($$select public.reject_team_claim('60000000-0000-0000-0000-000000000001')$$, '42501', null, 'member cannot reject a claim');
select lives_ok($$update public.team_claims set status = 'approved', reviewed_at = now() where id = '60000000-0000-0000-0000-000000000001'$$, 'member self-approve via UPDATE is a silent no-op (RLS)');

select throws_ok(
  $$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'member cannot promote themselves');
select lives_ok($$update public.profiles set display_name = 'New Name' where id = '00000000-0000-0000-0000-000000000001'$$, 'member can update their own display name');
select lives_ok($$update public.profiles set display_name = 'Pwned' where id = '00000000-0000-0000-0000-000000000002'$$, 'updating someone else''s profile is a silent no-op');
select lives_ok($$update public.fantasy_teams set name = 'Renamed' where id = '50000000-0000-0000-0000-000000000001'$$, 'member team rename is a silent no-op');
select throws_ok(
  $$insert into public.participant_results (season_id, participant_id, scoring_rule_id, quantity)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 5)$$,
  '42501', null, 'member cannot insert results');

reset role;
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000001'), 'New Name', 'own display name changed');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000002'), 'm2', 'other profile untouched');
select is((select name from public.fantasy_teams where id = '50000000-0000-0000-0000-000000000001'), 'Team One', 'member could not rename a team');
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-000000000001'), 'member', 'role unchanged');
select is((select status::text from public.team_claims where id = '60000000-0000-0000-0000-000000000001'), 'pending', 'member could not approve their own claim');

-- ===== admin =====
select pg_temp.set_caller('00000000-0000-0000-0000-000000000003', 'authenticated');

select is((select count(*)::int from public.team_claims), 4, 'admin reads all claims');
select lives_ok(
  $$insert into public.participant_results (season_id, participant_id, scoring_rule_id, quantity)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 5)$$,
  'admin can insert results');
select lives_ok($$update public.fantasy_teams set name = 'Renamed' where id = '50000000-0000-0000-0000-000000000003'$$, 'admin can rename a team');
select lives_ok($$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000002'$$, 'admin can change a role');
select lives_ok($$select public.approve_team_claim('60000000-0000-0000-0000-000000000001')$$, 'admin can approve a claim');
select throws_ok($$select public.approve_team_claim('60000000-0000-0000-0000-000000000001')$$, '23514', null, 'a claim cannot be approved twice');

reset role;
select is((select source::text || '/' || updated_by::text from public.participant_results), 'manual/00000000-0000-0000-0000-000000000003', 'admin edits are recorded as manual with the editor');
select is((select name from public.fantasy_teams where id = '50000000-0000-0000-0000-000000000003'), 'Renamed', 'admin rename applied');
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-000000000002'), 'admin', 'admin role change applied');
select is((select owner_id::text from public.fantasy_teams where id = '50000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'approval sets the team owner');
select is((select status::text from public.team_claims where id = '60000000-0000-0000-0000-000000000003'), 'rejected', 'approval rejects rival pending claims on the same team');

select pg_temp.set_caller('00000000-0000-0000-0000-000000000003', 'authenticated');
select lives_ok($$select public.reject_team_claim('60000000-0000-0000-0000-000000000002')$$, 'admin can reject a pending claim');
reset role;
select is((select status::text from public.team_claims where id = '60000000-0000-0000-0000-000000000002'), 'rejected', 'rejection recorded');
select is((select owner_id from public.fantasy_teams where id = '50000000-0000-0000-0000-000000000002'), null, 'rejection leaves the team unowned');

select * from finish();
rollback;
