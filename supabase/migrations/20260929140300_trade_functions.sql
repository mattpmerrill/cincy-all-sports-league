-- The trade write path. Every trade mutation is one SECURITY DEFINER function that only
-- service_role can execute. Two reasons it is not plain RLS writes:
--   1. Accepting needs live participant scores, and scoring lives in the app (ADR-001), so the
--      server has to authenticate, compute, and hand the scores in.
--   2. A trade touches many rows (picks, offers, sibling listings, a feed post) that must change
--      together or not at all.
-- The server has already verified who the caller is and passes it as p_actor. The functions do
-- not trust that beyond identity: each one re-checks ownership, derives participants from the
-- CURRENT picks (never from client input), locks the rows it depends on so concurrent calls
-- serialize (order: listing, offer, picks, participants), and checks status and the 24h window.
--
-- Failures are 'P0001' exceptions whose message is a stable token the repository maps to a typed
-- Result: not_owner, not_found, listing_closed, offer_not_pending, own_listing, team_unowned,
-- invalid_sports, already_listed (detail = the blocking listing id), duplicate_offer,
-- same_participant, stale_pick, missing_scores. Genuine constraint violations surface as is.
--
-- Not enforced here: a sport whose season is complete is no longer tradeable. That needs the
-- season status the domain derives, so the trades service checks it before calling (ADR-003).

-- ===== helpers (called only from the functions below) =====

-- The actor's approved team in the active season. owner_id is only set by approve_team_claim (or
-- an admin), so it is the "approved" signal, as in owns_team().
create function public.trade_actor_team(p_actor uuid)
returns public.fantasy_teams
language plpgsql
stable
set search_path = ''
as $$
declare
  v_team public.fantasy_teams;
begin
  select t.* into v_team
  from public.fantasy_teams t
  join public.seasons s on s.id = t.season_id
  where s.is_active and t.owner_id = p_actor;
  if not found then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  return v_team;
end;
$$;

-- Sport codes to sport ids. Empty, duplicate, null or unknown codes are all invalid_sports.
create function public.trade_resolve_sports(p_sport_codes text[])
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if coalesce(cardinality(p_sport_codes), 0) = 0
     or cardinality(p_sport_codes) <> (select count(distinct c) from unnest(p_sport_codes) c) then
    raise exception 'invalid_sports' using errcode = 'P0001';
  end if;

  select array_agg(id order by id) into v_ids from public.sports where code = any(p_sport_codes);
  if coalesce(cardinality(v_ids), 0) <> cardinality(p_sport_codes) then
    raise exception 'invalid_sports' using errcode = 'P0001';
  end if;
  return v_ids;
end;
$$;

-- Locks the given teams' picks in the given sports in one statement, ordered by id, so two
-- trades that touch the same picks cannot deadlock on lock order.
create function public.trade_locked_picks(p_team_ids uuid[], p_sport_ids uuid[])
returns setof public.picks
language sql
set search_path = ''
as $$
  select p.*
  from public.picks p
  where p.fantasy_team_id = any(p_team_ids) and p.sport_id = any(p_sport_ids)
  order by p.id
  for update;
$$;

