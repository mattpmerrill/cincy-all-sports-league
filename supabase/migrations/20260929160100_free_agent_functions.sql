-- The free-agent write path: one SECURITY DEFINER function that only service_role can execute, for
-- the same two reasons as the trade functions (ADR-003, ADR-004):
--   1. A move banks the dropped participant's earned points, and scoring lives in the app
--      (ADR-001), so the server computes the live scores and hands them in.
--   2. A move touches picks, banked scores, listings, offers and a feed post, which must change
--      together or not at all.
-- The server has already verified who the caller is and passes it as p_actor. The function does
-- not trust that beyond identity: it re-checks ownership, derives the dropped participant from the
-- CURRENT pick (p_drop_participant_id is only a staleness check, never a target), and locks what it
-- depends on so two people racing for one free agent serialize and exactly one wins.
--
-- Lock order, the same as the trade functions: listings, then offers (each taken in one statement,
-- ordered by id), then the pick, then the added participant. accept_trade_offer never locks a
-- participant row, so the extra last step cannot invert an order it uses.
--
-- Failures are 'P0001' exceptions whose message is a stable token the repository maps to a typed
-- Result: not_owner, invalid_sport, same_participant, stale_pick, not_found, not_free_agent,
-- missing_scores. Genuine constraint violations surface as is.
--
-- Not enforced here: a sport whose season is complete no longer takes moves. That needs the season
-- status the domain derives from results and rules, so the free-agents service checks it before
-- calling (ADR-004).
--
-- The trade helpers (trade_actor_team, trade_locked_picks, trade_live_score) are reused on purpose:
-- "who is the actor", "lock picks in id order" and "all three live numbers or fail" must mean the
-- same thing for both features. They are revoked from every role, and this function can still call
-- them because it runs as its owner, as accept_trade_offer does.

