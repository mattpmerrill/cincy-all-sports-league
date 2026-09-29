-- Free-agent moves: schema constraints, the service_role-only move function (happy path, every
-- error token, WNBA-style duplicates, side effects on listings and offers), read-only access for
-- everyone else, cascade, and the daily refresh job. Fixtures are self-contained.
begin;
create extension if not exists pgtap with schema extensions;
select plan(107);

-- The seed may already have an active season; only one can be active at a time.
update public.seasons set is_active = false;
insert into public.seasons (id, name, starts_on, ends_on, is_active) values
  ('10000000-0000-0000-0000-000000000001', 'test-season', '2030-01-01', '2030-12-31', true);
-- aa and bb are in the season; cc exists but has no season_sports row (invalid_sport). ww stands
-- in for the WNBA: two teams may hold the same participant.
insert into public.sports (id, code, name, participant_kind, espn_sport, espn_league, allows_duplicate_picks) values
  ('20000000-0000-0000-0000-000000000001', 'aa', 'Sport A', 'team', 'testa', 'a', false),
  ('20000000-0000-0000-0000-000000000002', 'bb', 'Sport B', 'team', 'testb', 'b', false),
  ('20000000-0000-0000-0000-000000000003', 'cc', 'Sport C', 'team', 'testc', 'c', false),
  ('20000000-0000-0000-0000-000000000004', 'ww', 'Sport W', 'team', 'testw', 'w', true);
insert into public.season_sports (season_id, sport_id, starts_on, espn_season)
select '10000000-0000-0000-0000-000000000001', id, '2030-01-01', 2030
from public.sports where code in ('aa', 'bb', 'ww');
-- A5/A6, B5/B6 and W3 start unheld: these are the free agents.
insert into public.participants (id, sport_id, name, short_name) values
  ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'A1', 'A1'),
  ('40000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-000000000001', 'A2', 'A2'),
  ('40000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-000000000001', 'A3', 'A3'),
  ('40000000-0000-0000-0000-0000000000a4', '20000000-0000-0000-0000-000000000001', 'A4', 'A4'),
  ('40000000-0000-0000-0000-0000000000a5', '20000000-0000-0000-0000-000000000001', 'A5', 'A5'),
  ('40000000-0000-0000-0000-0000000000a6', '20000000-0000-0000-0000-000000000001', 'A6', 'A6'),
  ('40000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000002', 'B1', 'B1'),
  ('40000000-0000-0000-0000-0000000000b2', '20000000-0000-0000-0000-000000000002', 'B2', 'B2'),
  ('40000000-0000-0000-0000-0000000000b3', '20000000-0000-0000-0000-000000000002', 'B3', 'B3'),
  ('40000000-0000-0000-0000-0000000000b4', '20000000-0000-0000-0000-000000000002', 'B4', 'B4'),
  ('40000000-0000-0000-0000-0000000000b5', '20000000-0000-0000-0000-000000000002', 'B5', 'B5'),
  ('40000000-0000-0000-0000-0000000000b6', '20000000-0000-0000-0000-000000000002', 'B6', 'B6'),
  ('40000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-000000000003', 'C1', 'C1'),
  ('40000000-0000-0000-0000-0000000000c2', '20000000-0000-0000-0000-000000000003', 'C2', 'C2'),
  ('40000000-0000-0000-0000-0000000000c3', '20000000-0000-0000-0000-000000000003', 'C3', 'C3'),
  ('40000000-0000-0000-0000-0000000000c4', '20000000-0000-0000-0000-000000000003', 'C4', 'C4'),
  ('40000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-000000000004', 'W1', 'W1'),
  ('40000000-0000-0000-0000-0000000000d2', '20000000-0000-0000-0000-000000000004', 'W2', 'W2'),
  ('40000000-0000-0000-0000-0000000000d3', '20000000-0000-0000-0000-000000000004', 'W3', 'W3');
-- T1..T3 have owners (u1..u3); T4 is unowned; u4 has no team.
insert into public.fantasy_teams (id, season_id, name, slug) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Team One', 'team-one'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Team Two', 'team-two'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Team Three', 'team-three'),
  ('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Team Four', 'team-four');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner1@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'owner2@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'owner3@example.com'),
  ('00000000-0000-0000-0000-000000000004', 'plain@example.com');
