-- Trades: schema constraints, the service_role-only write functions (listing, offers, accept and
-- its side effects), and read-only access for everyone else. Fixtures are self-contained.
begin;
create extension if not exists pgtap with schema extensions;
select plan(187);

-- The seed may already have an active season; only one can be active at a time.
update public.seasons set is_active = false;
insert into public.seasons (id, name, starts_on, ends_on, is_active) values
  ('10000000-0000-0000-0000-000000000001', 'test-season', '2030-01-01', '2030-12-31', true);
-- aa..cc forbid duplicate picks; ww (the WNBA stand-in) lets two teams hold the same participant.
insert into public.sports (id, code, name, participant_kind, espn_sport, espn_league, allows_duplicate_picks) values
  ('20000000-0000-0000-0000-000000000001', 'aa', 'Sport A', 'team', 'testa', 'a', false),
  ('20000000-0000-0000-0000-000000000002', 'bb', 'Sport B', 'team', 'testb', 'b', false),
  ('20000000-0000-0000-0000-000000000003', 'cc', 'Sport C', 'team', 'testc', 'c', false),
  ('20000000-0000-0000-0000-000000000004', 'ww', 'Sport W', 'team', 'testw', 'w', true);
insert into public.participants (id, sport_id, name, short_name) values
  ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'A1', 'A1'),
  ('40000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-000000000001', 'A2', 'A2'),
  ('40000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-000000000001', 'A3', 'A3'),
  ('40000000-0000-0000-0000-0000000000a4', '20000000-0000-0000-0000-000000000001', 'A4', 'A4'),
  ('40000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000002', 'B1', 'B1'),
  ('40000000-0000-0000-0000-0000000000b2', '20000000-0000-0000-0000-000000000002', 'B2', 'B2'),
  ('40000000-0000-0000-0000-0000000000b3', '20000000-0000-0000-0000-000000000002', 'B3', 'B3'),
  ('40000000-0000-0000-0000-0000000000b4', '20000000-0000-0000-0000-000000000002', 'B4', 'B4'),
  ('40000000-0000-0000-0000-0000000000b5', '20000000-0000-0000-0000-000000000002', 'B5', 'B5'),
  ('40000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-000000000003', 'C1', 'C1'),
  ('40000000-0000-0000-0000-0000000000c2', '20000000-0000-0000-0000-000000000003', 'C2', 'C2'),
  ('40000000-0000-0000-0000-0000000000c3', '20000000-0000-0000-0000-000000000003', 'C3', 'C3'),
  ('40000000-0000-0000-0000-0000000000c4', '20000000-0000-0000-0000-000000000003', 'C4', 'C4'),
  ('40000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-000000000004', 'W1', 'W1'),
  ('40000000-0000-0000-0000-0000000000d2', '20000000-0000-0000-0000-000000000004', 'W2', 'W2');
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

create function pg_temp.set_caller(uid uuid, role_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', role_name)::text, true);
  execute format('set local role %I', role_name);
end $$;
grant execute on function pg_temp.set_caller(uuid, text) to public;

-- Ids created by the functions are stashed in transaction-local settings so later steps (which
-- run under other roles) can read them; a temp table would not be readable across roles.
create function pg_temp.tid(k text) returns uuid language sql as $$ select current_setting('t.' || k)::uuid $$;
grant execute on function pg_temp.tid(text) to public;

-- The DETAIL of the error a statement raises (already_listed carries the blocking listing id).
create function pg_temp.err_detail(q text) returns text language plpgsql as $$
declare d text;
begin
  execute q;
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return d;
end $$;
grant execute on function pg_temp.err_detail(text) to public;

-- ===== schema constraints (table owner, RLS out of the picture) =====
select is((select trade_emails from public.profiles where id = '00000000-0000-0000-0000-000000000001'), true, 'trade_emails defaults to true');
select is((select baseline_points from public.picks limit 1), 0::numeric, 'drafted picks have a zero baseline');
select is((select count(*)::int from public.picks where acquired_at is not null), 0, 'drafted picks have no acquired_at');

insert into public.trade_listings (id, season_id, owner_team_id, kind, closes_at) values
  ('e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001', 'block', now() + interval '24 hours');
insert into public.trade_listing_items (listing_id, sport_id, participant_id) values
  ('e0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$insert into public.trade_listings (season_id, owner_team_id, kind, closes_at, resolved_at)
    values ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'block', now(), now())$$,
  '23514', null, 'an open listing cannot have a resolved_at');
select throws_ok(
  $$insert into public.trade_listings (season_id, owner_team_id, kind, status, closes_at)
    values ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'block', 'cancelled', now())$$,
  '23514', null, 'a cancelled listing needs a resolved_at');
select throws_ok(
  $$insert into public.trade_listings (season_id, owner_team_id, kind, closes_at)
    values ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000009', 'block', now())$$,
  '23503', null, 'the owner team must exist');
select throws_ok(
  $$insert into public.trade_listing_items (listing_id, sport_id, participant_id)
    values ('e0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-0000000000a2')$$,
  '23503', null, 'a listed participant must belong to the listed sport');
select throws_ok(
  $$insert into public.trade_offers (listing_id, offering_team_id, note)
    values ('e0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', '   ')$$,
  '23514', null, 'a blank offer note is rejected');
select throws_ok(
  $$insert into public.trade_offers (listing_id, offering_team_id, note)
    values ('e0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', repeat('x', 141))$$,
  '23514', null, 'an offer note over 140 characters is rejected');
