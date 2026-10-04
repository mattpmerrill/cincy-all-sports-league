-- The matchups write path: one SECURITY DEFINER function that only service_role can execute.
-- Every Monday it closes last week's open matchups and opens this week's, in one transaction, so
-- a week is never closed without the next one opening (and no point is counted twice or lost).
--
-- Scoring lives in the app (ADR-001), so the server computes the current season totals and the
-- pairings and hands them in: p_finals is [{ team_id, points }] (each team's current total, written
-- as end points on every still-open row) and p_pairings is
-- [{ home_team_id, away_team_id, home_start_points, away_start_points }] (this week's rows).
--
-- Idempotent and safe against overlapping calls. The cron fires twice a day for DST and daily to
-- catch up a missed Monday, so overlap and repeats are normal. The function takes a row lock on
-- the season (FOR NO KEY UPDATE, like the move functions lock participants: it serializes two
-- rollovers but does not block the foreign-key checks other writers take on the season). The
-- second caller waits, then sees the first one's committed rows for the week and changes nothing.
-- Under read committed that check is a new statement, so it does see them. A season row rather
-- than an advisory lock because the repo's functions all lock rows, and a missing season then
-- fails loudly instead of locking a key nobody else uses.
--
-- When the week already has rows it changes nothing at all, not even finalizing: finalizing
-- belongs to the call that opens the next week, with totals from the same moment.
--
-- Failures are 'P0001' exceptions whose message is a stable token the repository maps to a typed
-- Result: invalid_week_start, season_not_found, no_pairings, invalid_pairings, duplicate_team,
-- invalid_finals, missing_final. Genuine constraint violations (a team of another season, a
-- repeated pairing) surface as is.
--
-- Returns jsonb { rolled, finalized, created }. rolled is false when the week already existed.

create function public.roll_matchup_week(
  p_season_id uuid,
  p_week_start date,
  p_finals jsonb,
  p_pairings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open_ids uuid[];
  v_finalized integer;
  v_created integer;
begin
  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'invalid_week_start' using errcode = 'P0001';
  end if;

  perform 1 from public.seasons where id = p_season_id for no key update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.matchups
    where season_id = p_season_id and week_start = p_week_start
  ) then
    return jsonb_build_object('rolled', false, 'finalized', 0, 'created', 0);
  end if;

  if jsonb_typeof(p_pairings) is distinct from 'array' then
    raise exception 'invalid_pairings' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_pairings) = 0 then
    raise exception 'no_pairings' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_pairings) as x (
      home_team_id uuid, away_team_id uuid, home_start_points numeric, away_start_points numeric
    )
    where x.home_team_id is null or x.away_team_id is null
       or x.home_start_points is null or x.away_start_points is null
  ) then
    raise exception 'invalid_pairings' using errcode = 'P0001';
  end if;

  -- A team may appear once in the whole week, on either side.
  if exists (
    select 1
    from (
      select x.home_team_id as team_id
      from jsonb_to_recordset(p_pairings) as x (home_team_id uuid, away_team_id uuid)
      union all
      select x.away_team_id
      from jsonb_to_recordset(p_pairings) as x (home_team_id uuid, away_team_id uuid)
    ) t
    group by t.team_id
    having count(*) > 1
  ) then
    raise exception 'duplicate_team' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_finals) is distinct from 'array' then
    raise exception 'invalid_finals' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_finals) as f (team_id uuid, points numeric)
    group by f.team_id
    having f.team_id is null or count(*) > 1
  ) then
    raise exception 'invalid_finals' using errcode = 'P0001';
  end if;

  -- Close every open earlier week, not only the previous one: a missed Monday leaves its rows
  -- open, and they should end at the first totals we have after it. Locked in id order, and every
  -- team of those rows must have a final, or the whole call fails rather than leaving a half
  -- result.
  select array_agg(id) into v_open_ids
  from (
    select m.id
    from public.matchups m
    where m.season_id = p_season_id
      and m.week_start < p_week_start
      and m.finalized_at is null
    order by m.id
    for update of m
  ) locked;

  if exists (
    select 1
    from public.matchups m
    cross join lateral (values (m.home_team_id), (m.away_team_id)) t (team_id)
    where m.id = any(v_open_ids)
      and not exists (
        select 1
        from jsonb_to_recordset(p_finals) as f (team_id uuid, points numeric)
        where f.team_id = t.team_id and f.points is not null
      )
  ) then
    raise exception 'missing_final' using errcode = 'P0001';
  end if;

  with finals as (
    select f.team_id, f.points
    from jsonb_to_recordset(p_finals) as f (team_id uuid, points numeric)
  )
  update public.matchups m
     set home_end_points = h.points,
         away_end_points = a.points,
         finalized_at = now()
    from finals h, finals a
   where m.id = any(v_open_ids)
     and h.team_id = m.home_team_id
     and a.team_id = m.away_team_id;
  get diagnostics v_finalized = row_count;

  insert into public.matchups
    (season_id, week_start, home_team_id, away_team_id, home_start_points, away_start_points)
  select p_season_id, p_week_start, x.home_team_id, x.away_team_id, x.home_start_points, x.away_start_points
  from jsonb_to_recordset(p_pairings) as x (
    home_team_id uuid, away_team_id uuid, home_start_points numeric, away_start_points numeric
  );
  get diagnostics v_created = row_count;

  return jsonb_build_object('rolled', true, 'finalized', v_finalized, 'created', v_created);
end;
$$;

-- Same reason as the other write functions: Supabase grants EXECUTE on new functions to everyone
-- by default, and this one writes on its own authority, so it is service_role only.
revoke execute on function public.roll_matchup_week(uuid, date, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.roll_matchup_week(uuid, date, jsonb, jsonb) to service_role;