update public.fantasy_teams set owner_id = '00000000-0000-0000-0000-000000000001' where slug = 'team-one';
update public.fantasy_teams set owner_id = '00000000-0000-0000-0000-000000000002' where slug = 'team-two';
update public.fantasy_teams set owner_id = '00000000-0000-0000-0000-000000000003' where slug = 'team-three';
-- In ww, T1 and T2 both hold W1 and T3 and T4 both hold W2.
insert into public.picks (fantasy_team_id, sport_id, participant_id)
select t.id, s.id, p.id
from (values
  ('team-one', 'aa', 'A1'), ('team-one', 'bb', 'B1'), ('team-one', 'cc', 'C1'), ('team-one', 'ww', 'W1'),
  ('team-two', 'aa', 'A2'), ('team-two', 'bb', 'B2'), ('team-two', 'cc', 'C2'), ('team-two', 'ww', 'W1'),
  ('team-three', 'aa', 'A3'), ('team-three', 'bb', 'B3'), ('team-three', 'cc', 'C3'), ('team-three', 'ww', 'W2'),
  ('team-four', 'aa', 'A4'), ('team-four', 'bb', 'B4'), ('team-four', 'cc', 'C4'), ('team-four', 'ww', 'W2')
) v (team_slug, sport_code, participant_name)
join public.fantasy_teams t on t.slug = v.team_slug
join public.sports s on s.code = v.sport_code
join public.participants p on p.sport_id = s.id and p.name = v.participant_name;
-- A pick that already carries a baseline (as if acquired earlier), for the banking arithmetic.
update public.picks set baseline_points = 10.5, baseline_championships = 1, baseline_postseason_points = 4
where fantasy_team_id = '50000000-0000-0000-0000-000000000002' and sport_id = '20000000-0000-0000-0000-000000000001';