select throws_ok(
  $$insert into public.trade_offers (listing_id, offering_team_id, status)
    values ('e0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'rejected')$$,
  '23514', null, 'a resolved offer needs a resolved_at');
insert into public.trade_offers (id, listing_id, offering_team_id) values
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002');
select throws_ok(
  $$insert into public.trade_offers (listing_id, offering_team_id)
    values ('e0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002')$$,
  '23505', null, 'a team can have only one pending offer per listing');
select throws_ok(
  $$insert into public.trade_offer_legs (offer_id, sport_id, listing_id, participant_id)
    values ('e1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
            'e0000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000b2')$$,
  '23503', null, 'a leg cannot be in a sport the listing does not offer');
select throws_ok(
  $$insert into public.trade_offer_legs (offer_id, sport_id, listing_id, participant_id)
    values ('e1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
            'e0000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000b2')$$,
  '23503', null, 'a leg participant must belong to the leg sport');
insert into public.trade_listings (id, season_id, owner_team_id, kind, closes_at) values
  ('e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000003', 'block', now() + interval '24 hours');
insert into public.trade_listing_items (listing_id, sport_id, participant_id) values
  ('e0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000a3');
select throws_ok(
  $$insert into public.trade_offer_legs (offer_id, sport_id, listing_id, participant_id)
    values ('e1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
            'e0000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-0000000000a2')$$,
  '23503', null, 'a leg cannot point at a different listing than its offer');
select throws_ok(
  $$update public.trade_listings set status = 'accepted', accepted_offer_id = 'e1000000-0000-0000-0000-000000000001', resolved_at = now()
    where id = 'e0000000-0000-0000-0000-000000000002'$$,
  '23503', null, 'a listing cannot accept another listing''s offer');
-- Clear the raw fixtures so the function tests start from an empty trade state.
delete from public.trade_offers;
delete from public.trade_listings;

-- ===== create_trade_listing (service_role) =====
select pg_temp.set_caller(null, 'service_role');
select lives_ok(
  $$select set_config('t.l1', public.create_trade_listing(
      '00000000-0000-0000-0000-000000000001', array['aa', 'bb'], 'Team One is shopping',
      '{"type": "trade_listed"}')::text, true)$$,
  'a team owner can list two of their sports');
select is((select kind::text from public.trade_listings where id = pg_temp.tid('l1')), 'block', 'the listing is a block listing');
select is((select owner_team_id from public.trade_listings where id = pg_temp.tid('l1')), '50000000-0000-0000-0000-000000000001'::uuid, 'owned by the actor''s team');
select is((select status::text from public.trade_listings where id = pg_temp.tid('l1')), 'open', 'the listing starts open');
select is((select closes_at - created_at from public.trade_listings where id = pg_temp.tid('l1')), interval '24 hours', 'the window is 24 hours');
select is(
  (select array_agg(participant_id order by participant_id) from public.trade_listing_items where listing_id = pg_temp.tid('l1')),
  array['40000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000b1']::uuid[],
  'items are the actor''s current picks in those sports');
select is(
  (select count(*)::int from public.messages
    where kind = 'league' and body = 'Team One is shopping'
      and payload ->> 'listingId' = pg_temp.tid('l1')::text and payload ->> 'type' = 'trade_listed'
      and season_id = '10000000-0000-0000-0000-000000000001'),
  1, 'one league post is written with the listing id injected into its payload');
select throws_ok(
  $$select public.create_trade_listing('00000000-0000-0000-0000-000000000004', array['aa'], 'x', '{}')$$,
  'P0001', 'not_owner', 'a user without a team cannot list');
select throws_ok(
  $$select public.create_trade_listing(null, array['aa'], 'x', '{}')$$,
  'P0001', 'not_owner', 'a null actor cannot list');
select throws_ok(
  $$select public.create_trade_listing('00000000-0000-0000-0000-000000000002', array[]::text[], 'x', '{}')$$,
  'P0001', 'invalid_sports', 'an empty sport list is invalid');
select throws_ok(
  $$select public.create_trade_listing('00000000-0000-0000-0000-000000000002', array['zz'], 'x', '{}')$$,
  'P0001', 'invalid_sports', 'an unknown sport code is invalid');
select throws_ok(
  $$select public.create_trade_listing('00000000-0000-0000-0000-000000000002', array['aa', 'aa'], 'x', '{}')$$,
  'P0001', 'invalid_sports', 'a duplicate sport code is invalid');
select throws_ok(
  $$select public.create_trade_listing('00000000-0000-0000-0000-000000000001', array['aa'], 'x', '{}')$$,
  'P0001', 'already_listed', 'a participant already on an open listing cannot be listed again');
select is(
  pg_temp.err_detail($$select public.create_trade_listing('00000000-0000-0000-0000-000000000001', array['aa'], 'x', '{}')$$),
  pg_temp.tid('l1')::text, 'already_listed names the blocking listing');
select is((select count(*)::int from public.messages where kind = 'league'), 1, 'failed calls wrote no posts');

-- ===== make_trade_offer =====
select lives_ok(
  $$select set_config('t.o1', public.make_trade_offer(
      '00000000-0000-0000-0000-000000000002', pg_temp.tid('l1'), array['aa'], 'nice pick',
      'Team Two offers', '{"type": "trade_offer"}')::text, true)$$,
  'another owner can offer on a subset of the listed sports');
select is((select status::text from public.trade_offers where id = pg_temp.tid('o1')), 'pending', 'the offer is pending');
select is((select note from public.trade_offers where id = pg_temp.tid('o1')), 'nice pick', 'the note is stored');
select is(
  (select array_agg(participant_id) from public.trade_offer_legs where offer_id = pg_temp.tid('o1')),
  array['40000000-0000-0000-0000-0000000000a2']::uuid[], 'the leg is the offerer''s current pick in that sport');
select is(
  (select count(*)::int from public.messages where payload ->> 'listingId' = pg_temp.tid('l1')::text and body = 'Team Two offers'),
  1, 'the offer writes a league post');
select throws_ok(
  $$select public.make_trade_offer('00000000-0000-0000-0000-000000000002', pg_temp.tid('l1'), array['aa'], null, 'x', '{}')$$,
  'P0001', 'duplicate_offer', 'a team can have only one pending offer per listing');
select throws_ok(
  $$select public.make_trade_offer('00000000-0000-0000-0000-000000000001', pg_temp.tid('l1'), array['aa'], null, 'x', '{}')$$,
  'P0001', 'own_listing', 'you cannot offer on your own team''s listing');
select throws_ok(
  $$select public.make_trade_offer('00000000-0000-0000-0000-000000000004', pg_temp.tid('l1'), array['aa'], null, 'x', '{}')$$,
  'P0001', 'not_owner', 'a user without a team cannot offer');
select throws_ok(
  $$select public.make_trade_offer('00000000-0000-0000-0000-000000000003', pg_temp.tid('l1'), array['cc'], null, 'x', '{}')$$,
  'P0001', 'invalid_sports', 'a sport that is not on the listing is invalid');
select throws_ok(
  $$select public.make_trade_offer('00000000-0000-0000-0000-000000000003', pg_temp.tid('l1'), array[]::text[], null, 'x', '{}')$$,
  'P0001', 'invalid_sports', 'an empty offer is invalid');
select throws_ok(
  $$select public.make_trade_offer('00000000-0000-0000-0000-000000000003', 'ee000000-0000-0000-0000-000000000000', array['aa'], null, 'x', '{}')$$,
  'P0001', 'not_found', 'an unknown listing is not found');
select throws_ok(
  $$select public.make_trade_offer('00000000-0000-0000-0000-000000000003', pg_temp.tid('l1'), array['aa'], repeat('x', 141), 'x', '{}')$$,
  '23514', null, 'an over-long note surfaces the constraint violation');
select lives_ok(
  $$select set_config('t.o2', public.make_trade_offer(
      '00000000-0000-0000-0000-000000000003', pg_temp.tid('l1'), array['aa', 'bb'], null, 'Team Three offers', '{}')::text, true)$$,
  'a competing offer can cover every listed sport');
select is((select count(*)::int from public.trade_offer_legs where offer_id = pg_temp.tid('o2')), 2, 'a two-sport offer has two legs');

-- ===== withdraw and reject =====
select throws_ok(
  $$select public.withdraw_trade_offer('00000000-0000-0000-0000-000000000003', pg_temp.tid('o1'))$$,
  'P0001', 'not_owner', 'only the offerer can withdraw');
select throws_ok(
  $$select public.withdraw_trade_offer('00000000-0000-0000-0000-000000000002', 'ee000000-0000-0000-0000-000000000000')$$,
  'P0001', 'not_found', 'withdrawing an unknown offer is not found');
select lives_ok(
  $$select public.withdraw_trade_offer('00000000-0000-0000-0000-000000000002', pg_temp.tid('o1'))$$,
  'the offerer can withdraw a pending offer');
select is((select status::text from public.trade_offers where id = pg_temp.tid('o1')), 'withdrawn', 'the offer is withdrawn');
select isnt((select resolved_at from public.trade_offers where id = pg_temp.tid('o1')), null, 'a withdrawn offer is stamped resolved');
select throws_ok(
  $$select public.withdraw_trade_offer('00000000-0000-0000-0000-000000000002', pg_temp.tid('o1'))$$,
  'P0001', 'offer_not_pending', 'a withdrawn offer cannot be withdrawn again');
select lives_ok(
  $$select set_config('t.o3', public.make_trade_offer(
      '00000000-0000-0000-0000-000000000002', pg_temp.tid('l1'), array['bb'], null, 'Team Two again', '{}')::text, true)$$,
  'a withdrawn offer does not block a new one');
select throws_ok(
  $$select public.reject_trade_offer('00000000-0000-0000-0000-000000000002', pg_temp.tid('o3'))$$,
  'P0001', 'not_owner', 'the offerer cannot reject their own offer');
select throws_ok(
  $$select public.reject_trade_offer('00000000-0000-0000-0000-000000000003', pg_temp.tid('o3'))$$,
  'P0001', 'not_owner', 'a third team cannot reject');
select lives_ok(
  $$select public.reject_trade_offer('00000000-0000-0000-0000-000000000001', pg_temp.tid('o3'))$$,
  'the listing owner can reject an offer');
select is((select status::text from public.trade_offers where id = pg_temp.tid('o3')), 'rejected', 'the offer is rejected');
select throws_ok(
  $$select public.reject_trade_offer('00000000-0000-0000-0000-000000000001', pg_temp.tid('o3'))$$,
  'P0001', 'offer_not_pending', 'a rejected offer cannot be rejected again');
select throws_ok(
  $$select public.withdraw_trade_offer('00000000-0000-0000-0000-000000000002', pg_temp.tid('o3'))$$,
  'P0001', 'offer_not_pending', 'a rejected offer cannot be withdrawn');

-- ===== cancel_trade_listing =====
select lives_ok(
  $$select set_config('t.l2', public.create_trade_listing(
      '00000000-0000-0000-0000-000000000003', array['cc'], 'Team Three lists', '{}')::text, true)$$,
  'another team lists');
select lives_ok(
  $$select set_config('t.o4', public.make_trade_offer(
      '00000000-0000-0000-0000-000000000002', pg_temp.tid('l2'), array['cc'], null, 'Team Two offers C', '{}')::text, true)$$,
  'and receives an offer');
select throws_ok(
  $$select public.cancel_trade_listing('00000000-0000-0000-0000-000000000002', pg_temp.tid('l2'))$$,
  'P0001', 'not_owner', 'only the owner can cancel a listing');
select throws_ok(
  $$select public.cancel_trade_listing('00000000-0000-0000-0000-000000000003', 'ee000000-0000-0000-0000-000000000000')$$,
  'P0001', 'not_found', 'cancelling an unknown listing is not found');
select lives_ok(
  $$select public.cancel_trade_listing('00000000-0000-0000-0000-000000000003', pg_temp.tid('l2'))$$,
  'the owner can cancel their listing');
select is((select status::text from public.trade_listings where id = pg_temp.tid('l2')), 'cancelled', 'the listing is cancelled');
select isnt((select resolved_at from public.trade_listings where id = pg_temp.tid('l2')), null, 'a cancelled listing is stamped resolved');
select is((select status::text from public.trade_offers where id = pg_temp.tid('o4')), 'void', 'its pending offers are voided');
select throws_ok(
  $$select public.cancel_trade_listing('00000000-0000-0000-0000-000000000003', pg_temp.tid('l2'))$$,
  'P0001', 'listing_closed', 'a cancelled listing cannot be cancelled again');
select throws_ok(
  $$select public.make_trade_offer('00000000-0000-0000-0000-000000000001', pg_temp.tid('l2'), array['cc'], null, 'x', '{}')$$,
  'P0001', 'listing_closed', 'a cancelled listing takes no offers');

-- ===== expiry is derived from closes_at =====
select lives_ok(
  $$select set_config('t.l3', public.create_trade_listing(
      '00000000-0000-0000-0000-000000000002', array['cc'], 'Team Two lists C', '{}')::text, true)$$,
  'a listing can be made once the cancelled one freed the participant');
select lives_ok(
  $$select set_config('t.o5', public.make_trade_offer(
      '00000000-0000-0000-0000-000000000003', pg_temp.tid('l3'), array['cc'], null, 'Team Three offers C', '{}')::text, true)$$,
  'an offer lands before the window closes');
select is(
  (select public.pending_trade_decisions()), 0, 'service_role has no auth.uid(), so it has no decisions of its own');
update public.trade_listings set closes_at = now() where id = pg_temp.tid('l3');
select throws_ok(
  $$select public.make_trade_offer('00000000-0000-0000-0000-000000000001', pg_temp.tid('l3'), array['cc'], null, 'x', '{}')$$,
  'P0001', 'listing_closed', 'an expired listing takes no offers');
select throws_ok(
  $$select public.accept_trade_offer('00000000-0000-0000-0000-000000000002', pg_temp.tid('o5'),
    jsonb_build_array(
      jsonb_build_object('participant_id', '40000000-0000-0000-0000-0000000000c2', 'points', 1, 'championships', 0, 'postseason_points', 0),
      jsonb_build_object('participant_id', '40000000-0000-0000-0000-0000000000c3', 'points', 1, 'championships', 0, 'postseason_points', 0)),
    'x', '{}')$$,
  'P0001', 'listing_closed', 'an expired listing cannot be accepted');
select is((select status::text from public.trade_listings where id = pg_temp.tid('l3')), 'open', 'expiry does not change the stored status');
select is((select status::text from public.trade_offers where id = pg_temp.tid('o5')), 'pending', 'the offer on an expired listing is untouched');
select lives_ok(
  $$select set_config('t.l4', public.create_trade_listing(
      '00000000-0000-0000-0000-000000000002', array['cc'], 'Team Two lists C again', '{}')::text, true)$$,
  'an expired listing no longer blocks its participant');

-- ===== propose_direct_trade =====
select throws_ok(
  $$select public.propose_direct_trade('00000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', array['aa'], null, 'x', '{}')$$,
  'P0001', 'own_listing', 'you cannot propose a trade to yourself');
select throws_ok(
  $$select public.propose_direct_trade('00000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', array['aa'], null, 'x', '{}')$$,
  'P0001', 'team_unowned', 'a team with no owner cannot be proposed to');
select throws_ok(
  $$select public.propose_direct_trade('00000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000000', array['aa'], null, 'x', '{}')$$,
  'P0001', 'not_found', 'an unknown target team is not found');
select throws_ok(
  $$select public.propose_direct_trade('00000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000002', array['aa'], null, 'x', '{}')$$,
  'P0001', 'not_owner', 'a user without a team cannot propose');
select throws_ok(
  $$select public.propose_direct_trade('00000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', array['zz'], null, 'x', '{}')$$,
  'P0001', 'invalid_sports', 'an unknown sport is invalid');
select throws_ok(
  $$select public.propose_direct_trade('00000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', array['aa', 'cc'], null, 'x', '{}')$$,
  'P0001', 'already_listed', 'a direct trade for a participant already on the block is refused');
select is(
  pg_temp.err_detail($$select public.propose_direct_trade('00000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', array['aa', 'cc'], null, 'x', '{}')$$),
  pg_temp.tid('l4')::text, 'already_listed points at the listing to use instead');
select lives_ok(
  $$select set_config('t.ld', (select d.listing_id from public.propose_direct_trade(
      '00000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', array['aa'], 'fair swap',
      'Team One proposes a swap', '{"type": "trade_offer"}') d)::text, true)$$,
  'a direct trade to an owned team works');
select is((select kind::text from public.trade_listings where id = pg_temp.tid('ld')), 'direct', 'it creates a direct listing');
select is((select owner_team_id from public.trade_listings where id = pg_temp.tid('ld')), '50000000-0000-0000-0000-000000000002'::uuid, 'owned by the target team');
select is((select created_by from public.trade_listings where id = pg_temp.tid('ld')), '00000000-0000-0000-0000-000000000001'::uuid, 'created by the proposer');
select is(
  (select participant_id from public.trade_listing_items where listing_id = pg_temp.tid('ld')),
  '40000000-0000-0000-0000-0000000000a2'::uuid, 'the item is the target''s current pick');
select is(
  (select o.offering_team_id from public.trade_offers o where o.listing_id = pg_temp.tid('ld')),
  '50000000-0000-0000-0000-000000000001'::uuid, 'the proposer''s offer is on the listing');
select is(
  (select l.participant_id from public.trade_offers o join public.trade_offer_legs l on l.offer_id = o.id where o.listing_id = pg_temp.tid('ld')),
  '40000000-0000-0000-0000-0000000000a1'::uuid, 'the leg is the proposer''s current pick');
select is(
  (select o.note from public.trade_offers o where o.listing_id = pg_temp.tid('ld')), 'fair swap', 'the note lands on the offer');
select is(
  (select count(*)::int from public.messages where payload ->> 'listingId' = pg_temp.tid('ld')::text), 1, 'one post is written for the proposal');

-- ===== WNBA: the same participant on both sides is refused =====
select lives_ok(
  $$select set_config('t.lw', public.create_trade_listing(
      '00000000-0000-0000-0000-000000000001', array['ww'], 'Team One lists W', '{}')::text, true)$$,
  'a duplicate-friendly sport can be listed');
select lives_ok(
  $$select set_config('t.lw2', public.create_trade_listing(
      '00000000-0000-0000-0000-000000000002', array['ww'], 'Team Two lists W', '{}')::text, true)$$,
  'a second team holding the same participant can list it while the first team''s listing is open');
select is((select owner_team_id from public.trade_listings where id = pg_temp.tid('lw2')), '50000000-0000-0000-0000-000000000002'::uuid, 'the listing belongs to the second team');
select throws_ok(
  $$select public.make_trade_offer('00000000-0000-0000-0000-000000000002', pg_temp.tid('lw'), array['ww'], null, 'x', '{}')$$,
  'P0001', 'same_participant', 'an offer that gives the listed participant back is refused');
select throws_ok(
  $$select public.propose_direct_trade('00000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', array['ww'], null, 'x', '{}')$$,
  'P0001', 'same_participant', 'a direct trade of one shared participant is refused');

-- ===== pending_trade_decisions (as owners) =====
-- Set up the accept scenario first (service_role): competing offers on the direct listing, an
-- offer by T2 elsewhere that gives A2, and a listing by T3 that it sits on.
select lives_ok(
  $$select set_config('t.o7', public.make_trade_offer(
      '00000000-0000-0000-0000-000000000003', pg_temp.tid('ld'), array['aa'], null, 'Team Three competes', '{}')::text, true)$$,
  'a third team can compete on a direct listing');
select lives_ok(
  $$select set_config('t.l5', public.create_trade_listing(
      '00000000-0000-0000-0000-000000000003', array['aa', 'bb'], 'Team Three lists A and B', '{}')::text, true)$$,
  'team three lists A and B');
select lives_ok(
  $$select set_config('t.o6', public.make_trade_offer(
      '00000000-0000-0000-0000-000000000002', pg_temp.tid('l5'), array['aa'], null, 'Team Two offers A2', '{}')::text, true)$$,
  'team two offers A2 on it');
reset role;

select pg_temp.set_caller('00000000-0000-0000-0000-000000000002', 'authenticated');
select is((select public.pending_trade_decisions()), 2, 'the owner counts the offers on their live listings (expired ones excluded)');
reset role;
select pg_temp.set_caller('00000000-0000-0000-0000-000000000001', 'authenticated');
select is((select public.pending_trade_decisions()), 1, 'another owner counts only their own listing''s pending offers');
reset role;
select pg_temp.set_caller('00000000-0000-0000-0000-000000000004', 'authenticated');
select is((select public.pending_trade_decisions()), 0, 'a user without a team has no decisions');
reset role;

-- ===== accept_trade_offer =====
-- T2 holds A2 with a non-zero baseline, so the banked arithmetic is visible.
update public.picks set baseline_points = 2, baseline_championships = 0, baseline_postseason_points = 1
where fantasy_team_id = '50000000-0000-0000-0000-000000000002' and participant_id = '40000000-0000-0000-0000-0000000000a2';
select pg_temp.set_caller(null, 'service_role');
select throws_ok(
  $$select public.accept_trade_offer('00000000-0000-0000-0000-000000000001', (select id from public.trade_offers where listing_id = pg_temp.tid('ld') and offering_team_id = '50000000-0000-0000-0000-000000000001'), '[]', 'x', '{}')$$,
  'P0001', 'not_owner', 'only the listing owner can accept');
select throws_ok(
  $$select public.accept_trade_offer('00000000-0000-0000-0000-000000000002', 'ee000000-0000-0000-0000-000000000000', '[]', 'x', '{}')$$,
  'P0001', 'not_found', 'accepting an unknown offer is not found');
select throws_ok(
  $$select public.accept_trade_offer('00000000-0000-0000-0000-000000000002', (select id from public.trade_offers where listing_id = pg_temp.tid('ld') and offering_team_id = '50000000-0000-0000-0000-000000000001'), '[]', 'x', '{}')$$,
  'P0001', 'missing_scores', 'accepting with no scores is refused');
select throws_ok(
  $$select public.accept_trade_offer('00000000-0000-0000-0000-000000000002', (select id from public.trade_offers where listing_id = pg_temp.tid('ld') and offering_team_id = '50000000-0000-0000-0000-000000000001'),
    jsonb_build_array(jsonb_build_object('participant_id', '40000000-0000-0000-0000-0000000000a2', 'points', 10.5, 'championships', 1, 'postseason_points', 4)),
    'x', '{}')$$,
  'P0001', 'missing_scores', 'a score for only one side is refused');
select throws_ok(
  $$select public.accept_trade_offer('00000000-0000-0000-0000-000000000002', (select id from public.trade_offers where listing_id = pg_temp.tid('ld') and offering_team_id = '50000000-0000-0000-0000-000000000001'),
    jsonb_build_array(
      jsonb_build_object('participant_id', '40000000-0000-0000-0000-0000000000a2', 'points', 10.5, 'championships', 1),
      jsonb_build_object('participant_id', '40000000-0000-0000-0000-0000000000a1', 'points', 7, 'championships', 0, 'postseason_points', 2)),
    'x', '{}')$$,
  'P0001', 'missing_scores', 'a score with a missing field is refused');
select is((select count(*)::int from public.banked_scores), 0, 'refused accepts bank nothing');

select lives_ok(
  $$select public.accept_trade_offer('00000000-0000-0000-0000-000000000002', (select id from public.trade_offers where listing_id = pg_temp.tid('ld') and offering_team_id = '50000000-0000-0000-0000-000000000001'),
    jsonb_build_array(
      jsonb_build_object('participant_id', '40000000-0000-0000-0000-0000000000a2', 'points', 10.5, 'championships', 1, 'postseason_points', 4),
      jsonb_build_object('participant_id', '40000000-0000-0000-0000-0000000000a1', 'points', 7, 'championships', 0, 'postseason_points', 2)),
    'Team Two accepted', '{"type": "trade_completed"}')$$,
  'the listing owner can accept an offer');
select is(
  (select participant_id from public.picks where fantasy_team_id = '50000000-0000-0000-0000-000000000002' and sport_id = '20000000-0000-0000-0000-000000000001'),
  '40000000-0000-0000-0000-0000000000a1'::uuid, 'the owner now holds the offered participant');
select is(
  (select participant_id from public.picks where fantasy_team_id = '50000000-0000-0000-0000-000000000001' and sport_id = '20000000-0000-0000-0000-000000000001'),
  '40000000-0000-0000-0000-0000000000a2'::uuid, 'the offerer now holds the listed participant');
select results_eq(
  $$select baseline_points, baseline_championships, baseline_postseason_points, acquired_at is not null
    from public.picks where fantasy_team_id = '50000000-0000-0000-0000-000000000002' and sport_id = '20000000-0000-0000-0000-000000000001'$$,
  $$values (7::numeric, 0, 2::numeric, true)$$,
  'the owner''s new baseline is the incoming participant''s live score');
select results_eq(
  $$select baseline_points, baseline_championships, baseline_postseason_points, acquired_at is not null
    from public.picks where fantasy_team_id = '50000000-0000-0000-0000-000000000001' and sport_id = '20000000-0000-0000-0000-000000000001'$$,
  $$values (10.5::numeric, 1, 4::numeric, true)$$,
  'the offerer''s new baseline is the incoming participant''s live score');
select results_eq(
  $$select points, championships, postseason_points from public.banked_scores
    where fantasy_team_id = '50000000-0000-0000-0000-000000000002' and participant_id = '40000000-0000-0000-0000-0000000000a2'$$,
  $$values (8.5::numeric, 1, 3::numeric)$$,
  'the owner banks live minus baseline (10.5 - 2, 1 - 0, 4 - 1)');
select results_eq(
  $$select points, championships, postseason_points from public.banked_scores
    where fantasy_team_id = '50000000-0000-0000-0000-000000000001' and participant_id = '40000000-0000-0000-0000-0000000000a1'$$,
  $$values (7::numeric, 0, 2::numeric)$$,
  'the offerer banks live minus a zero baseline');
select is((select count(*)::int from public.banked_scores where trade_offer_id = (select id from public.trade_offers where listing_id = pg_temp.tid('ld') and status = 'accepted')), 2, 'both banked rows reference the accepted offer');
select is((select status::text from public.trade_listings where id = pg_temp.tid('ld')), 'accepted', 'the listing is accepted');
select is(
  (select accepted_offer_id from public.trade_listings where id = pg_temp.tid('ld')),
  (select id from public.trade_offers where listing_id = pg_temp.tid('ld') and status = 'accepted'), 'the listing records the accepted offer');
select isnt((select resolved_at from public.trade_listings where id = pg_temp.tid('ld')), null, 'the accepted listing is stamped resolved');
select is((select status::text from public.trade_offers where id = pg_temp.tid('o7')), 'rejected', 'other pending offers on the listing are rejected');
select is((select status::text from public.trade_listings where id = pg_temp.tid('l1')), 'cancelled', 'the offerer''s other listing with a traded sport is cancelled');
select is((select status::text from public.trade_offers where id = pg_temp.tid('o2')), 'void', 'pending offers on that cancelled listing are voided');
select is((select status::text from public.trade_offers where id = pg_temp.tid('o6')), 'void', 'a pending offer elsewhere that gives a traded participant is voided');
select is((select status::text from public.trade_listings where id = pg_temp.tid('l5')), 'open', 'the listing that offer sat on stays open');
select is((select status::text from public.trade_listings where id = pg_temp.tid('l4')), 'open', 'a listing in an untraded sport stays open');
select is((select status::text from public.trade_listings where id = pg_temp.tid('l3')), 'open', 'an expired listing is not rewritten (still reads as expired)');
select is(
  (select count(*)::int from public.messages where kind = 'league' and body = 'Team Two accepted' and payload ->> 'listingId' = pg_temp.tid('ld')::text),
  1, 'accepting writes one league post');
select throws_ok(
  $$select public.accept_trade_offer('00000000-0000-0000-0000-000000000002', (select id from public.trade_offers where listing_id = pg_temp.tid('ld') and status = 'accepted'), '[]', 'x', '{}')$$,
  'P0001', 'listing_closed', 'an accepted listing cannot be accepted again');
select throws_ok(
  $$select public.reject_trade_offer('00000000-0000-0000-0000-000000000002', pg_temp.tid('o7'))$$,
  'P0001', 'offer_not_pending', 'a rejected competing offer cannot be rejected again');
reset role;

select pg_temp.set_caller('00000000-0000-0000-0000-000000000002', 'authenticated');
select is((select public.pending_trade_decisions()), 0, 'the badge count drops once the offers are resolved');
reset role;
select pg_temp.set_caller('00000000-0000-0000-0000-000000000001', 'authenticated');
select is((select public.pending_trade_decisions()), 0, 'voided offers do not count');
reset role;

-- ===== multi-sport accept on a chained trade =====
-- T1 now holds A2 (baseline 10.5 / 1 / 4) from the first trade and B1 (baseline 0). T3's listing
-- l5 offers A3 and B3.
select pg_temp.set_caller(null, 'service_role');
select lives_ok(
  $$select set_config('t.o8', public.make_trade_offer(
      '00000000-0000-0000-0000-000000000001', pg_temp.tid('l5'), array['aa', 'bb'], null, 'Team One offers both', '{}')::text, true)$$,
  'a team offers both sports of a listing');
select lives_ok(
  $$select public.accept_trade_offer('00000000-0000-0000-0000-000000000003', pg_temp.tid('o8'),
    jsonb_build_array(
      jsonb_build_object('participant_id', '40000000-0000-0000-0000-0000000000a3', 'points', 3, 'championships', 0, 'postseason_points', 0),
      jsonb_build_object('participant_id', '40000000-0000-0000-0000-0000000000b3', 'points', 4.5, 'championships', 0, 'postseason_points', 1),
      jsonb_build_object('participant_id', '40000000-0000-0000-0000-0000000000a2', 'points', 12, 'championships', 1, 'postseason_points', 5),
      jsonb_build_object('participant_id', '40000000-0000-0000-0000-0000000000b1', 'points', 2, 'championships', 0, 'postseason_points', 0)),
    'Team Three accepted', '{}')$$,
  'the owner accepts a two-sport offer');
select is(
  (select array_agg(p.participant_id order by p.sport_id) from public.picks p where p.fantasy_team_id = '50000000-0000-0000-0000-000000000003' and p.sport_id in ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002')),
  array['40000000-0000-0000-0000-0000000000a2', '40000000-0000-0000-0000-0000000000b1']::uuid[], 'the owner received both legs');
select is(
  (select array_agg(p.participant_id order by p.sport_id) from public.picks p where p.fantasy_team_id = '50000000-0000-0000-0000-000000000001' and p.sport_id in ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002')),
  array['40000000-0000-0000-0000-0000000000a3', '40000000-0000-0000-0000-0000000000b3']::uuid[], 'the offerer received both legs');
select is((select count(*)::int from public.picks where fantasy_team_id in ('50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003')), 8, 'every team still has exactly one pick per sport');
select results_eq(
  $$select points, championships, postseason_points from public.banked_scores
    where fantasy_team_id = '50000000-0000-0000-0000-000000000001' and participant_id = '40000000-0000-0000-0000-0000000000a2'$$,
  $$values (1.5::numeric, 0, 1::numeric)$$,
  'a chained trade banks against the baseline set by the previous trade (12 - 10.5, 1 - 1, 5 - 4)');
select is((select count(*)::int from public.banked_scores where fantasy_team_id = '50000000-0000-0000-0000-000000000001'), 3, 'earlier banked rows are kept');
select results_eq(
  $$select baseline_points, baseline_postseason_points from public.picks
    where fantasy_team_id = '50000000-0000-0000-0000-000000000001' and participant_id = '40000000-0000-0000-0000-0000000000b3'$$,
  $$values (4.5::numeric, 1::numeric)$$,
  'the second leg gets its own baseline');

-- ===== WNBA accept: a duplicate-friendly sport swaps without tripping uniqueness =====
select lives_ok(
  $$select set_config('t.ow', public.make_trade_offer(
      '00000000-0000-0000-0000-000000000003', pg_temp.tid('lw'), array['ww'], null, 'Team Three offers W2', '{}')::text, true)$$,
  'a team holding a different participant can offer on a shared-sport listing');
select lives_ok(
  $$select public.accept_trade_offer('00000000-0000-0000-0000-000000000001', pg_temp.tid('ow'),
    jsonb_build_array(
      jsonb_build_object('participant_id', '40000000-0000-0000-0000-0000000000d1', 'points', 5, 'championships', 0, 'postseason_points', 0),
      jsonb_build_object('participant_id', '40000000-0000-0000-0000-0000000000d2', 'points', 6, 'championships', 0, 'postseason_points', 0)),
    'Team One accepted W', '{}')$$,
  'accepting a WNBA-style swap works');
select is(
  (select array_agg(fantasy_team_id::text order by fantasy_team_id) from public.picks where participant_id = '40000000-0000-0000-0000-0000000000d1'),
  array['50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003'],
  'another team''s hold on the same participant is untouched');

-- ===== stale picks =====
select lives_ok(
  $$select set_config('t.l6', public.create_trade_listing(
      '00000000-0000-0000-0000-000000000002', array['bb'], 'Team Two lists B', '{}')::text, true)$$,
  'a listing is made in sport bb');
select lives_ok(
  $$select set_config('t.o9', public.make_trade_offer(
      '00000000-0000-0000-0000-000000000003', pg_temp.tid('l6'), array['bb'], null, 'Team Three offers B', '{}')::text, true)$$,
  'and an offer lands');
-- The offerer's pick changes behind the offer's back.
delete from public.picks where fantasy_team_id = '50000000-0000-0000-0000-000000000003' and sport_id = '20000000-0000-0000-0000-000000000002';
insert into public.picks (fantasy_team_id, sport_id, participant_id)
values ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-0000000000b5');
select throws_ok(
  $$select public.accept_trade_offer('00000000-0000-0000-0000-000000000002', pg_temp.tid('o9'),
    jsonb_build_array(
      jsonb_build_object('participant_id', '40000000-0000-0000-0000-0000000000b2', 'points', 1, 'championships', 0, 'postseason_points', 0),
      jsonb_build_object('participant_id', '40000000-0000-0000-0000-0000000000b1', 'points', 1, 'championships', 0, 'postseason_points', 0)),
    'x', '{}')$$,
  'P0001', 'stale_pick', 'an offer whose pick has changed cannot be accepted');
select is((select status::text from public.trade_offers where id = pg_temp.tid('o9')), 'pending', 'a refused accept leaves the offer pending');
reset role;

-- ===== read access: everyone can read =====
select pg_temp.set_caller(null, 'anon');
select ok((select count(*) from public.trade_listings) > 0, 'anon reads listings');
select ok((select count(*) from public.trade_listing_items) > 0, 'anon reads listing items');
select ok((select count(*) from public.trade_offers) > 0, 'anon reads offers');
select ok((select count(*) from public.trade_offer_legs) > 0, 'anon reads offer legs');
select ok((select count(*) from public.banked_scores) > 0, 'anon reads banked scores');
reset role;
select pg_temp.set_caller('00000000-0000-0000-0000-000000000004', 'authenticated');
select ok((select count(*) from public.trade_listings) > 0, 'authenticated reads listings');
select ok((select count(*) from public.trade_listing_items) > 0, 'authenticated reads listing items');
select ok((select count(*) from public.trade_offers) > 0, 'authenticated reads offers');
select ok((select count(*) from public.trade_offer_legs) > 0, 'authenticated reads offer legs');
select ok((select count(*) from public.banked_scores) > 0, 'authenticated reads banked scores');
reset role;

-- ===== direct writes are denied =====
select pg_temp.set_caller('00000000-0000-0000-0000-000000000001', 'authenticated');
select throws_ok(
  $$insert into public.trade_listings (season_id, owner_team_id, kind, closes_at)
    values ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'block', now() + interval '24 hours')$$,
  '42501', null, 'authenticated cannot insert a listing');
select throws_ok(
  $$insert into public.trade_offers (listing_id, offering_team_id) values (pg_temp.tid('l6'), '50000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'authenticated cannot insert an offer');
select throws_ok(
  $$update public.trade_offers set status = 'accepted', resolved_at = now() where id = pg_temp.tid('o9')$$,
  '42501', null, 'authenticated cannot update an offer');
select throws_ok(
  $$update public.trade_listings set status = 'cancelled', resolved_at = now() where id = pg_temp.tid('l6')$$,
  '42501', null, 'authenticated cannot update a listing');
select throws_ok($$delete from public.trade_offers$$, '42501', null, 'authenticated cannot delete offers');
select throws_ok($$delete from public.banked_scores$$, '42501', null, 'authenticated cannot delete banked scores');
select throws_ok(
  $$update public.picks set baseline_points = 999$$,
  '42501', null, 'authenticated cannot change a pick baseline');
reset role;
select pg_temp.set_caller(null, 'anon');
select throws_ok(
  $$insert into public.trade_listings (season_id, owner_team_id, kind, closes_at)
    values ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'block', now() + interval '24 hours')$$,
  '42501', null, 'anon cannot insert a listing');
select throws_ok(
  $$update public.trade_offers set status = 'accepted', resolved_at = now()$$,
  '42501', null, 'anon cannot update an offer');
select throws_ok($$delete from public.trade_listing_items$$, '42501', null, 'anon cannot delete listing items');
reset role;

select is(
  (select count(*)::int
   from unnest(array['trade_listings', 'trade_listing_items', 'trade_offers', 'trade_offer_legs', 'banked_scores']) t
   cross join unnest(array['anon', 'authenticated']) r
   cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
   where has_table_privilege(r, 'public.' || t, p)),
  0, 'anon and authenticated hold no write privilege on any trade table');
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public'
     and tablename in ('trade_listings', 'trade_listing_items', 'trade_offers', 'trade_offer_legs', 'banked_scores')
     and cmd <> 'SELECT'),
  0, 'the trade tables have no write policies');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('trade_listings', 'trade_listing_items', 'trade_offers', 'trade_offer_legs', 'banked_scores')
     and c.relrowsecurity),
  5, 'RLS is enabled on every trade table');

