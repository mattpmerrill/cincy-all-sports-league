-- RLS for the feed. League posts and digest_sends are written only with the secret key
-- (service_role bypasses RLS), so they have no write policies for anon or authenticated.

alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.digest_sends enable row level security;

-- Public read: signed-out visitors can follow the trash talk.
create policy "public read" on public.messages for select to anon, authenticated using (true);
create policy "public read" on public.message_reactions for select to anon, authenticated using (true);

-- Post: sign in AND own an approved team, as yourself, in the active season.
create policy "owners insert member messages" on public.messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and kind = 'member'
    and deleted_at is null
    and (select public.owns_team())
    and season_id in (select id from public.seasons where is_active)
  );

-- Soft delete: the author or an admin. Column grants and messages_soft_delete_only limit the
-- update to setting deleted_at, so this is not an edit permission.
create policy "author or admin soft delete" on public.messages
  for update to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()))
  with check (author_id = (select auth.uid()) or (select public.is_admin()));

-- Reactions carry the same posting rights as messages, and cannot target a removed message.
create policy "owners react" on public.message_reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.owns_team())
    and exists (
      select 1 from public.messages m
      where m.id = message_id and m.deleted_at is null
    )
  );

-- Removing your own reaction never needs team ownership, so losing a team cannot strand one.
create policy "own reaction delete" on public.message_reactions
  for delete to authenticated using (user_id = (select auth.uid()));