-- Trade state that a move must (or must not) touch. Raw inserts, so each listing and offer can be
-- shaped exactly: the trade functions would refuse a second live listing of the same pick.
--   T1: L1 aa+bb, L2 bb only, L3 aa but expired.   T3: L4 aa, L5 bb, L7 aa but expired.   T2: L6 aa.
insert into public.trade_listings (id, season_id, owner_team_id, kind, closes_at) values
  ('e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'block', now() + interval '24 hours'),
  ('e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'block', now() + interval '24 hours'),
  ('e0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'block', now() - interval '1 hour'),
  ('e0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'block', now() + interval '24 hours'),
  ('e0000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'block', now() + interval '24 hours'),
  ('e0000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'block', now() + interval '24 hours'),
  ('e0000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'block', now() - interval '1 hour');
insert into public.trade_listing_items (listing_id, sport_id, participant_id) values
  ('e0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-0000000000b1'),
  ('e0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-0000000000b1'),
  ('e0000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000a3'),
  ('e0000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-0000000000b3'),
  ('e0000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000a2'),
  ('e0000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000a3');
-- o1, o5: others' offers on T1's L1.  o2, o3: T1's offers on T3's L4 (aa) and L5 (bb).
-- o6: T2's offer on T1's expired L3.   o7: T1's offer on T3's expired L7.   o8: T3's offer on T2's L6.
insert into public.trade_offers (id, listing_id, offering_team_id) values
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003'),
  ('e1000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002'),
  ('e1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002'),
  ('e1000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000007', '50000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000003');
insert into public.trade_offer_legs (offer_id, sport_id, listing_id, participant_id) values
  ('e1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000a3'),
  ('e1000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000b2'),
  ('e1000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-0000000000b1'),
  ('e1000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-0000000000a2'),
  ('e1000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-0000000000a3');

create function pg_temp.set_caller(uid uuid, role_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', role_name)::text, true);
  execute format('set local role %I', role_name);
end $$;
grant execute on function pg_temp.set_caller(uuid, text) to public;

-- Ids created by the function are stashed in transaction-local settings so later steps (which run
-- under other roles) can read them; a temp table would not be readable across roles.
create function pg_temp.tid(k text) returns uuid language sql as $$ select current_setting('t.' || k)::uuid $$;
grant execute on function pg_temp.tid(text) to public;

-- Short forms for the fixture ids above: user n, team n, participant by suffix (a1, b5, d3...).
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.t(n int) returns uuid language sql as $$
  select ('50000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.p(suffix text) returns uuid language sql as $$
  select ('40000000-0000-0000-0000-0000000000' || suffix)::uuid $$;
-- One entry of the live-scores array the server passes in.
create function pg_temp.sc(suffix text, pts numeric, champs int, post numeric) returns jsonb language sql as $$
  select jsonb_build_object('participant_id', pg_temp.p(suffix), 'points', pts, 'championships', champs, 'postseason_points', post) $$;
grant execute on function pg_temp.u(int), pg_temp.t(int), pg_temp.p(text), pg_temp.sc(text, numeric, int, numeric) to public;

-- ===== schema constraints (table owner, RLS out of the picture) =====
select is(enum_range(null::public.banked_source)::text, '{trade,free_agent}', 'banked_source has the two sources');
select throws_ok(
  $$insert into public.free_agent_moves (season_id, fantasy_team_id, sport_id, dropped_participant_id, added_participant_id)
    values ('10000000-0000-0000-0000-000000000001', pg_temp.t(1), '20000000-0000-0000-0000-000000000001', pg_temp.p('a1'), pg_temp.p('a1'))$$,
  '23514', null, 'a move cannot drop and add the same participant');
select throws_ok(
  $$insert into public.free_agent_moves (season_id, fantasy_team_id, sport_id, dropped_participant_id, added_participant_id)
    values ('10000000-0000-0000-0000-000000000001', pg_temp.t(1), '20000000-0000-0000-0000-000000000001', pg_temp.p('a1'), pg_temp.p('b5'))$$,
  '23503', null, 'the added participant must belong to the move''s sport');
select throws_ok(
  $$insert into public.free_agent_moves (season_id, fantasy_team_id, sport_id, dropped_participant_id, added_participant_id)
    values ('10000000-0000-0000-0000-000000000001', pg_temp.t(1), '20000000-0000-0000-0000-000000000001', pg_temp.p('b1'), pg_temp.p('a5'))$$,
  '23503', null, 'the dropped participant must belong to the move''s sport');
select throws_ok(
  $$insert into public.free_agent_moves (season_id, fantasy_team_id, sport_id, dropped_participant_id, added_participant_id)
    values ('10000000-0000-0000-0000-000000000009', pg_temp.t(1), '20000000-0000-0000-0000-000000000001', pg_temp.p('a1'), pg_temp.p('a5'))$$,
  '23503', null, 'the team must belong to the move''s season');
select throws_ok(
  $$insert into public.banked_scores (fantasy_team_id, sport_id, participant_id, source, trade_offer_id, points, championships, postseason_points)
    values (pg_temp.t(1), '20000000-0000-0000-0000-000000000001', pg_temp.p('a1'), 'free_agent', 'e1000000-0000-0000-0000-000000000001', 1, 0, 0)$$,
  '23514', null, 'a free-agent banked row cannot reference a trade offer');
insert into public.free_agent_moves (id, season_id, fantasy_team_id, sport_id, dropped_participant_id, added_participant_id) values
  ('f0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', pg_temp.t(1), '20000000-0000-0000-0000-000000000001', pg_temp.p('a1'), pg_temp.p('a5'));
select throws_ok(
  $$insert into public.banked_scores (fantasy_team_id, sport_id, participant_id, source, free_agent_move_id, points, championships, postseason_points)
    values (pg_temp.t(1), '20000000-0000-0000-0000-000000000001', pg_temp.p('a1'), 'trade', 'f0000000-0000-0000-0000-000000000001', 1, 0, 0)$$,
  '23514', null, 'a trade banked row cannot reference a free-agent move');
select lives_ok(
  $$insert into public.banked_scores (id, fantasy_team_id, sport_id, participant_id, source, free_agent_move_id, points, championships, postseason_points)
    values ('f1000000-0000-0000-0000-000000000001', pg_temp.t(1), '20000000-0000-0000-0000-000000000001', pg_temp.p('a1'), 'free_agent', 'f0000000-0000-0000-0000-000000000001', 1, 0, 0)$$,
  'a free-agent banked row can reference its move');
select lives_ok(
  $$insert into public.banked_scores (id, fantasy_team_id, sport_id, participant_id, trade_offer_id, points, championships, postseason_points)
    values ('f1000000-0000-0000-0000-000000000002', pg_temp.t(1), '20000000-0000-0000-0000-000000000001', pg_temp.p('a1'), 'e1000000-0000-0000-0000-000000000001', 1, 0, 0)$$,
  'a banked insert that names no source is accepted');
select is((select source::text from public.banked_scores where id = 'f1000000-0000-0000-0000-000000000002'), 'trade', 'an unspecified source defaults to trade');
select lives_ok(
  $$delete from public.free_agent_moves where id = 'f0000000-0000-0000-0000-000000000001'$$,
  'a move with banked points can be deleted');
select results_eq(
  $$select source::text, free_agent_move_id from public.banked_scores where id = 'f1000000-0000-0000-0000-000000000001'$$,
  $$values ('free_agent'::text, null::uuid)$$,
  'the banked row survives the move, keeping its source with no move reference');
-- Clear the raw banked fixtures so the function tests start from an empty state.
delete from public.banked_scores;

-- ===== make_free_agent_move: a plain drop and add (service_role) =====
select pg_temp.set_caller(null, 'service_role');
select lives_ok(
  $$select set_config('t.m1', public.make_free_agent_move(
      pg_temp.u(1), 'aa', pg_temp.p('a1'), pg_temp.p('a5'),
      jsonb_build_array(pg_temp.sc('a1', 7.25, 1, 2), pg_temp.sc('a5', 3, 0, 1)),
      'Team One moved', '{"type": "free_agent_move"}')::text, true)$$,
  'a team owner can drop their pick and add a free agent');
select is(
  (select participant_id from public.picks where fantasy_team_id = pg_temp.t(1) and sport_id = '20000000-0000-0000-0000-000000000001'),
  pg_temp.p('a5'), 'the pick now points at the added participant');
select results_eq(
  $$select baseline_points, baseline_championships, baseline_postseason_points from public.picks
    where fantasy_team_id = pg_temp.t(1) and sport_id = '20000000-0000-0000-0000-000000000001'$$,
  $$values (3::numeric, 0, 1::numeric)$$,
  'the added participant''s live score is the new baseline');
select ok(
  (select acquired_at is not null from public.picks where fantasy_team_id = pg_temp.t(1) and sport_id = '20000000-0000-0000-0000-000000000001'),
  'the pick is marked as acquired');
select is((select count(*)::int from public.picks where fantasy_team_id = pg_temp.t(1)), 4, 'the team still has exactly one pick per sport');
select results_eq(
  $$select participant_id, points, championships, postseason_points, source::text, free_agent_move_id
    from public.banked_scores where fantasy_team_id = pg_temp.t(1)$$,
  $$select pg_temp.p('a1'), 7.25::numeric, 1, 2::numeric, 'free_agent'::text, pg_temp.tid('m1')$$,
  'exactly one banked row: what the team earned from the dropped participant (baseline was zero)');
select results_eq(
  $$select season_id, fantasy_team_id, sport_id, dropped_participant_id, added_participant_id, created_by
    from public.free_agent_moves$$,
  $$select '10000000-0000-0000-0000-000000000001'::uuid, pg_temp.t(1), '20000000-0000-0000-0000-000000000001'::uuid,
           pg_temp.p('a1'), pg_temp.p('a5'), pg_temp.u(1)$$,
  'exactly one move row records who dropped and added whom');
select is(
  (select count(*)::int from public.messages
    where kind = 'league' and body = 'Team One moved'
      and payload ->> 'moveId' = pg_temp.tid('m1')::text and payload ->> 'type' = 'free_agent_move'
      and season_id = '10000000-0000-0000-0000-000000000001'),
  1, 'one league post is written with the move id injected into its payload');

-- ===== side effects on listings and offers (after T1's aa move) =====
select results_eq(
  $$select status::text, resolved_at is not null from public.trade_listings where id = 'e0000000-0000-0000-0000-000000000001'$$,
  $$values ('cancelled'::text, true)$$,
  'the team''s open listing that includes the sport is cancelled and stamped resolved');
select is(
  (select count(*)::int from public.trade_offers
    where id in ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000005')
      and status = 'void' and resolved_at is not null),
  2, 'pending offers on the cancelled listing are void, including one for another sport of it');
select results_eq(
  $$select status::text, resolved_at is null from public.trade_listings where id = 'e0000000-0000-0000-0000-000000000002'$$,
  $$values ('open'::text, true)$$,
  'a listing that covers only another sport is untouched');
select results_eq(
  $$select status::text, resolved_at is null from public.trade_listings where id = 'e0000000-0000-0000-0000-000000000003'$$,
  $$values ('open'::text, true)$$,
  'an expired listing stays open so it still reads as expired');
select is((select status::text from public.trade_offers where id = 'e1000000-0000-0000-0000-000000000006'), 'pending', 'an offer on an expired listing is untouched');
select results_eq(
  $$select status::text, resolved_at is not null from public.trade_offers where id = 'e1000000-0000-0000-0000-000000000002'$$,
  $$values ('void'::text, true)$$,
  'the team''s pending offer elsewhere that gives this sport''s pick is void');
select is((select status::text from public.trade_offers where id = 'e1000000-0000-0000-0000-000000000003'), 'pending', 'its pending offer in another sport is untouched');
select is((select status::text from public.trade_offers where id = 'e1000000-0000-0000-0000-000000000007'), 'pending', 'its offer on an expired listing is untouched');
select is(
  (select count(*)::int from public.trade_listings
    where id in ('e0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000005',
                 'e0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000007')
      and status = 'open' and resolved_at is null),
  4, 'other teams'' listings are untouched');
select is((select status::text from public.trade_offers where id = 'e1000000-0000-0000-0000-000000000008'), 'pending', 'other teams'' offers are untouched');

-- ===== refusals =====
-- Most refusals pass '[]' for the scores on purpose: the token must win over missing_scores.
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(4), 'aa', pg_temp.p('a2'), pg_temp.p('a6'), '[]', 'x', '{}')$$,
  'P0001', 'not_owner', 'a user without a team cannot move');
select throws_ok(
  $$select public.make_free_agent_move(null, 'aa', pg_temp.p('a2'), pg_temp.p('a6'), '[]', 'x', '{}')$$,
  'P0001', 'not_owner', 'a null actor cannot move');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(2), 'zz', pg_temp.p('a2'), pg_temp.p('a6'), '[]', 'x', '{}')$$,
  'P0001', 'invalid_sport', 'an unknown sport code is invalid');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(2), null, pg_temp.p('a2'), pg_temp.p('a6'), '[]', 'x', '{}')$$,
  'P0001', 'invalid_sport', 'a null sport code is invalid');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(2), 'cc', pg_temp.p('c2'), pg_temp.p('c3'), '[]', 'x', '{}')$$,
  'P0001', 'invalid_sport', 'a sport that exists but is not in the team''s season is invalid');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(1), 'aa', pg_temp.p('a1'), pg_temp.p('a6'), '[]', 'x', '{}')$$,
  'P0001', 'stale_pick', 'dropping a participant the team no longer holds is stale');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(2), 'aa', pg_temp.p('a3'), pg_temp.p('a6'), '[]', 'x', '{}')$$,
  'P0001', 'stale_pick', 'dropping another team''s participant is stale');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(1), 'ww', pg_temp.p('d2'), pg_temp.p('d3'), '[]', 'x', '{}')$$,
  'P0001', 'stale_pick', 'a drop that does not match the current pick is stale even in a duplicate-friendly sport');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(1), 'aa', pg_temp.p('a5'), pg_temp.p('a5'), '[]', 'x', '{}')$$,
  'P0001', 'same_participant', 'dropping and adding the same participant is refused');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(1), 'aa', pg_temp.p('a5'), pg_temp.p('b5'), '[]', 'x', '{}')$$,
  'P0001', 'not_found', 'a participant from another sport is not found');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(1), 'aa', pg_temp.p('a5'), 'ee000000-0000-0000-0000-000000000000', '[]', 'x', '{}')$$,
  'P0001', 'not_found', 'an unknown participant is not found');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(1), 'aa', pg_temp.p('a5'), null, '[]', 'x', '{}')$$,
  'P0001', 'not_found', 'a null participant is not found');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(1), 'aa', pg_temp.p('a5'), pg_temp.p('a4'), '[]', 'x', '{}')$$,
  'P0001', 'not_free_agent', 'a participant held by an unowned team is not a free agent');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(1), 'aa', pg_temp.p('a5'), pg_temp.p('a2'), '[]', 'x', '{}')$$,
  'P0001', 'not_free_agent', 'a participant held by another owner is not a free agent');