-- ===== function execution =====
select is(
  (select count(*)::int
   from unnest(array[
     'public.create_trade_listing(uuid,text[],text,jsonb)',
     'public.propose_direct_trade(uuid,uuid,text[],text,text,jsonb)',
     'public.make_trade_offer(uuid,uuid,text[],text,text,jsonb)',
     'public.withdraw_trade_offer(uuid,uuid)',
     'public.reject_trade_offer(uuid,uuid)',
     'public.cancel_trade_listing(uuid,uuid)',
     'public.accept_trade_offer(uuid,uuid,jsonb,text,jsonb)',
     'public.trade_actor_team(uuid)',
     'public.trade_resolve_sports(text[])',
     'public.trade_locked_picks(uuid[],uuid[])',
     'public.trade_assert_unlisted(uuid,uuid[])',
     'public.trade_live_score(jsonb,uuid)',
     'public.trade_post(uuid,text,jsonb,uuid)'
   ]) f
   cross join unnest(array['anon', 'authenticated']) r
   where has_function_privilege(r, f::regprocedure, 'execute')),
  0, 'anon and authenticated cannot execute any trade write function or helper');
select is(
  (select count(*)::int
   from unnest(array[
     'public.create_trade_listing(uuid,text[],text,jsonb)',
     'public.propose_direct_trade(uuid,uuid,text[],text,text,jsonb)',
     'public.make_trade_offer(uuid,uuid,text[],text,text,jsonb)',
     'public.withdraw_trade_offer(uuid,uuid)',
     'public.reject_trade_offer(uuid,uuid)',
     'public.cancel_trade_listing(uuid,uuid)',
     'public.accept_trade_offer(uuid,uuid,jsonb,text,jsonb)'
   ]) f
   where has_function_privilege('service_role', f::regprocedure, 'execute')),
  7, 'service_role can execute all seven trade functions');
