# Architecture

One Next.js app at the repo root, backed by Supabase (Postgres, Auth, RLS). Code is organized in
layers that may only depend downward. ESLint (`eslint-plugin-boundaries`) enforces the direction
and dependency-cruiser blocks import cycles, so violations fail `pnpm check`.

## Layers

```
            app            routes: compose features, no logic
           /   \
    features    ui         vertical slices; presentational kit
     /   |   \    \
 data  integrations  \    repositories + mappers; ESPN adapter
     \   /            \
     domain            |   pure rules: scoring, standings, sport catalog
        |              |
       lib  <----------+   env, Supabase clients, logger, Result
```

| Layer          | May import                          | Notes                                                                                                                                                      |
| -------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app`          | features, ui, domain, lib           | Routes only. Never touches `data` or `integrations` directly.                                                                                              |
| `features`     | data, integrations, ui, domain, lib | Never another feature.                                                                                                                                     |
| `data`         | domain, lib                         | The only place queries are built. Maps rows to domain types.                                                                                               |
| `integrations` | domain, lib                         | One adapter per vendor (`espn`, `resend`, `webpush`). Only features import them.                                                                           |
| `ui`           | domain, lib                         | Props in, markup out.                                                                                                                                      |
| `domain`       | domain only                         | No React, Next, Supabase or Node. Also declares ports (`PushNotifier`, `PushStore`) that `integrations` and `data` implement without importing each other. |
| `lib`          | lib only                            | Generic plumbing with no business meaning.                                                                                                                 |

## Request flow

Every request that reaches data follows one chain:

```
route / server action  ->  service (feature)  ->  repository (data)  ->  Supabase (RLS)
   transport + auth         the use case            builds the query        final authority
```

- The **route or action** parses input with Zod, checks who is calling, and translates a `Result`
  into a response.
- The **service** is the use case. It loads facts through repositories and calls pure domain
  functions (for example, `calculateParticipantPoints`).
- The **repository** builds queries and maps rows to domain types. Rows never travel upward.
- **RLS** decides what each caller can read or write, regardless of what the app checks.

## Scoring flow

The database stores facts (wins, rounds reached, major finishes, final ranks). Points are computed
in `domain/scoring` from those facts and the scoring rules. See
[ADR-001](decisions/ADR-001-scoring-in-domain-db-stores-facts.md).

```
ESPN public API -> integrations/espn (validate, map) -> features/sync -> data (upsert facts)
                                                                              |
page -> feature query -> data (read facts + rules) -> domain (points, ranks) -> render
```

Sync runs from a `CRON_SECRET`-guarded route on a schedule and uses the server-only secret key.
Sync flow, in order:

```
pg_cron (every 30 min) -> POST /api/cron/sync (bearer CRON_SECRET, constant-time check)
  -> syncLeague({ now, sports? })
     per sport, 4 at a time, failures isolated, each writing a sync_runs row:
       outside season window ........ skipped (noted once a day)
       ResultsProvider.fetchFacts ... records | stages (+bye implication) | majors | ranks
       planSportSync (pure) ......... facts + existing rows -> upserts / deletes, locks respected
       applyChanges ................. idempotent upsert on (season, participant, rule, event)
       applyRecords ................. same fetch: participant_records, only rows that changed;
                                      a failure is logged and never fails the run
     if anything changed:
       standings_snapshots upsert for today (scoreParticipant -> scoreFantasyTeam -> rankStandings)
       revalidateLeague() ......... drops the cached public read model
