-- Enums for trades. A listing is one team's players put up for offers; an offer is another team's
-- proposal on it. Expiry is deliberately not a status: it is derived from closes_at, so a listing
-- stays 'open' in the database until an owner resolves it (see trade_tables).

-- block: the owner listed their own players. direct: another owner proposed a trade to this team,
-- which creates a listing owned by the target team so both paths share one engine.
create type public.trade_listing_kind as enum ('block', 'direct');

create type public.trade_listing_status as enum ('open', 'accepted', 'cancelled');

-- rejected: the owner said no, or another offer on the listing was accepted. withdrawn: the
-- offerer took it back. void: the listing was cancelled or a player in the offer moved elsewhere.
create type public.trade_offer_status as enum ('pending', 'accepted', 'rejected', 'withdrawn', 'void');
