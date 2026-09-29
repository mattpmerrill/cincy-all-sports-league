-- RLS for trades. Everything is publicly readable, like the feed and the rosters: a trade posts to
-- the public league feed anyway, and signed-out visitors can follow the trading block. There are
-- deliberately NO insert, update or delete policies: every write goes through the service_role
-- functions in trade_functions, so a direct write from anon or authenticated is denied.

alter table public.trade_listings enable row level security;
alter table public.trade_listing_items enable row level security;
alter table public.trade_offers enable row level security;
alter table public.trade_offer_legs enable row level security;
alter table public.banked_scores enable row level security;

create policy "public read" on public.trade_listings for select to anon, authenticated using (true);
create policy "public read" on public.trade_listing_items for select to anon, authenticated using (true);
create policy "public read" on public.trade_offers for select to anon, authenticated using (true);
create policy "public read" on public.trade_offer_legs for select to anon, authenticated using (true);
create policy "public read" on public.banked_scores for select to anon, authenticated using (true);
