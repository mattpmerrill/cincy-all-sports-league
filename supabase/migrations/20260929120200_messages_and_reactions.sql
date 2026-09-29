-- The league feed: messages (with one level of replies) and emoji reactions, plus the helper and
-- triggers that keep them honest. Access rules live in feed_rls_policies.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  -- Null for league posts. A deleted profile keeps its messages, anonymised, so replies still read.
  author_id uuid references public.profiles (id) on delete set null,
  kind public.message_kind not null,
  body text not null check (length(btrim(body)) between 1 and 500),
  parent_id uuid references public.messages (id) on delete cascade,
  -- Structured data behind a league post (teams, deltas) so the UI can render richer cards.
  payload jsonb not null default '{}'::jsonb,
  -- Soft delete: the row stays so replies keep their parent and the UI shows "message removed".
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  -- Only the league side is a CHECK: a member message legitimately ends up with a null author when
  -- its profile is deleted (on delete set null). "Member needs an author" is enforced on insert by
  -- enforce_message_reply_rules instead.
  constraint messages_league_shape check (
    kind <> 'league' or (author_id is null and parent_id is null)
  )
);

create index messages_season_created_idx on public.messages (season_id, created_at desc);
create index messages_parent_idx on public.messages (parent_id);
-- Backs the rate-limit count.
create index messages_author_created_idx on public.messages (author_id, created_at desc)
  where kind = 'member';

-- Replies are one level deep and stay in their parent's season. A CHECK cannot look at another
-- row, so a trigger does. Reply-to-reply would make a phone-width thread unreadable.
create function public.enforce_message_reply_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent public.messages;
begin
  -- A member message must have an author when it is written. (Updates that null the author come
  -- from on delete set null on profiles, which must not be blocked, so this is insert-only.)
  if tg_op = 'INSERT' and new.kind = 'member' and new.author_id is null then
    raise exception 'member messages require an author' using errcode = 'check_violation';
  end if;

  if new.parent_id is not null then
    select * into parent from public.messages where id = new.parent_id;
    if parent.parent_id is not null then
      raise exception 'replies cannot be nested' using errcode = 'check_violation';
    end if;
    if parent.season_id <> new.season_id then
      raise exception 'a reply must be in the same season as its parent'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger messages_enforce_reply_rules
  before insert on public.messages
  for each row execute function public.enforce_message_reply_rules();

-- Messages are immutable except for the soft delete. Column grants already limit authenticated to
-- deleted_at; this trigger is the second lock (and covers the secret key too: no editing, ever).
-- The one other legal change is author_id -> null, which is what deleting a profile does.
create function public.enforce_message_soft_delete_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'deleted_at' - 'author_id') is distinct from (to_jsonb(old) - 'deleted_at' - 'author_id')
     or (new.author_id is distinct from old.author_id and new.author_id is not null) then
    raise exception 'messages cannot be edited' using errcode = 'insufficient_privilege';
  end if;
  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception 'a deleted message cannot be restored' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger messages_soft_delete_only
  before update on public.messages
  for each row execute function public.enforce_message_soft_delete_only();

-- 10 member messages per author per rolling minute. Deleted messages still count, so posting and
-- deleting is not a way around it. The app maps the 'rate_limited' message to a friendly error.
create function public.enforce_message_rate_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'member' and (
    select count(*)
    from public.messages
    where author_id = new.author_id
      and kind = 'member'
      and created_at > now() - interval '1 minute'
  ) >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function public.enforce_message_rate_limit();

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji public.reaction_emoji not null,
  created_at timestamptz not null default now(),
  -- One reaction per person per emoji per message.
  primary key (message_id, user_id, emoji)
);

-- Realtime DELETE events only carry the primary key by default, and RLS-filtered subscriptions
-- need the old row. FULL also puts message_id on the event so clients can decrement a count.
alter table public.message_reactions replica identity full;

-- Who may post or react: the caller owns an approved team in the active season. Ownership is only
-- set by approve_team_claim (or an admin), so owner_id is the "approved" signal. SECURITY DEFINER
-- keeps it independent of the caller's own read access; search_path is pinned like is_admin().
create function public.owns_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fantasy_teams t
    join public.seasons s on s.id = t.season_id
    where s.is_active and t.owner_id = (select auth.uid())
  );
$$;

revoke execute on function public.owns_team() from public, anon;
grant execute on function public.owns_team() to authenticated, service_role;
