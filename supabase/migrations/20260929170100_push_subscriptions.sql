-- Web Push device subscriptions and the service_role-only functions that manage them.
--
-- A subscription's endpoint and keys are credentials: anyone holding them can push to that device.
-- So the table has RLS on with NO policies and no grants for anon or authenticated, not even to the
-- row's owner. The Server Action re-checks the session, then acts through the admin client, which
-- is the only reader or writer (denied twice over: no policy and no grant).
--
-- The functions are SECURITY INVOKER on purpose. Their only caller is service_role, which already
-- holds the table grants below, so DEFINER would add privilege without adding anything the caller
-- lacks. Failures are 'P0001' exceptions with a stable token the repository maps: not_found,
-- invalid_subscription (register_push_subscription) and invalid_max (record_push_failure).

-- Mirrors PUSH_TOPICS in domain/push; a compile-time check in the data layer keeps them in step.
create type public.push_topic as enum ('trades', 'feed', 'scores');

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- https only and bounded: the app also allow-lists push service hosts before ever POSTing here.
  endpoint text not null unique check (endpoint ~ '^https://\S+$' and length(endpoint) <= 1024),
  -- Unpadded base64url of a P-256 point (65 bytes) and the 16-byte auth secret.
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}$'),
  -- A short friendly name ("iPhone"), never the raw user agent.
  device_label text not null default 'Device' check (length(btrim(device_label)) between 1 and 40),
  failure_count integer not null default 0 check (failure_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- When the member last registered this device. Separate from updated_at, which the shared
  -- trigger stamps on EVERY update including failure counts and success stamps, so ranking the
  -- device cap by it would evict a random device after a batch of sends.
  last_registered_at timestamptz not null default now(),
  last_success_at timestamptz
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

-- Same pattern as trade_table_privileges: strip everything, grant back only what the app needs.
-- service_role needs explicit grants in this CLI version.
revoke all on public.push_subscriptions from anon, authenticated, service_role;
grant select, insert, update, delete on public.push_subscriptions to service_role;

-- ===== functions =====

-- Registers (or refreshes) a device for a member. One statement moves an endpoint that already
-- belongs to someone else (a shared device where a different member just turned alerts on) and
-- enforces the per-member device cap, so neither can race between separate round trips.
--
-- Input is validated here, before the insert, and fails with the stable token invalid_subscription
-- and no row data. A CHECK violation would instead carry "Failing row contains (...)" with the
-- endpoint and keys in its DETAIL, which reaches PostgREST responses and the Postgres logs. The
-- table CHECKs stay as the last line of defense.
--
-- Not covered by pgTAP: two concurrent registrations by the same member serialize on the profile
-- row lock below, which needs two sessions to exercise, so it was checked by hand instead.
create function public.register_push_subscription(
  p_actor uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_device_label text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_label text;
begin
  -- Locks the profile row (without blocking the foreign-key check on the insert below) so two
  -- registrations by the same member serialize and the cap trim sees each other's rows.
  perform 1 from public.profiles where id = p_actor for no key update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if p_endpoint is null or p_endpoint !~ '^https://\S+$' or length(p_endpoint) > 1024
     or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}$'
     or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'invalid_subscription' using errcode = 'P0001';
  end if;

  -- The label is cosmetic, so a bad one is repaired rather than refused: blank becomes the
  -- default and an overlong one is clipped to the column's 40-character limit.
  v_label := left(coalesce(nullif(btrim(p_device_label), ''), 'Device'), 40);
  v_label := coalesce(nullif(btrim(v_label), ''), 'Device');

  -- A re-registration replaces the keys (they change when a browser re-subscribes), forgives past
  -- failures and moves last_registered_at, which the cap trim below ranks by.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device_label)
  values (p_actor, p_endpoint, p_p256dh, p_auth, v_label)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        device_label = excluded.device_label,
        failure_count = 0,
        last_registered_at = now()
  returning id into v_id;

  -- Keep this device plus the 4 most recently registered others. Excluding v_id explicitly means
  -- the device just registered survives even when timestamps tie inside one transaction.
  delete from public.push_subscriptions
  where user_id = p_actor
    and id <> v_id
    and id not in (
      select s.id from public.push_subscriptions s
      where s.user_id = p_actor and s.id <> v_id
      order by s.last_registered_at desc, s.id
      limit 4
    );

  return v_id;
end;
$$;

-- The devices that should receive an alert of one topic. The per-topic switch is applied here, in
-- SQL, so pgTAP covers it; the app only decides WHO an event is about, not whether they opted in.
-- A topic added to the enum without a CASE arm yields null, which the where clause drops: nobody
-- is alerted until the arm exists.
create function public.push_targets(p_user_ids uuid[], p_topic public.push_topic)
returns table (id uuid, user_id uuid, endpoint text, p256dh text, auth text)
language sql
stable
set search_path = ''
as $$
  select s.id, s.user_id, s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id
  where s.user_id = any(p_user_ids)
    and case p_topic
      when 'trades' then p.push_trades
      when 'feed' then p.push_feed
      when 'scores' then p.push_scores
    end;
$$;

-- Counts one failed send and prunes a subscription that keeps failing. One UPDATE ... RETURNING
-- takes the row lock, so concurrent failures each count exactly once. 404/410 are pruned by the
-- app directly; this is for the ambiguous failures (rejected, unavailable) that may be permanent.
create function public.record_push_failure(p_id uuid, p_max integer)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- A null or zero limit would compare as never (or always) reached; refuse it loudly.
  if p_max is null or p_max < 1 then
    raise exception 'invalid_max' using errcode = 'P0001';
  end if;

  update public.push_subscriptions
  set failure_count = failure_count + 1
  where id = p_id
  returning failure_count into v_count;

  if not found then
    return 'missing';
  end if;

  if v_count >= p_max then
    delete from public.push_subscriptions where id = p_id;
    return 'pruned';
  end if;
  return 'counted';
end;
$$;

-- Same reason as the trade functions: Supabase grants EXECUTE on new functions to everyone by
-- default, and these take the actor or a subscription id as an argument, so a signed-in user who
-- could call them directly could act on (or read the keys of) anyone. service_role only.
revoke execute on function public.register_push_subscription(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.push_targets(uuid[], public.push_topic) from public, anon, authenticated;
revoke execute on function public.record_push_failure(uuid, integer) from public, anon, authenticated;
grant execute on function public.register_push_subscription(uuid, text, text, text, text) to service_role;
grant execute on function public.push_targets(uuid[], public.push_topic) to service_role;
grant execute on function public.record_push_failure(uuid, integer) to service_role;