-- Sequential stand-in for the race (pgTAP is one session): the second team to ask for A5 finds it
-- taken, and gets the refusal even with perfectly good scores.
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(2), 'aa', pg_temp.p('a2'), pg_temp.p('a5'),
      jsonb_build_array(pg_temp.sc('a2', 1, 0, 0), pg_temp.sc('a5', 1, 0, 0)), 'x', '{}')$$,
  'P0001', 'not_free_agent', 'the second team to add the same free agent loses');

-- T3 asks to swap A3 for the free agent A6; only the scores vary.
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(3), 'aa', pg_temp.p('a3'), pg_temp.p('a6'), null, 'x', '{}')$$,
  'P0001', 'missing_scores', 'null scores are refused');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(3), 'aa', pg_temp.p('a3'), pg_temp.p('a6'), '{"points": 1}', 'x', '{}')$$,
  'P0001', 'missing_scores', 'scores that are not an array are refused');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(3), 'aa', pg_temp.p('a3'), pg_temp.p('a6'),
      jsonb_build_array(pg_temp.sc('a3', 1, 0, 0)), 'x', '{}')$$,
  'P0001', 'missing_scores', 'scores without the added participant are refused');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(3), 'aa', pg_temp.p('a3'), pg_temp.p('a6'),
      jsonb_build_array(pg_temp.sc('a6', 1, 0, 0)), 'x', '{}')$$,
  'P0001', 'missing_scores', 'scores without the dropped participant are refused');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(3), 'aa', pg_temp.p('a3'), pg_temp.p('a6'),
      jsonb_build_array(pg_temp.sc('a3', 1, 0, 0),
        jsonb_build_object('participant_id', pg_temp.p('a6'), 'points', 1, 'championships', 0)), 'x', '{}')$$,
  'P0001', 'missing_scores', 'an entry with a missing field is refused');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(3), 'aa', pg_temp.p('a3'), pg_temp.p('a6'),
      jsonb_build_array(pg_temp.sc('a3', 1, 0, 0),
        jsonb_build_object('participant_id', pg_temp.p('a6'), 'points', 1, 'championships', null, 'postseason_points', 0)), 'x', '{}')$$,
  'P0001', 'missing_scores', 'an entry with a null field is refused');