select is(has_function_privilege('authenticated', 'public.pending_trade_decisions()', 'execute'), true, 'authenticated can count its pending decisions');
select is(has_function_privilege('anon', 'public.pending_trade_decisions()', 'execute'), false, 'anon cannot count pending decisions');
select is(has_function_privilege('service_role', 'public.pending_trade_decisions()', 'execute'), true, 'service_role can execute the count');

select pg_temp.set_caller('00000000-0000-0000-0000-000000000001', 'authenticated');
select throws_ok(
  $$select public.create_trade_listing('00000000-0000-0000-0000-000000000001', array['aa'], 'x', '{}')$$,
  '42501', null, 'a signed-in user cannot call a trade function directly, even as themselves');
select throws_ok(
  $$select public.accept_trade_offer('00000000-0000-0000-0000-000000000002', pg_temp.tid('o9'), '[]', 'x', '{}')$$,
  '42501', null, 'a signed-in user cannot accept by claiming to be the owner');
reset role;
select pg_temp.set_caller(null, 'anon');
select throws_ok(
  $$select public.cancel_trade_listing('00000000-0000-0000-0000-000000000002', pg_temp.tid('l6'))$$,
  '42501', null, 'anon cannot call a trade function');
select throws_ok($$select public.pending_trade_decisions()$$, '42501', null, 'anon cannot call pending_trade_decisions');
reset role;