```

### Records

A pick also shows its participant's regular-season record ("10-4", NHL "30-20-5", MLS "12-8-6",
NFL "10-6-1" only when there is a tie). Records are display facts, not scoring facts, so they live
in their own table, `participant_records` (one row per season and participant: wins, losses, ties,
OT losses). Wins keep scoring through `participant_results`, and nothing in `domain/scoring` reads a
record ([ADR-001](decisions/ADR-001-scoring-in-domain-db-stores-facts.md) is unchanged).

- **Write.** The ESPN standings call (pro) or team schedule (college) that already feeds wins also
  carries losses, ties and NHL OT losses. `applyFacts` writes them right after the results, through
  `data/participant-records.repository.ts`, from the same fetch (no extra ESPN calls). Only rows that
  changed are written, so a quiet run touches nothing. Free agents ride the same path, in the 30-minute
  run for league-wide feeds and in the daily pool job for college. A records failure is logged and
  swallowed: it must not fail scoring, withhold the snapshot or delay score alerts. Because a loss
  changes a record but no score, a run whose only change is a record still drops the cached model.
- **Read.** `LeagueData.records` carries every record of the season. `buildLeagueModel` attaches a
  `RecordLine` to each `ScoredPick` and `SportPickRow`; the free-agent board attaches one per row. The
  format per sport is `recordStyle` in `domain/sports/sports.ts`, applied by `domain/records`.
  Before a sport's first game there is no row (or an all-zero one), and nothing is shown.
- **Athletes** (WTA, PGA) have no record. Their line ("No. 4 WTA", "No. 12 FedExCup") is read from the
  `final_rank_band` result they already have, whose quantity is the actual rank.
- **Access.** Public read like `participant_results`; only `service_role` writes (no admin edit path,
  since a record is ESPN's number).

Free agents ride along: where ESPN's feed is league-wide (pro sports, WTA, PGA) the same fetch
already covers the whole pool, so the 30-minute run scores free agents with no extra ESPN calls.
College free agents (one ESPN call per team) are scored by the daily pool job instead, in chunks
of 60. See "Free-agent pool" below.

The admin "Sync now" button runs the same service for one sport. Admin overrides are locked rows that sync never overwrites
([ADR-002](decisions/ADR-002-espn-public-api-with-admin-overrides.md)).

## Trade flow

Trades swap one pick for one pick within a sport. Every trade write is a `service_role`-only SQL
function, and the domain owns the rules. See [ADR-003](decisions/ADR-003-trades.md).

```
listing:  form -> Server Action (re-checks session) -> trades service
            fresh league model -> domain validation (tradeable sports, ownership)
            -> repository rpc create_trade_listing / propose_direct_trade (+ feed post, one transaction)
offer:    same path via make_trade_offer; at most one pending offer per team per listing
accept:   Server Action -> service: fresh model -> domain validation
            -> live scores of every participant passed to accept_trade_offer
            -> SQL function locks rows, swaps the picks, banks each side's earned points,
               rejects sibling offers, writes the "trade done" feed post
            -> revalidateLeague() drops the cached model
alerts:   service hands alerts to Next's after(): emails go out after the response,
          so a failed email never fails a trade
```

Expiry is derived (`open` past `closes_at` reads as expired), so no job sweeps listings. Team totals
use credited scores (live minus baseline plus banked), so a trade never moves the leaderboard.

## Free-agent flow

A move drops a team's pick in a sport and adds a free agent in one step, with no approval. Every
move write is a `service_role`-only SQL function, and the domain owns the rules. See
[ADR-004](decisions/ADR-004-free-agent-moves.md).

```
form -> Server Action (re-checks session) -> free-agents service
  pre-check on the cached model (domain validateMove): junk requests cost no ESPN call
  -> ESPN refresh of the two participants only (20 s deadline; no answer, no move)
  -> fresh, uncached data, validated again
  -> live scores of both participants from createParticipantScorer
  -> repository rpc make_free_agent_move, one transaction:
       locks listings, offers, the pick, the added participant (same order as trades)
       banks the dropped participant's earned points, sets the added one's live score as baseline
       swaps the pick, cancels the team's live listings for the sport,
       voids its pending offers that give that pick, writes the "League" feed post
  -> revalidateLeague() drops the cached model
```

Two teams racing for one free agent resolve to a single winner (`not_free_agent` for the loser).
Browsing reads the 10-minute cached model, so a page can be a few minutes behind; the move itself
never is. Like trades, a move never changes the leaderboard: earned points stay with the team.

### Free-agent pool

`participants` holds every team or top athlete ESPN lists for a sport, not just the drafted ones.
A pg_cron job calls `/api/cron/free-agents?sport=<code>` once per sport at 09:15 UTC each day
(bearer `CRON_SECRET`, one sport per request to stay inside the 60 second limit). The route runs
`refreshFreeAgents`: the roster load (`features/sync/roster.ts`, insert-only, so it never renames
or deletes a participant and a re-run inserts nothing) and then, for college sports, scoring of
the free agents in chunks. Pro sports, WTA and PGA free agents are scored in the regular
30-minute sync. Anyone no team holds is a free agent, derived per request (`domain/free-agents`).

## Games flow

The Week page and the team page's "This week" panel read stored games. The games are facts with no
owner; which fantasy teams care about a game is worked out when the page renders. See
[ADR-006](decisions/ADR-006-weekly-games-feed.md).

```
pg_cron (:10 and :40 every hour)  -> POST /api/cron/games?range=live   (yesterday + today)
pg_cron (09:25 UTC daily)         -> POST /api/cron/games?range=weeks  (this week + next)
  bearer CRON_SECRET, constant-time check, range parsed with Zod
  -> refreshGames({ now, range })
     in-season team sports only (season window touches the days), 3 sports at a time, failures isolated:
       pro sports ........ ESPN scoreboard, one call per Eastern day (includes the postseason)
       college sports .... ESPN team schedule, one call per HELD team (whole season in one response)
       fetchScheduledGames  validates with Zod, maps ESPN status to GameStatus, ScheduledGame facts
       upsertGames ........ participant ids mapped per sport, only new or changed rows written
                            (idempotent on sport + ESPN event id)
     if anything changed: revalidateGames() drops the cached games

