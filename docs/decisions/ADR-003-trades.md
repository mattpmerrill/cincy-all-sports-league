# ADR-003: Trades are listings and offers, written by service-role functions

Status: accepted

## Context

Members want to trade players. Every fantasy team holds exactly one pick per sport, and team points
are computed on read from whatever participant the pick points at
([ADR-001](ADR-001-scoring-in-domain-db-stores-facts.md)). Results are cumulative season facts with
no dates, so once a pick changes hands there is no way to work out afterwards what the previous
team earned. A trade also touches many rows at once (two picks, the offer, sibling listings and
offers, a feed post), and accepting one needs live participant scores that only the domain layer
can compute.

## Decision

**One engine, two entry points.** A _listing_ offers one team's players, one participant per listed
sport, and stays open for 24 hours. A `block` listing is a team putting its own players up. A
`direct` listing is created when another owner proposes a trade: it is owned by the _target_ team
(its items are the target's current picks in the requested sports) and carries the proposer's
offer. In both cases the listing owner is the only one who accepts, rejects or cancels. Anyone else
who owns an approved team in the active season can add an offer, at most one pending offer per team
per listing. An offer covers any non-empty subset of the listing's sports, and each leg gives the
offerer's current pick in that same sport, so every team keeps one participant per sport. Composite
foreign keys enforce this in the schema: a leg must match a listing item's sport, and a leg's
listing must be its offer's listing.

**Credited score = live score - baseline + sum of banked.** A pick carries a baseline (the
participant's live score when the team acquired it; zero for drafted picks). When a participant is
traded away, what the team earned while holding it (live minus baseline, per component) is written
to `banked_scores` and stays with that team. The incoming participant's live score becomes the new
baseline, so the new team only earns what comes after the trade. Nothing changes for a team until
its first trade. Live scores come from the app: ADR-001 keeps scoring out of SQL, so the accept
function receives the live score of every participant in the offer as an argument and refuses to run
without all of them.

Accepted trade-off: banked values are frozen at trade time. If a fact about a traded-away
participant is corrected later (an admin fixes a result), the correction changes only the
participant's live score, so it flows to the team that holds it now and never back to the team that
banked the old value. There is deliberately no `>= 0` check on banked values, so a downward
correction cannot make a later trade fail.

**Trade writes are service_role-only SECURITY DEFINER functions.** `anon` and `authenticated` can
read the trade tables (public read, like the feed) and cannot write them: there are no write
policies and no write grants. Every mutation (`create_trade_listing`, `propose_direct_trade`,
`make_trade_offer`, `withdraw_trade_offer`, `reject_trade_offer`, `cancel_trade_listing`,
`accept_trade_offer`) is one function that only `service_role` can execute. The Server Action
authenticates the user and passes the id as `p_actor`; the function does not trust it beyond
identity. It re-checks that the actor owns an approved team in the active season and is the right
party for the action, derives participants from the _current_ picks (never from client input),
locks the listing, offer and pick rows so concurrent calls serialize, and checks status and the
window. Accepting swaps the picks by delete and re-insert, because an in-place update trips
`enforce_pick_uniqueness`, then rejects the other offers on the listing, cancels the two teams'
other live listings in the traded sports, and voids their pending offers elsewhere. The functions
raise `P0001` with stable message tokens (`not_owner`, `listing_closed`, `already_listed`, ...) that
the repository maps to typed `Result` codes.

Not enforced in SQL: a sport whose season is complete (champion crowned) is no longer tradeable.
That depends on season status, which the domain derives from results and rules, so the trades
service checks it before calling the functions.

**Expiry is derived, not scheduled.** A listing is `open` in the database until an owner resolves
it, and is effectively expired once `closes_at <= now()`. The functions apply the same comparison
on offer and accept, and the read side derives the label, so no cron job or status sweep is needed.
"A participant is on at most one open, unexpired listing" depends on `now()`, so it is checked
inside the functions under the owner's pick row locks rather than by a unique index. Expired listings
keep their status so history reads as expired, not cancelled.

**Feed posts in the same transaction.** Creating a listing, making an offer (direct or competing)
and accepting a trade each write one `league` message inside the function, with the caller's
`listingId` injected into the payload. A trade can never exist without its post or the reverse.
The domain builds the body and payload, so post wording stays out of SQL.

## Consequences

- Earned points never move in a trade, and the leaderboard does not jump at the moment of one.
- The accept path is the only place SQL and scoring meet, and it is a plain argument, so it is
  testable with pgTAP without a scoring engine.
- Direct writes to trade tables are denied by both policy and grants; pgTAP covers the allow and
  deny sides, including that signed-in users cannot execute the functions.
- Listing exclusivity is per team and participant: a team cannot have the same pick on two live
  listings, but in the WNBA, where two teams can hold one participant, each can list it.
- Adding a trade action means adding a function and its error tokens, not a new policy.