-- ===== failed calls wrote nothing =====
select is((select count(*)::int from public.free_agent_moves), 1, 'failed calls wrote no moves');
select is((select count(*)::int from public.messages where kind = 'league' and season_id = '10000000-0000-0000-0000-000000000001'), 1, 'failed calls wrote no posts');
select is((select count(*)::int from public.banked_scores), 1, 'failed calls banked nothing');
select is((select count(*)::int from public.picks where acquired_at is not null), 1, 'failed calls changed no picks');
select is(
  (select participant_id from public.picks where fantasy_team_id = pg_temp.t(3) and sport_id = '20000000-0000-0000-0000-000000000001'),
  pg_temp.p('a3'), 'T3 still holds its original pick');
select is((select count(*)::int from public.trade_listings where status = 'cancelled'), 1, 'failed calls cancelled no listings');
select is((select count(*)::int from public.trade_offers where status = 'void'), 3, 'failed calls voided no offers');

-- ===== duplicate-friendly sport =====
select lives_ok(
  $$select set_config('t.m2', public.make_free_agent_move(
      pg_temp.u(3), 'ww', pg_temp.p('d2'), pg_temp.p('d1'),
      jsonb_build_array(pg_temp.sc('d2', 4, 0, 0), pg_temp.sc('d1', 9, 0, 1)), 'Team Three moved', '{}')::text, true)$$,
  'a team can add a participant that other teams already hold in a duplicate-friendly sport');
