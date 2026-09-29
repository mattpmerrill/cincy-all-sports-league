-- Live trade updates: the Trades tab badge listens for offer and listing status changes. Guarded
-- like feed_realtime so the migration is re-runnable and does not fail where the publication is
-- missing.
--
-- Replica identity stays at the default (primary key). Unlike message_reactions, nothing here is
-- hard-deleted, and an UPDATE event carries the whole new row, which includes the status the badge
-- filters on. The badge refetches its count instead of diffing old rows.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trade_listings'
    ) then
      alter publication supabase_realtime add table public.trade_listings;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trade_offers'
    ) then
      alter publication supabase_realtime add table public.trade_offers;
    end if;
  end if;
end;
$$;