create function public.make_free_agent_move(
  p_actor uuid,
  p_sport_code text,
  p_drop_participant_id uuid,
  p_add_participant_id uuid,
  p_scores jsonb,
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
  v_sport_id uuid;
  v_allows_duplicates boolean;
  v_listing_ids uuid[];
  v_pick public.picks;
  v_drop_live record;
  v_add_live record;
  v_move_id uuid;
begin
  v_team := public.trade_actor_team(p_actor);

  -- The sport must be part of the actor's season, not merely exist.
  select s.id, s.allows_duplicate_picks into v_sport_id, v_allows_duplicates
  from public.sports s
  join public.season_sports ss on ss.sport_id = s.id and ss.season_id = v_team.season_id
  where s.code = p_sport_code;
  if not found then
    raise exception 'invalid_sport' using errcode = 'P0001';
  end if;

  if p_drop_participant_id is not distinct from p_add_participant_id then
    raise exception 'same_participant' using errcode = 'P0001';
  end if;

  -- 1. Listings: the team's live listings that offer this sport. Its pick in the sport is about
  -- to change, so they would describe a player it no longer holds. Matched by team and sport, as
  -- in accept_trade_offer. Expired listings are left alone so they still read as expired. One
  -- statement, ordered by id.
  select array_agg(id) into v_listing_ids
  from (
    select l.id
    from public.trade_listings l
    where l.owner_team_id = v_team.id
      and l.status = 'open'
      and l.closes_at > now()
      and exists (
        select 1 from public.trade_listing_items i
        where i.listing_id = l.id and i.sport_id = v_sport_id
      )
    order by l.id
    for update of l
  ) locked;

  -- 2. Offers: every pending offer on those listings, and any pending offer the team made
  -- elsewhere that gives this sport's pick. One statement, ordered by id.
  perform 1
  from (
    select o.id
    from public.trade_offers o
    where o.status = 'pending'
      and (
        o.listing_id = any(v_listing_ids)
        or (
          o.offering_team_id = v_team.id
          and exists (
            select 1 from public.trade_offer_legs g
            where g.offer_id = o.id and g.sport_id = v_sport_id
          )
          and exists (
            select 1 from public.trade_listings l
            where l.id = o.listing_id and l.status = 'open' and l.closes_at > now()
          )
        )
      )
    order by o.id
    for update of o
  ) locked;

  -- 3. The pick. Not found (no pick in this sport) reads as stale like a changed one.
  select p.* into v_pick
  from public.trade_locked_picks(array[v_team.id], array[v_sport_id]) p;
  if not found or v_pick.participant_id is distinct from p_drop_participant_id then
    raise exception 'stale_pick' using errcode = 'P0001';
  end if;

  -- A listing created after the set above was computed (its creator only needs the pick lock we
  -- now hold, and it commits before us) would stay open for a player this team is about to drop.
  -- Read-only and after the pick lock, so it cannot change the lock order; a retry picks the new
  -- listing up in the set. accept_trade_offer has the same gap.
  if exists (
    select 1
    from public.trade_listings l
    join public.trade_listing_items i on i.listing_id = l.id
    where l.owner_team_id = v_team.id
      and i.sport_id = v_sport_id
      and l.status = 'open'
      and l.closes_at > now()
      and l.id <> all(coalesce(v_listing_ids, '{}'))
  ) then
    raise exception 'stale_pick' using errcode = 'P0001';
  end if;

  -- 4. The added participant. NO KEY UPDATE, not UPDATE: two teams racing for the same participant
  -- conflict with each other and serialize, but the foreign-key checks on picks and moves (which
  -- take KEY SHARE on this row) do not wait behind it.
  perform 1
  from public.participants
  where id = p_add_participant_id and sport_id = v_sport_id
  for no key update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  -- Checked only after the lock. The loser of a race waits on the lock above, and under read
  -- committed this is a new statement, so it sees the winner's committed pick.
  if not v_allows_duplicates and exists (
    select 1
    from public.picks p
    join public.fantasy_teams t on t.id = p.fantasy_team_id
    where p.participant_id = p_add_participant_id and t.season_id = v_team.season_id
  ) then
    raise exception 'not_free_agent' using errcode = 'P0001';
  end if;

  select * into v_drop_live from public.trade_live_score(p_scores, v_pick.participant_id);
  select * into v_add_live from public.trade_live_score(p_scores, p_add_participant_id);

  insert into public.free_agent_moves
    (season_id, fantasy_team_id, sport_id, dropped_participant_id, added_participant_id, created_by)
  values
    (v_team.season_id, v_team.id, v_sport_id, v_pick.participant_id, p_add_participant_id, p_actor)
  returning id into v_move_id;

  -- The team keeps what it earned while holding the dropped participant.
  insert into public.banked_scores
    (fantasy_team_id, sport_id, participant_id, source, free_agent_move_id,
     points, championships, postseason_points)
  values
    (v_team.id, v_sport_id, v_pick.participant_id, 'free_agent', v_move_id,
     v_drop_live.points - v_pick.baseline_points,
     v_drop_live.championships - v_pick.baseline_championships,
     v_drop_live.postseason_points - v_pick.baseline_postseason_points);

  -- An in-place UPDATE is safe here, unlike in accept_trade_offer: nobody holds the incoming
  -- participant, so enforce_pick_uniqueness passes (and in the WNBA it skips the check). The
  -- incoming participant's live score becomes the new baseline, so only later points count.
  update public.picks
     set participant_id = p_add_participant_id,
         baseline_points = v_add_live.points,
         baseline_championships = v_add_live.championships,
         baseline_postseason_points = v_add_live.postseason_points,
         acquired_at = now()
   where id = v_pick.id;

  -- Everything below was locked up front. Voided offers get no email, as with accepted trades.
  update public.trade_offers set status = 'void', resolved_at = now()
   where status = 'pending' and listing_id = any(v_listing_ids);
  update public.trade_listings set status = 'cancelled', resolved_at = now()
   where id = any(v_listing_ids);

  update public.trade_offers o set status = 'void', resolved_at = now()
   where o.status = 'pending'
     and o.offering_team_id = v_team.id
     and exists (
       select 1 from public.trade_offer_legs g
       where g.offer_id = o.id and g.sport_id = v_sport_id
     )
     and exists (
       select 1 from public.trade_listings l
       where l.id = o.listing_id and l.status = 'open' and l.closes_at > now()
     );

  -- The league post is written in this transaction so a move never exists without its post. The
  -- payload's moveId is injected here, not trusted from the caller, so the post always points at
  -- the real move.
  insert into public.messages (season_id, kind, body, payload)
  values (
    v_team.season_id,
    'league',
    p_post_body,
    coalesce(p_post_payload, '{}'::jsonb) || jsonb_build_object('moveId', v_move_id)
  );

  return v_move_id;
end;
$$;

-- Same reason as the trade functions: Supabase grants EXECUTE on new functions to everyone by
-- default, and this one takes the actor as an argument, so it is service_role only.
revoke execute on function public.make_free_agent_move(uuid, text, uuid, uuid, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.make_free_agent_move(uuid, text, uuid, uuid, jsonb, text, jsonb) to service_role;