page -> getWeek / getTeamWeek (feature service)
     -> cached league (current picks, season dates) + cached games for the week [from, to)
     -> domain buildWeekSlate: games by Eastern day, the fantasy teams holding each side,
        showdowns, per-team counts
     -> describeStatus / describeGame: "1:00 PM", "17–14", "W 27–24"
```

The league week (Monday to Sunday, Eastern) belongs to `domain/calendar/week.ts`; a game is on the
Eastern day it starts, so a 10:30 pm tip-off stays on its own day across both clock changes. The
page reads two caches, `league` and `games`, so a pick change shows after the league cache turns
over and a new score after the next refresh. `?week=` outside the season is pulled back into it,
which also bounds the cache keys.

## Push flow

Push alerts tell a member about a trade, a reply or reaction, or new points, on a device where they
turned alerts on. Delivery runs after the response, and a failure never changes an action's result.
See [ADR-005](decisions/ADR-005-web-push-alerts.md).

```
trade service | feed service | sync service        (each builds alerts with domain/push builders)
  -> PushNotifier.notify(build)          port in domain/push; returns at once, never throws
  -> after()                             the response is already sent; build() runs now
  -> deliver(alerts)                     integrations/webpush, one correlation id per notify
       push_targets(recipients, topic)   SQL applies the member's per-topic switch
       claim (recipient, dedupe key)     push_sends ledger: at most once, before any send
       sendPush                          encrypt + VAPID JWT (web-push), our fetch, timeouts,
                                         redirect: "error", retry only 429 and 5xx
       record                            404/410 or bad address: remove the device
                                         real rejection (400, 401, 403, 413): count, prune at 5
                                         outage (429, 5xx, timeout, network): log only
```

Each triggering feature composes its own notifier in its `*.server.ts`, because features cannot
import each other. Delivery has a 20 second budget plus a 3 second tail, since `after()` shares the
route's 60 seconds. With no valid VAPID pair, `deliver` logs once and touches nothing.

The device side is in the browser and stays in `features/push`:

```
prompt (home, feed, trades) or the /me Alerts section
  -> enable(): Notification.requestPermission() first, in the click handler
  -> serial queue: register /sw.js (only here) -> pushManager.subscribe(VAPID public key)
  -> subscribePushAction: session re-checked, address checked against the push-service
     allow-list, keys validated -> register_push_subscription (moves the endpoint to this
     member, keeps the 5 newest devices) -> marker { userId, syncedAt } in localStorage
on every route change (device sync, only once the session is known):
  someone else's or no marker ... drop the browser subscription
  permission denied ............. forget it
  VAPID key changed ............. re-subscribe silently if permission is granted
  more than a day since last .... register again (heals a lost row)
sign out: wrapper in app/ deletes the server row and ends the browser subscription first
```

The worker (`public/sw.js`) has no `fetch` handler. It validates each payload by hand against the
same rules as `pushPayloadSchema`, always shows a notification (a generic one for a payload it
refuses), and opens or focuses a same-origin page on tap. The root layout gets only
`isPushAvailable()`, which reads the environment and no cookies, so static pages stay static.

## Conventions

- Expected failures return `Result<T, AppError>` with a stable `code`; unexpected ones throw and
  are logged with a correlation id.
- Environment is parsed once in `lib/env.ts` (public) and `lib/env.server.ts` (secrets, guarded
  by `server-only`).
- Styling uses only the tokens in `app/globals.css`.