-- ===== realtime =====
select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('trade_listings', 'trade_offers')),
  2, 'trade listings and offers are in the realtime publication');

-- ===== profiles.trade_emails =====
select pg_temp.set_caller('00000000-0000-0000-0000-000000000001', 'authenticated');
select lives_ok(
  $$update public.profiles set trade_emails = false where id = '00000000-0000-0000-0000-000000000001'$$,
  'a user can turn off their own trade emails');
select lives_ok(
  $$update public.profiles set trade_emails = false where id = '00000000-0000-0000-0000-000000000002'$$,
  'changing someone else''s trade emails is a silent no-op (RLS)');
reset role;
select is((select trade_emails from public.profiles where id = '00000000-0000-0000-0000-000000000001'), false, 'own trade_emails changed');
select is((select trade_emails from public.profiles where id = '00000000-0000-0000-0000-000000000002'), true, 'another user''s trade_emails is untouched');

-- ===== deleting a team that took part in an accepted trade =====
-- Team Two owned the direct listing that Team One's offer won. Deleting Team Two cascades that
-- listing and the accepted offer; Team One must keep the points it banked, and the delete must not
-- fail on the reference from banked_scores.
select set_config('t.t1_banked', (select count(*)::text from public.banked_scores where fantasy_team_id = '50000000-0000-0000-0000-000000000001'), true);
select is(
  (select count(*)::int from public.banked_scores where fantasy_team_id = '50000000-0000-0000-0000-000000000001' and trade_offer_id is not null),
  (select count(*)::int from public.banked_scores where fantasy_team_id = '50000000-0000-0000-0000-000000000001'),
  'before the delete, every banked row of Team One references its offer');
select lives_ok(
  $$delete from public.fantasy_teams where id = '50000000-0000-0000-0000-000000000002'$$,
  'a team from an accepted trade can be deleted');
select is(
  (select count(*)::text from public.banked_scores where fantasy_team_id = '50000000-0000-0000-0000-000000000001'),
  current_setting('t.t1_banked'),
  'the counterparty keeps every banked row');
select isnt(
  (select count(*)::int from public.banked_scores where fantasy_team_id = '50000000-0000-0000-0000-000000000001' and trade_offer_id is null),
  0, 'the rows that pointed at the deleted offer now have no offer reference');

select * from finish();
rollback;