select is(
  (select count(*)::int from public.picks where participant_id = pg_temp.p('d1')),
  3, 'the other holders keep their picks');
select results_eq(
  $$select baseline_points, baseline_postseason_points from public.picks where fantasy_team_id = pg_temp.t(3) and sport_id = '20000000-0000-0000-0000-000000000004'$$,
  $$values (9::numeric, 1::numeric)$$,
  'the added participant''s score is the baseline there too');

-- ===== a dropped participant returns to the pool; banking against a baseline =====
select lives_ok(
  $$select set_config('t.m3', public.make_free_agent_move(
      pg_temp.u(3), 'aa', pg_temp.p('a3'), pg_temp.p('a1'),
      jsonb_build_array(pg_temp.sc('a3', 3, 0, 0), pg_temp.sc('a1', 8, 1, 2)), 'Team Three moved again', '{}')::text, true)$$,
  'a participant another team dropped can be added');
select results_eq(
  $$select status::text, resolved_at is not null from public.trade_listings where id = 'e0000000-0000-0000-0000-000000000004'$$,
  $$values ('cancelled'::text, true)$$,
  'T3''s own live listing in the sport is cancelled');
select is((select status::text from public.trade_listings where id = 'e0000000-0000-0000-0000-000000000007'), 'open', 'T3''s expired listing stays open');
select is((select status::text from public.trade_offers where id = 'e1000000-0000-0000-0000-000000000008'), 'void', 'T3''s offer on another team''s live listing that gave this pick is void');
select is((select status::text from public.trade_listings where id = 'e0000000-0000-0000-0000-000000000006'), 'open', 'the listing that offer sat on is untouched');

select lives_ok(
  $$select set_config('t.m4', public.make_free_agent_move(
      pg_temp.u(2), 'aa', pg_temp.p('a2'), pg_temp.p('a6'),
      jsonb_build_array(pg_temp.sc('a2', 12, 1, 5), pg_temp.sc('a6', 3, 0, 2)), 'Team Two moved', '{}')::text, true)$$,
  'a team whose pick already had a baseline can move');