-- A team may have a given pick on at most one listing that is open and not expired. Scoped to the
-- owning team, not the participant: in the WNBA two teams can hold the same participant, and one
-- listing theirs must not block the other. Callers have already locked the owner's pick rows
-- (trade_locked_picks), so two concurrent listings of the same picks serialize on those rows and
-- the second sees the first; no separate participant lock is needed.
create function public.trade_assert_unlisted(p_team_id uuid, p_participant_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_listing_id uuid;
begin
  select l.id into v_listing_id
  from public.trade_listing_items i
  join public.trade_listings l on l.id = i.listing_id
  where l.owner_team_id = p_team_id
    and i.participant_id = any(p_participant_ids)
    and l.status = 'open'
    and l.closes_at > now()
  order by l.closes_at
  limit 1;
  if found then
    raise exception 'already_listed' using errcode = 'P0001', detail = v_listing_id::text;
  end if;
end;
$$;

-- One participant's live score out of the JSON the server passed in. All three numbers must be
-- present: a silent zero would bank the wrong points for good.
create function public.trade_live_score(p_scores jsonb, p_participant_id uuid)
returns table (points numeric, championships integer, postseason_points numeric)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_scores is null or jsonb_typeof(p_scores) <> 'array' then
    raise exception 'missing_scores' using errcode = 'P0001';
  end if;

  return query
  select s.points, s.championships, s.postseason_points
  from jsonb_to_recordset(p_scores)
    as s(participant_id uuid, points numeric, championships integer, postseason_points numeric)
  where s.participant_id = p_participant_id
    and s.points is not null
    and s.championships is not null
    and s.postseason_points is not null
  limit 1;
  if not found then
    raise exception 'missing_scores' using errcode = 'P0001';
  end if;
end;
$$;

-- The league post for a trade event, written in the caller's transaction so a trade never exists
-- without its post (or the reverse). The payload's listingId is injected here, not trusted from
-- the caller, so the "View trade" link always points at the real listing.
create function public.trade_post(p_season_id uuid, p_body text, p_payload jsonb, p_listing_id uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.messages (season_id, kind, body, payload)
  values (
    p_season_id,
    'league',
    p_body,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('listingId', p_listing_id)
  );
$$;

-- ===== create_trade_listing =====

create function public.create_trade_listing(
  p_actor uuid,
  p_sport_codes text[],
  p_post_body text,
  p_post_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.fantasy_teams;
  v_sport_ids uuid[];
  v_picks public.picks[];
  v_listing_id uuid;
begin
  v_team := public.trade_actor_team(p_actor);
  v_sport_ids := public.trade_resolve_sports(p_sport_codes);

  select array_agg(p) into v_picks from public.trade_locked_picks(array[v_team.id], v_sport_ids) p;
  if coalesce(cardinality(v_picks), 0) <> cardinality(v_sport_ids) then
    raise exception 'invalid_sports' using errcode = 'P0001';
  end if;

  perform public.trade_assert_unlisted(v_team.id, (select array_agg(p.participant_id) from unnest(v_picks) p));

  insert into public.trade_listings (season_id, owner_team_id, kind, created_by, closes_at)
  values (v_team.season_id, v_team.id, 'block', p_actor, now() + interval '24 hours')
  returning id into v_listing_id;

  insert into public.trade_listing_items (listing_id, sport_id, participant_id)
  select v_listing_id, p.sport_id, p.participant_id from unnest(v_picks) p;

  perform public.trade_post(v_team.season_id, p_post_body, p_post_payload, v_listing_id);
  return v_listing_id;
end;
$$;

-- ===== propose_direct_trade =====

create function public.propose_direct_trade(
  p_actor uuid,
  p_target_team_id uuid,
  p_sport_codes text[],
  p_note text,
  p_post_body text,
  p_post_payload jsonb
)
returns table (listing_id uuid, offer_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_team public.fantasy_teams;
  v_target public.fantasy_teams;
  v_sport_ids uuid[];
  v_picks public.picks[];
  v_listing_id uuid;
  v_offer_id uuid;
begin
  v_team := public.trade_actor_team(p_actor);

  select * into v_target
  from public.fantasy_teams t
  where t.id = p_target_team_id and t.season_id = v_team.season_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_target.id = v_team.id then
    raise exception 'own_listing' using errcode = 'P0001';
  end if;
  if v_target.owner_id is null then
    raise exception 'team_unowned' using errcode = 'P0001';
  end if;

  v_sport_ids := public.trade_resolve_sports(p_sport_codes);

  -- Both teams' picks in one lock statement. Each team has at most one pick per sport, so a
  -- short count means one side does not hold a pick in a requested sport.
  select array_agg(p) into v_picks
  from public.trade_locked_picks(array[v_team.id, v_target.id], v_sport_ids) p;
  if coalesce(cardinality(v_picks), 0) <> 2 * cardinality(v_sport_ids) then
    raise exception 'invalid_sports' using errcode = 'P0001';
  end if;

  -- WNBA lets two teams hold the same participant; swapping it with itself is meaningless.
  if exists (
    select 1
    from unnest(v_picks) mine
    join unnest(v_picks) theirs on theirs.sport_id = mine.sport_id
    where mine.fantasy_team_id = v_team.id
      and theirs.fantasy_team_id = v_target.id
      and mine.participant_id = theirs.participant_id
  ) then
    raise exception 'same_participant' using errcode = 'P0001';
  end if;

  perform public.trade_assert_unlisted(
    v_target.id,
    (select array_agg(p.participant_id) from unnest(v_picks) p where p.fantasy_team_id = v_target.id)
  );

  -- The listing belongs to the target: they are the team being asked, so they decide.
  insert into public.trade_listings (season_id, owner_team_id, kind, created_by, closes_at)
  values (v_team.season_id, v_target.id, 'direct', p_actor, now() + interval '24 hours')
  returning id into v_listing_id;

  insert into public.trade_listing_items (listing_id, sport_id, participant_id)
  select v_listing_id, p.sport_id, p.participant_id
  from unnest(v_picks) p
  where p.fantasy_team_id = v_target.id;

  insert into public.trade_offers (listing_id, offering_team_id, created_by, note)
  values (v_listing_id, v_team.id, p_actor, p_note)
  returning id into v_offer_id;

  insert into public.trade_offer_legs (offer_id, sport_id, listing_id, participant_id)
  select v_offer_id, p.sport_id, v_listing_id, p.participant_id
  from unnest(v_picks) p
  where p.fantasy_team_id = v_team.id;

  perform public.trade_post(v_team.season_id, p_post_body, p_post_payload, v_listing_id);
  return query select v_listing_id, v_offer_id;
end;
$$;

-- ===== make_trade_offer =====

create function public.make_trade_offer(
  p_actor uuid,
  p_listing_id uuid,
  p_sport_codes text[],
  p_note text,
  p_post_body text,
  p_post_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.fantasy_teams;
  v_listing public.trade_listings;
  v_sport_ids uuid[];
  v_picks public.picks[];
  v_offer_id uuid;
begin
  v_team := public.trade_actor_team(p_actor);

  select * into v_listing from public.trade_listings where id = p_listing_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_listing.owner_team_id = v_team.id then
    raise exception 'own_listing' using errcode = 'P0001';
  end if;
  -- A listing from another season is as closed as an expired one.
  if v_listing.season_id <> v_team.season_id
     or v_listing.status <> 'open'
     or v_listing.closes_at <= now() then
    raise exception 'listing_closed' using errcode = 'P0001';
  end if;

  v_sport_ids := public.trade_resolve_sports(p_sport_codes);
  if exists (
    select 1
    from unnest(v_sport_ids) s(id)
    where not exists (
      select 1 from public.trade_listing_items i
      where i.listing_id = p_listing_id and i.sport_id = s.id
    )
  ) then
    raise exception 'invalid_sports' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.trade_offers o
    where o.listing_id = p_listing_id and o.offering_team_id = v_team.id and o.status = 'pending'
  ) then
    raise exception 'duplicate_offer' using errcode = 'P0001';
  end if;

  -- Each leg gives the offerer's current pick in that sport, whatever the client believed.
  select array_agg(p) into v_picks from public.trade_locked_picks(array[v_team.id], v_sport_ids) p;
  if coalesce(cardinality(v_picks), 0) <> cardinality(v_sport_ids) then
    raise exception 'invalid_sports' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from unnest(v_picks) p
    join public.trade_listing_items i
      on i.listing_id = p_listing_id and i.sport_id = p.sport_id and i.participant_id = p.participant_id
  ) then
    raise exception 'same_participant' using errcode = 'P0001';
  end if;

  insert into public.trade_offers (listing_id, offering_team_id, created_by, note)
  values (p_listing_id, v_team.id, p_actor, p_note)
  returning id into v_offer_id;

  insert into public.trade_offer_legs (offer_id, sport_id, listing_id, participant_id)
  select v_offer_id, p.sport_id, p_listing_id, p.participant_id from unnest(v_picks) p;

  perform public.trade_post(v_team.season_id, p_post_body, p_post_payload, p_listing_id);
  return v_offer_id;
end;
$$;

-- ===== withdraw_trade_offer =====

create function public.withdraw_trade_offer(p_actor uuid, p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.fantasy_teams;
  v_offer public.trade_offers;
begin
  v_team := public.trade_actor_team(p_actor);

  select * into v_offer from public.trade_offers where id = p_offer_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  -- Listing first, then the offer, the same order accept uses, so the two cannot deadlock.
  perform 1 from public.trade_listings where id = v_offer.listing_id for update;
  select * into v_offer from public.trade_offers where id = p_offer_id for update;

  if v_offer.offering_team_id <> v_team.id then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'offer_not_pending' using errcode = 'P0001';
  end if;

  update public.trade_offers set status = 'withdrawn', resolved_at = now() where id = p_offer_id;
end;
$$;

-- ===== reject_trade_offer =====

create function public.reject_trade_offer(p_actor uuid, p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.fantasy_teams;
  v_offer public.trade_offers;
  v_listing public.trade_listings;
begin
  v_team := public.trade_actor_team(p_actor);

  select * into v_offer from public.trade_offers where id = p_offer_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  select * into v_listing from public.trade_listings where id = v_offer.listing_id for update;
  select * into v_offer from public.trade_offers where id = p_offer_id for update;

  if v_listing.owner_team_id <> v_team.id then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'offer_not_pending' using errcode = 'P0001';
  end if;

  update public.trade_offers set status = 'rejected', resolved_at = now() where id = p_offer_id;
end;
$$;

-- ===== cancel_trade_listing =====

create function public.cancel_trade_listing(p_actor uuid, p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.fantasy_teams;
  v_listing public.trade_listings;
begin
  v_team := public.trade_actor_team(p_actor);

  select * into v_listing from public.trade_listings where id = p_listing_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_listing.owner_team_id <> v_team.id then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if v_listing.status <> 'open' then
    raise exception 'listing_closed' using errcode = 'P0001';
  end if;

  update public.trade_offers set status = 'void', resolved_at = now()
   where listing_id = p_listing_id and status = 'pending';
  update public.trade_listings set status = 'cancelled', resolved_at = now()
   where id = p_listing_id;
end;
$$;

-- ===== accept_trade_offer =====
-- p_scores is a JSON array of { participant_id, points, championships, postseason_points }: the
-- LIVE full-season score of every participant in the offer's legs, on both sides. The server
-- computes them from results and scoring rules (ADR-001); SQL never scores anything.

create function public.accept_trade_offer(
  p_actor uuid,
  p_offer_id uuid,
  p_scores jsonb,
  p_post_body text,
  p_post_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.fantasy_teams;
  v_offerer public.fantasy_teams;
  v_listing public.trade_listings;
  v_offer public.trade_offers;
  v_sport_ids uuid[];
  v_picks public.picks[];
  v_leg record;
  v_owner_pick public.picks;
  v_offerer_pick public.picks;
  v_owner_live record;
  v_offerer_live record;
  v_stale_listing_ids uuid[];
begin
  v_team := public.trade_actor_team(p_actor);

  select * into v_offer from public.trade_offers where id = p_offer_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  select * into v_listing from public.trade_listings where id = v_offer.listing_id for update;
  select * into v_offer from public.trade_offers where id = p_offer_id for update;

  if v_listing.owner_team_id <> v_team.id then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if v_listing.status <> 'open' or v_listing.closes_at <= now() then
    raise exception 'listing_closed' using errcode = 'P0001';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'offer_not_pending' using errcode = 'P0001';
  end if;

  select * into v_offerer from public.fantasy_teams where id = v_offer.offering_team_id;
  if v_offerer.owner_id is null then
    raise exception 'team_unowned' using errcode = 'P0001';
  end if;

  select array_agg(sport_id) into v_sport_ids from public.trade_offer_legs where offer_id = p_offer_id;
  select array_agg(p) into v_picks
  from public.trade_locked_picks(array[v_listing.owner_team_id, v_offerer.id], v_sport_ids) p;

  for v_leg in
    select g.sport_id, i.participant_id as owner_participant_id, g.participant_id as offerer_participant_id
    from public.trade_offer_legs g
    join public.trade_listing_items i on i.listing_id = g.listing_id and i.sport_id = g.sport_id
    where g.offer_id = p_offer_id
    order by g.sport_id
  loop
    select p.* into v_owner_pick from unnest(v_picks) p
     where p.fantasy_team_id = v_listing.owner_team_id and p.sport_id = v_leg.sport_id;
    select p.* into v_offerer_pick from unnest(v_picks) p
     where p.fantasy_team_id = v_offerer.id and p.sport_id = v_leg.sport_id;

    -- Either side may have traded this participant elsewhere since the offer was made.
    if v_owner_pick.participant_id is distinct from v_leg.owner_participant_id
       or v_offerer_pick.participant_id is distinct from v_leg.offerer_participant_id then
      raise exception 'stale_pick' using errcode = 'P0001';
    end if;

    select * into v_owner_live from public.trade_live_score(p_scores, v_leg.owner_participant_id);
    select * into v_offerer_live from public.trade_live_score(p_scores, v_leg.offerer_participant_id);

    -- Each side keeps what it earned while holding the outgoing participant.
    insert into public.banked_scores
      (fantasy_team_id, sport_id, participant_id, trade_offer_id, points, championships, postseason_points)
    values
      (v_listing.owner_team_id, v_leg.sport_id, v_leg.owner_participant_id, p_offer_id,
       v_owner_live.points - v_owner_pick.baseline_points,
       v_owner_live.championships - v_owner_pick.baseline_championships,
       v_owner_live.postseason_points - v_owner_pick.baseline_postseason_points),
      (v_offerer.id, v_leg.sport_id, v_leg.offerer_participant_id, p_offer_id,
       v_offerer_live.points - v_offerer_pick.baseline_points,
       v_offerer_live.championships - v_offerer_pick.baseline_championships,
       v_offerer_live.postseason_points - v_offerer_pick.baseline_postseason_points);

    -- Delete then insert: an in-place UPDATE would trip enforce_pick_uniqueness because the
    -- incoming participant is still held by the other team at that moment. The incoming
    -- participant's live score becomes the new baseline, so only later points count.
    delete from public.picks where id in (v_owner_pick.id, v_offerer_pick.id);
    insert into public.picks
      (fantasy_team_id, sport_id, participant_id,
       baseline_points, baseline_championships, baseline_postseason_points, acquired_at)
    values
      (v_listing.owner_team_id, v_leg.sport_id, v_leg.offerer_participant_id,
       v_offerer_live.points, v_offerer_live.championships, v_offerer_live.postseason_points, now()),
      (v_offerer.id, v_leg.sport_id, v_leg.owner_participant_id,
       v_owner_live.points, v_owner_live.championships, v_owner_live.postseason_points, now());
  end loop;

  update public.trade_offers set status = 'accepted', resolved_at = now() where id = p_offer_id;
  update public.trade_listings
     set status = 'accepted', accepted_offer_id = p_offer_id, resolved_at = now()
   where id = v_listing.id;
  update public.trade_offers set status = 'rejected', resolved_at = now()
   where listing_id = v_listing.id and status = 'pending';

  -- Both teams' picks in the traded sports changed, so any other live listing of theirs that
  -- offers one of those sports now describes a player they no longer hold. Matched by team and
  -- sport, not participant id: in the WNBA a third team can hold the same participant untouched.
  -- Expired listings are left alone so they still read as expired.
  select array_agg(id) into v_stale_listing_ids
  from (
    select l.id
    from public.trade_listings l
    where l.status = 'open'
      and l.closes_at > now()
      and l.id <> v_listing.id
      and l.owner_team_id in (v_listing.owner_team_id, v_offerer.id)
      and exists (
        select 1 from public.trade_listing_items i
        where i.listing_id = l.id and i.sport_id = any(v_sport_ids)
      )
    order by l.id
    for update
  ) stale;

  update public.trade_offers set status = 'void', resolved_at = now()
   where status = 'pending' and listing_id = any(v_stale_listing_ids);
  update public.trade_listings set status = 'cancelled', resolved_at = now()
   where id = any(v_stale_listing_ids);

  -- And any pending offer either team made elsewhere that gives a player who just moved.
  update public.trade_offers o set status = 'void', resolved_at = now()
   where o.status = 'pending'
     and o.offering_team_id in (v_listing.owner_team_id, v_offerer.id)
     and exists (
       select 1 from public.trade_offer_legs g
       where g.offer_id = o.id and g.sport_id = any(v_sport_ids)
     )
     and exists (
       select 1 from public.trade_listings l
       where l.id = o.listing_id and l.status = 'open' and l.closes_at > now()
     );

  perform public.trade_post(v_listing.season_id, p_post_body, p_post_payload, v_listing.id);
end;
$$;

-- ===== pending_trade_decisions =====
-- Feeds the nav badge: offers waiting on the caller. security invoker is enough because every
-- table it reads is publicly readable; auth.uid() scopes the answer to the caller.

create function public.pending_trade_decisions()
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.trade_offers o
  join public.trade_listings l on l.id = o.listing_id
  join public.fantasy_teams t on t.id = l.owner_team_id
  join public.seasons s on s.id = t.season_id
  where o.status = 'pending'
    and l.status = 'open'
    and l.closes_at > now()
    and s.is_active
    and t.owner_id = (select auth.uid());
$$;

-- Supabase grants EXECUTE on new functions to everyone by default. The trade functions take the
-- actor as an argument, so a signed-in user who could call them directly could act as anyone:
-- they are service_role only. The helpers are not part of any API and only the owner-run
-- functions above call them, so nobody else needs execute on them.
revoke execute on function public.create_trade_listing(uuid, text[], text, jsonb) from public, anon, authenticated;
revoke execute on function public.propose_direct_trade(uuid, uuid, text[], text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.make_trade_offer(uuid, uuid, text[], text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.withdraw_trade_offer(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.reject_trade_offer(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.cancel_trade_listing(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.accept_trade_offer(uuid, uuid, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_trade_listing(uuid, text[], text, jsonb) to service_role;
grant execute on function public.propose_direct_trade(uuid, uuid, text[], text, text, jsonb) to service_role;
grant execute on function public.make_trade_offer(uuid, uuid, text[], text, text, jsonb) to service_role;
grant execute on function public.withdraw_trade_offer(uuid, uuid) to service_role;
grant execute on function public.reject_trade_offer(uuid, uuid) to service_role;
grant execute on function public.cancel_trade_listing(uuid, uuid) to service_role;
grant execute on function public.accept_trade_offer(uuid, uuid, jsonb, text, jsonb) to service_role;

revoke execute on function public.trade_actor_team(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.trade_resolve_sports(text[]) from public, anon, authenticated, service_role;
revoke execute on function public.trade_locked_picks(uuid[], uuid[]) from public, anon, authenticated, service_role;
revoke execute on function public.trade_assert_unlisted(uuid, uuid[]) from public, anon, authenticated, service_role;
revoke execute on function public.trade_live_score(jsonb, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.trade_post(uuid, text, jsonb, uuid) from public, anon, authenticated, service_role;

revoke execute on function public.pending_trade_decisions() from public, anon;
grant execute on function public.pending_trade_decisions() to authenticated, service_role;
