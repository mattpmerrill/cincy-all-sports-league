-- Explicit grants for the trade tables and the new pick columns, same pattern as table_privileges:
-- strip everything, then grant back only what the app needs. service_role needs explicit grants in
-- this CLI version. picks already grants only select to anon and authenticated, so the new baseline
-- columns are read-only for them without a change here.

revoke all on
  public.trade_listings, public.trade_listing_items, public.trade_offers,
  public.trade_offer_legs, public.banked_scores
from anon, authenticated, service_role;

grant all on
  public.trade_listings, public.trade_listing_items, public.trade_offers,
  public.trade_offer_legs, public.banked_scores
to service_role;

grant select on
  public.trade_listings, public.trade_listing_items, public.trade_offers,
  public.trade_offer_legs, public.banked_scores
to anon, authenticated;