select results_eq(
  $$select points, championships, postseason_points from public.banked_scores
    where fantasy_team_id = pg_temp.t(2) and free_agent_move_id = pg_temp.tid('m4')$$,
  $$values (1.5::numeric, 0, 1::numeric)$$,
  'banked values are live minus baseline for all three components (12 - 10.5, 1 - 1, 5 - 4)');
select is((select status::text from public.trade_listings where id = 'e0000000-0000-0000-0000-000000000006'), 'cancelled', 'T2''s own listing is cancelled by its move');
select is((select status::text from public.trade_offers where id = 'e1000000-0000-0000-0000-000000000006'), 'pending', 'T2''s offer on an expired listing is still untouched');

-- ===== chained moves in one sport =====
select lives_ok(
  $$select public.make_free_agent_move(
      pg_temp.u(1), 'bb', pg_temp.p('b1'), pg_temp.p('b5'),
      jsonb_build_array(pg_temp.sc('b1', 2, 0, 0), pg_temp.sc('b5', 4, 0, 1)), 'Team One moved in B', '{}')$$,
  'a first move in another sport');
select is((select status::text from public.trade_listings where id = 'e0000000-0000-0000-0000-000000000002'), 'cancelled', 'the bb-only listing is now cancelled');
select is((select status::text from public.trade_offers where id = 'e1000000-0000-0000-0000-000000000003'), 'void', 'and the offer that gave the bb pick is void');
select lives_ok(
  $$select public.make_free_agent_move(
      pg_temp.u(1), 'bb', pg_temp.p('b5'), pg_temp.p('b6'),
      jsonb_build_array(pg_temp.sc('b5', 6, 1, 1), pg_temp.sc('b6', 1, 0, 0)), 'Team One moved in B again', '{}')$$,
  'a second move in the same sport');
select results_eq(
  $$select participant_id, points, championships, postseason_points from public.banked_scores
    where fantasy_team_id = pg_temp.t(1) and sport_id = '20000000-0000-0000-0000-000000000002'
    order by participant_id$$,
  $$values (pg_temp.p('b1'), 2::numeric, 0, 0::numeric), (pg_temp.p('b5'), 2::numeric, 1, 0::numeric)$$,
  'the second move banks against the first move''s baseline (6 - 4, 1 - 0, 1 - 1), and the first row stays');
select is((select count(*)::int from public.free_agent_moves), 6, 'every successful call wrote one move');
select is(
  (select count(*)::int from public.messages m join public.free_agent_moves f on f.id::text = m.payload ->> 'moveId'),
  6, 'every move has exactly its own post');
select is((select count(*)::int from public.picks where fantasy_team_id in (select id from public.fantasy_teams where season_id = '10000000-0000-0000-0000-000000000001')), 16, 'moves change picks in place, never add or remove them');
reset role;

-- ===== read access: everyone can read =====
select pg_temp.set_caller(null, 'anon');
select ok((select count(*) from public.free_agent_moves) > 0, 'anon reads moves');
select ok((select count(*) from public.banked_scores where source = 'free_agent') > 0, 'anon reads the banked source');
reset role;
select pg_temp.set_caller(pg_temp.u(4), 'authenticated');
select ok((select count(*) from public.free_agent_moves) > 0, 'authenticated reads moves');
reset role;

-- ===== direct writes are denied =====
select pg_temp.set_caller(pg_temp.u(1), 'authenticated');
select throws_ok(
  $$insert into public.free_agent_moves (season_id, fantasy_team_id, sport_id, dropped_participant_id, added_participant_id)
    values ('10000000-0000-0000-0000-000000000001', pg_temp.t(1), '20000000-0000-0000-0000-000000000001', pg_temp.p('a5'), pg_temp.p('a6'))$$,
  '42501', null, 'authenticated cannot insert a move');
select throws_ok(
  $$update public.free_agent_moves set added_participant_id = pg_temp.p('a6')$$,
  '42501', null, 'authenticated cannot update a move');
select throws_ok($$delete from public.free_agent_moves$$, '42501', null, 'authenticated cannot delete moves');
select throws_ok(
  $$insert into public.banked_scores (fantasy_team_id, sport_id, participant_id, source, points, championships, postseason_points)
    values (pg_temp.t(1), '20000000-0000-0000-0000-000000000001', pg_temp.p('a1'), 'free_agent', 99, 0, 0)$$,
  '42501', null, 'authenticated cannot insert banked scores');
