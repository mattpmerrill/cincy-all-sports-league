-- Trades: listings, the offers on them, and the score bookkeeping that lets a pick change hands
-- mid-season without moving points that were already earned. Writes go through the functions in
-- trade_functions (service_role only); access rules live in trade_rls_policies.

-- Credited score for a pick = live participant score - baseline (+ any banked rows for the team).
-- Results have no dates (participant_results are cumulative season facts), so what a team earned
-- before a trade cannot be recovered afterwards; it is recorded at trade time instead. Drafted
-- picks keep baseline 0, so nothing changes until a team's first trade.
alter table public.picks
  add column baseline_points numeric(9, 4) not null default 0,
  add column baseline_championships integer not null default 0,
  add column baseline_postseason_points numeric(9, 4) not null default 0,
  -- Null means drafted, not acquired by trade.
  add column acquired_at timestamptz;

create table public.trade_listings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  -- The team whose players are on offer, and the only one that can accept, reject or cancel.
  owner_team_id uuid not null,
  kind public.trade_listing_kind not null,
  status public.trade_listing_status not null default 'open',
  created_by uuid references public.profiles (id) on delete set null,
  -- created_at + 24 hours, set by the function. Offers and accepts are refused once it passes;
  -- the status stays 'open' (expiry is derived, so no cron job is needed).
  closes_at timestamptz not null,
  accepted_offer_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (owner_team_id, season_id)
    references public.fantasy_teams (id, season_id) on delete cascade,
  constraint trade_listings_resolution_shape check (
    case status
      when 'open' then resolved_at is null and accepted_offer_id is null
      when 'accepted' then resolved_at is not null and accepted_offer_id is not null
      else resolved_at is not null and accepted_offer_id is null
    end
  )
);

create index trade_listings_open_idx on public.trade_listings (season_id, closes_at)
  where status = 'open';
create index trade_listings_owner_team_idx on public.trade_listings (owner_team_id);

-- One row per listed sport: the participant the owner held in that sport when the listing was
-- made. A participant can be on only one listing that is open and not expired; that depends on
-- now(), which an index cannot express, so the trade functions enforce it under row locks.
create table public.trade_listing_items (
  listing_id uuid not null references public.trade_listings (id) on delete cascade,
  sport_id uuid not null,
  participant_id uuid not null,
  primary key (listing_id, sport_id),
  foreign key (participant_id, sport_id)
    references public.participants (id, sport_id) on delete restrict
);

create index trade_listing_items_participant_idx on public.trade_listing_items (participant_id);

create table public.trade_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.trade_listings (id) on delete cascade,
  offering_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  note text check (length(btrim(note)) between 1 and 140),
  status public.trade_offer_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((status = 'pending') = (resolved_at is null)),
  -- Lets legs prove they belong to the offer's own listing, and the listing prove that its
  -- accepted offer is one of its own.
  unique (id, listing_id)
);

-- One live offer per team per listing; a withdrawn or rejected one does not block a new offer.
create unique index trade_offers_one_pending_idx on public.trade_offers (listing_id, offering_team_id)
  where status = 'pending';
create index trade_offers_offering_team_idx on public.trade_offers (offering_team_id);

alter table public.trade_listings
  add foreign key (accepted_offer_id, id) references public.trade_offers (id, listing_id);

-- What the offerer gives, one participant per sport. The FK to the listing's items forces each
-- leg to be in a sport the listing offers, so an offer is always a subset of the listing, and the
-- offer FK keeps leg.listing_id equal to the offer's listing.
create table public.trade_offer_legs (
  offer_id uuid not null,
  sport_id uuid not null,
  listing_id uuid not null,
  participant_id uuid not null,
  primary key (offer_id, sport_id),
  foreign key (offer_id, listing_id)
    references public.trade_offers (id, listing_id) on delete cascade,
  -- Cascade: deleting a listing (via its team) deletes its items and offers in separate cascade
  -- statements, and a plain reference would be checked before the offers' legs are gone.
  foreign key (listing_id, sport_id)
    references public.trade_listing_items (listing_id, sport_id) on delete cascade,
  foreign key (participant_id, sport_id)
    references public.participants (id, sport_id) on delete restrict
);

create index trade_offer_legs_listing_sport_idx on public.trade_offer_legs (listing_id, sport_id);

-- Points a team earned from a participant while it held them, frozen when the participant is
-- traded away. Deliberately no >= 0 checks: live minus baseline can dip if a fact is corrected
-- downward, and a check would then make the trade fail instead of recording the correction.
create table public.banked_scores (
  id uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  sport_id uuid not null,
  participant_id uuid not null,
  -- Provenance only. Set null, not cascade and not restrict: deleting a team cascades its offers,
  -- and the counterparty must keep the points it earned (that is the point of banking) without
  -- the delete failing on the reference.
  trade_offer_id uuid references public.trade_offers (id) on delete set null,
  points numeric(9, 4) not null,
  championships integer not null,
  postseason_points numeric(9, 4) not null,
  created_at timestamptz not null default now(),
  foreign key (participant_id, sport_id)
    references public.participants (id, sport_id) on delete restrict
);

create index banked_scores_fantasy_team_idx on public.banked_scores (fantasy_team_id);
