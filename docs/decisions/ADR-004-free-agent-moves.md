# ADR-004: Free-agent moves are one atomic drop and add, written by a service-role function

Status: accepted

## Context

A member asked for "simple drop and pick up, like ESPN". Every fantasy team holds exactly one pick
per sport, and team points are computed on read from whatever participant the pick points at
([ADR-001](ADR-001-scoring-in-domain-db-stores-facts.md)). Results are cumulative season facts with
no dates, so what a team earned from a participant cannot be recovered after the pick changes; it
has to be frozen at the moment of the change ([ADR-003](ADR-003-trades.md)).

`participants` used to hold only the drafted rows (211). ESPN lists about 1,450 teams and top
athletes across the eleven sports, so a free agent pool needs those rows to exist. College records
cost one ESPN call per team, while pro standings and athlete rankings are one call per league, so
keeping the whole pool fresh costs very different amounts by sport.

## Decision

**One write path.** An instant drop-and-add is one SECURITY DEFINER function,
`make_free_agent_move`, that only `service_role` can execute, called with `p_actor` as in ADR-003.
The function does not trust the actor beyond identity. It re-checks that the actor owns an approved
team in the active season, takes the dropped participant from the current pick (the client's "drop"
value is only a staleness check), and takes locks in the trades order: listings, then offers, then
the pick, then the added participant (`for no key update`, so foreign-key checks are not blocked).
The not-held check runs after that lock. Two teams racing for one free agent therefore resolve to a
single winner, and the loser gets `not_free_agent`. In sports that allow duplicate picks (the WNBA)
the held check is skipped and the pick is updated in place.

**Credited score is reused, not duplicated.** The function banks live minus baseline for the
dropped participant in `banked_scores`, and the added participant's live score becomes the new
baseline. This is the same bookkeeping as a trade, using the same helpers and the same rule that
live scores come from the app and never from SQL. `banked_scores` gains an explicit `source`
(`trade` or `free_agent`) and a nullable `free_agent_move_id`, with a check that the provenance
columns agree with the source. The source is stored rather than derived from which key is set,
because both keys go null when their parent is deleted, and the team page words the two cases
differently. Existing rows default to `trade`, so `accept_trade_offer` is unchanged.

**Locked sports.** A sport whose season is complete takes no moves. SQL cannot know season status,
so the service checks it before calling, as it does for trades. The function does check that the
sport is part of the actor's season. Pages read a 10-minute cached model, so a sport that just
locked can show Add buttons for a few minutes; the move is still refused.

**Trade listings.** A move cancels the team's live listings that include the sport and voids the
team's pending offers that give that pick, in the same way accepting a trade does. Expired listings
are left alone so they still read as expired. The move dialog reports the side effects in two
counts, because they differ in whose they are: offers other teams made on the listings the move
cancels, and the mover's own offers on other listings that give the dropped pick.

A listing created after the function computed its listing set (its creator only needs the pick
lock, and commits first) would stay open for a player the team is about to drop. After taking the
pick lock the function looks again, read-only so the lock order does not change, and raises
`stale_pick` if it finds one; a retry picks it up. `accept_trade_offer` has the same gap. This
guard needs two concurrent sessions to test, so pgTAP does not cover it.

**Public record.** Each move writes a `free_agent_moves` row and one `league` feed post in the same
transaction, so a move never exists without its post. The domain builds the post, and SQL adds
`moveId` to its payload so the link always points at the real move. Moves and banked rows are
readable by everyone; there are no write policies and no write grants.

**Pool.** Every team ESPN lists for a league (college football limited to Division I, meaning FBS
and FCS), plus the top 100 ranked WTA and PGA athletes. A daily pg_cron job calls a cron route once
per sport, and the route only inserts: it never renames or deletes a participant, so re-running it
is safe. Because it only inserts, the tennis and golf pools grow over the season as athletes enter
the top 100 (about 120 to 150 by season end) instead of tracking the ranking. The job runs daily
at 09:15 UTC, one request per sport so each gets its own 60 second budget.

**Fact freshness.**

- Every 30-minute sync covers the whole pool where the ESPN feed is league-wide (pro sports, WTA,
  PGA), at no extra ESPN calls.
- College free agents are refreshed daily, in chunks.
- Both participants in a move are refreshed right before it runs, with a 20 second deadline
  around the whole refresh (each ESPN call gets 5 seconds and two attempts), and the move is
  refused (`facts_unavailable`) if ESPN cannot answer in time. A stale baseline would let the next sync credit
  points the previous holder earned to the new team, and a move cannot be undone.

## Consequences

- The leaderboard never jumps at a move: earned points stay with the team that earned them.
- The public read model keeps its structure, but the results table grows roughly five to ten times.
- College free-agent records can be up to a day old while browsing. The move itself always uses
  facts fetched just before it.
- An ESPN outage blocks moves in in-season sports.
- There is no cap or cooldown on moves, so a team can stream: add a team before its game, bank the
  win, and drop it for a team playing later. This was accepted as a product decision. A
  cooldown would be one domain constant and one SQL check against `free_agent_moves`.
- Deleting a team deletes its moves and banked rows. A move deleted on its own (an admin cleanup)
  leaves its banked row in place, still marked `free_agent`, with the move reference set to null.
- Adding a move-like action means adding a function and its error tokens, not a new policy.