reset role;
select pg_temp.set_caller(null, 'anon');
select throws_ok(
  $$insert into public.free_agent_moves (season_id, fantasy_team_id, sport_id, dropped_participant_id, added_participant_id)
    values ('10000000-0000-0000-0000-000000000001', pg_temp.t(1), '20000000-0000-0000-0000-000000000001', pg_temp.p('a5'), pg_temp.p('a6'))$$,
  '42501', null, 'anon cannot insert a move');
select throws_ok(
  $$update public.free_agent_moves set added_participant_id = pg_temp.p('a6')$$,
  '42501', null, 'anon cannot update a move');
select throws_ok($$delete from public.free_agent_moves$$, '42501', null, 'anon cannot delete moves');
select throws_ok(
  $$insert into public.banked_scores (fantasy_team_id, sport_id, participant_id, source, points, championships, postseason_points)
    values (pg_temp.t(1), '20000000-0000-0000-0000-000000000001', pg_temp.p('a1'), 'free_agent', 99, 0, 0)$$,
  '42501', null, 'anon cannot insert banked scores');
reset role;

select is(
  (select count(*)::int
   from unnest(array['free_agent_moves', 'banked_scores']) t
   cross join unnest(array['anon', 'authenticated']) r
   cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
   where has_table_privilege(r, 'public.' || t, p)),
  0, 'anon and authenticated hold no write privilege on moves or banked scores');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'free_agent_moves' and cmd <> 'SELECT'),
  0, 'moves have no write policies');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'free_agent_moves' and cmd = 'SELECT'),
  1, 'moves have exactly one read policy');
select is(
  (select relrowsecurity from pg_class where oid = 'public.free_agent_moves'::regclass),
  true, 'RLS is enabled on moves');

-- ===== function execution =====
select is(
  (select prosecdef from pg_proc where oid = 'public.make_free_agent_move(uuid,text,uuid,uuid,jsonb,text,jsonb)'::regprocedure),
  true, 'the move function is SECURITY DEFINER');
select is(
  (select count(*)::int
   from unnest(array['anon', 'authenticated']) r
   where has_function_privilege(r, 'public.make_free_agent_move(uuid,text,uuid,uuid,jsonb,text,jsonb)', 'execute')),
  0, 'anon and authenticated cannot execute the move function');
select is(
  has_function_privilege('service_role', 'public.make_free_agent_move(uuid,text,uuid,uuid,jsonb,text,jsonb)', 'execute'),
  true, 'service_role can execute the move function');
select is(
  (select count(*)::int
   from unnest(array[
     'public.trade_actor_team(uuid)',
     'public.trade_locked_picks(uuid[],uuid[])',
     'public.trade_live_score(jsonb,uuid)'
   ]) f
   cross join unnest(array['anon', 'authenticated', 'service_role']) r
   where has_function_privilege(r, f::regprocedure, 'execute')),
  0, 'the reused trade helpers stay revoked from every role');

select pg_temp.set_caller(pg_temp.u(1), 'authenticated');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(1), 'aa', pg_temp.p('a5'), pg_temp.p('a6'), '[]', 'x', '{}')$$,
  '42501', null, 'a signed-in user cannot call the move function directly, even as themselves');
reset role;
select pg_temp.set_caller(null, 'anon');
select throws_ok(
  $$select public.make_free_agent_move(pg_temp.u(1), 'aa', pg_temp.p('a5'), pg_temp.p('a6'), '[]', 'x', '{}')$$,
  '42501', null, 'anon cannot call the move function');
reset role;

-- ===== cascade =====
select is((select count(*)::int from public.free_agent_moves where fantasy_team_id = pg_temp.t(2)), 1, 'before the delete, Team Two has a move');
select lives_ok($$delete from public.fantasy_teams where id = pg_temp.t(2)$$, 'a team with moves can be deleted');
select is((select count(*)::int from public.free_agent_moves where fantasy_team_id = pg_temp.t(2)), 0, 'deleting a team deletes its moves');
select is((select count(*)::int from public.banked_scores where fantasy_team_id = pg_temp.t(2)), 0, 'and its banked rows');
select is((select count(*)::int from public.free_agent_moves), 5, 'other teams'' moves are untouched');

-- ===== daily refresh job =====
select is((select count(*)::int from cron.job where jobname = 'cincy-free-agent-refresh'), 1, 'the free-agent refresh job is scheduled');
select is((select schedule from cron.job where jobname = 'cincy-free-agent-refresh'), '0 9 * * *', 'it runs daily at 09:00 UTC');
select ok(
  (select command like '%/api/cron/free-agents?sport=%' and command like '%from public.sports%'
   from cron.job where jobname = 'cincy-free-agent-refresh'),
  'it calls the route once per sport from the sports table');

select * from finish();
rollback;
