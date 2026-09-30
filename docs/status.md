# Status and handoff

Where the project stands and how to pick it up. Update this at the end of each working session.

**As of 2026-09-30.** Everything below is live on https://www.cincysports.xyz, `main` is clean and
deployed, and production has every migration in `supabase/migrations/` applied. Push alerts went
out on 2026-09-30 in the staged order: migrations, then the code without keys, then the VAPID keys
and a rebuild. The site reports push as configured (`configured\":true` on `/rules`) and `/sw.js`
is served with the intended headers on Vercel. What is still open is the real-device check: Matt
tests his own iPhone (steps 7 onward of the ship checklist) before any announcement, and nobody
has subscribed yet.

## What is live

| Area             | What it does                                                                                                                                                                                                     | Start reading                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Leaderboard      | Live standings from ESPN, ties, movement, per-sport bars; nudges visitors to claim a team                                                                                                                        | `src/app/page.tsx`, `features/standings`, `features/claims`                                                                    |
| Scoring and sync | Facts in the DB, points in `domain/scoring`; pg_cron sync every 30 min                                                                                                                                           | [ADR-001](decisions/ADR-001-scoring-in-domain-db-stores-facts.md), `features/sync`                                             |
| Feed             | Trash talk, reactions, replies, realtime, automatic League posts                                                                                                                                                 | `features/feed`                                                                                                                |
| Weekly digest    | Monday 8am ET standings email via Resend, one-click unsubscribe                                                                                                                                                  | `features/digest`                                                                                                              |
| Trades           | Trading block and direct offers, 24h open bidding, earned points stay, email alerts, badge, confetti                                                                                                             | [ADR-003](decisions/ADR-003-trades.md), `features/trades`, "Trade flow" in [architecture](architecture.md)                     |
| Free agents      | Drop a pick and add a free agent in any sport, instantly; daily pool load from ESPN; earned points stay                                                                                                          | [ADR-004](decisions/ADR-004-free-agent-moves.md), `features/free-agents`, "Free-agent flow" in [architecture](architecture.md) |
| Push alerts      | Web Push to a phone or computer for trade offers, replies and reactions, and your team's new points; per-topic switches on /me; test alert; in-app prompt. **Live since 2026-09-30; real-device check pending.** | [ADR-005](decisions/ADR-005-web-push-alerts.md), `features/push`, "Push flow" in [architecture](architecture.md)               |
| Profile          | Name, email preferences, profile photo upload (Storage bucket `avatars`)                                                                                                                                         | `src/app/me`, `features/profile`                                                                                               |
| Navigation       | Tabs: Standings, Feed, Trades (with a Trades or Free agents switch), Sports, Rules; account menu (avatar) in the header                                                                                          | `ui/nav-links.tsx`, `features/auth/components/header-account.tsx`                                                              |

## How work is done here

- `AGENTS.md` is the contract. Read it and `docs/architecture.md` before changing code.
- Bigger features: plan first (product questions answered up front), then build in phases (DB,
  domain and data, feature layer, UI), each reviewed against AGENTS.md before the next starts,
  then a whole-branch code review. Work on a branch; `main` auto-deploys.
- Definition of done: `pnpm check` green, `pnpm test:db` green on a clean local DB, `pnpm build`,
  and UI changes looked at in a browser.
- Shipping: apply migrations to production first (`supabase db push --linked --dry-run`, then
  without `--dry-run`), then push `main`. Code that reads new columns breaks the live site if it
  deploys before its migration. Bump the cache key in `src/data/league.cached.ts` when the shape
  of `LeagueData` changes.
- Commits use conventional prefixes (`feat(trades): ...`, `fix(...)`, `chore(...)`).

## Running it locally

1. `supabase start`. If storage or realtime misbehave (for example "name resolution failed" on
   upload), the containers are stopped even though the CLI says it is running:
   `supabase stop && supabase start`.
2. Point the app at the local stack, not production. `.env.local` targets production, and shell
   variables win over it:

   ```sh
   eval "$(supabase status -o env | grep -E '^(API_URL|PUBLISHABLE_KEY|SECRET_KEY)=')"
   NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY \
   SUPABASE_SECRET_KEY=$SECRET_KEY CRON_SECRET=local-dev-cron-secret-0123456789 \
   NEXT_PUBLIC_SITE_URL=http://localhost:3000 RESEND_API_KEY= \
   pnpm dev
   ```

   `RESEND_API_KEY=` (blank) keeps local runs from sending real email. `CRON_SECRET` must be at
   least 16 characters, and any value works locally: the profile page builds the admin client, and
   that throws without it (the alerts section then shows an error instead of its settings).

   Push alerts need a VAPID key pair, and without one the app says alerts are "not available yet".
   Generate a **dev** pair and keep it in shell variables only. Never put a key in a file, and
   never use the production keys locally:

   ```sh
   KEYS=$(pnpm exec web-push generate-vapid-keys --json)
   export NEXT_PUBLIC_VAPID_PUBLIC_KEY=$(echo "$KEYS" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).publicKey')
   export VAPID_PRIVATE_KEY=$(echo "$KEYS" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).privateKey')
   unset KEYS
   ```

   Then start the app with the step 2 variables in the same shell. `localhost` counts as a secure
   context, so desktop Chrome can register the worker and subscribe, and its alerts go through
   Google's real push service. A fresh `pnpm dev` or `pnpm build` picks the keys up; the public
   key is inlined at build time.

3. Free-agent pool: a fresh local database has only the drafted participants. Load one sport's
   pool (all ESPN teams or top athletes) with the app running:

   ```sh
   curl -X POST -H "Authorization: Bearer <CRON_SECRET>" \
     "http://localhost:3000/api/cron/free-agents?sport=mlb"
   ```

   `CRON_SECRET` must be at least 16 characters and set in the app's environment (`.env.local` or
   a shell variable). The route takes one sport per call and is safe to repeat.

4. Sample scores: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/dev-results.sql`.
5. Test accounts: create users with the local auth admin API
   (`POST http://127.0.0.1:54321/auth/v1/admin/users` with the local secret key,
   `email_confirm: true`), then set `fantasy_teams.owner_id` with psql. `supabase db reset`
   wipes them.
6. Plain `pnpm build` pre-renders against production data (read-only). To build against the
   local stack, pass the same variables as step 2.
7. `pnpm test:e2e` runs Playwright against a built app (`pnpm build`, then `next start`) on the
   local stack, with the step 2 variables. It needs the **full** Chromium build, not the headless
   shell: `pnpm exec playwright install chromium` (never `--only-shell`). The worker spec
   (`e2e/push-worker.spec.ts`) fails loudly without it on purpose.

## Operations

- Admins: `pnpm make-admin <email>` after the person signs up.
- One-off announcement email: a short script per announcement (`scripts/send-*-announcement.ts`,
  run as `pnpm announce:trades`, `announce:free-agents`, `announce:home-screen`) names its
  campaign, subject and renderer, and `scripts/announcement-runner.ts` does the sending: dry run
  by default, `--only you@x` for a test, `--send [--except a@x]`, per-member idempotency keys. It
  skips members who turned off league email. Templates live in
  `src/features/announcements/email/`. Images an email needs are hosted on the site: deploy them
  before sending. The Home Screen email's pictures are drawn in `scripts/email-visuals/` and
  rendered into `public/email/` by `pnpm email:visuals` (its site capture hides every section that
  shows member names or photos, because those files are public).
- First free-agent load: after the free-agents deploy, run the same curl as in "Running it
  locally" against `https://www.cincysports.xyz`, once per sport (11 calls), or wait for the
  09:15 UTC pg_cron job. The pool is empty until then. Check the cached read model size after it
  (see the last follow-up below).
- Push alerts, key rotation: generate a new pair as in ship step 1, which invalidates every device
  subscription. Update `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` together in Vercel and
  redeploy (the public key is inlined at build time). A browser that already allowed alerts
  re-subscribes silently the next time it opens the site, after a 10 second pause. Anyone else has
  to turn alerts on again. Save the private key in a password manager first: Vercel sensitive
  values cannot be read back. A half-rotated pair (one key changed) reads as "not available" and
  logs the variable names. The production pair generated on 2026-09-30 also has an owner-only
  backup on Matt's Mac in `~/.config/cincy-league/` (`vapid-private-key` and `vapid-public-key`,
  mode 600); move it to the password manager and delete the files when convenient.
- Push alerts, checking on it: delivery logs `push delivery finished` under one correlation id,
  with these counts: `alerts` (in), `noDevice`, `duplicates`, `encodeFailed`, `sent`, `removed`,
  `badEndpoint`, `rejected`, `transient`, `pruned` and `storeErrors`. It is a warning instead of
  info when `storeErrors` is above zero. `push delivery ran out of time` (warn) adds the same
  counts. It never logs an endpoint, a key or alert text.
- Digest test: `/api/cron/weekly-digest?only=<email>` with the `CRON_SECRET` bearer.
- A one-off League post in the feed is a row in `messages` with `kind = 'league'`, the active
  `season_id` and an empty payload.

### Ship checklist for push alerts (needs Matt's explicit go-ahead)

Every step here touches production configuration, the production database or the live site, so
none of it happens without a yes from Matt at the time. Run the commands from the repo root.

1. Generate the keys on Matt's machine, and never paste them into chat or a log:

   ```sh
   KEYS=$(pnpm exec web-push generate-vapid-keys --json)
   PUB=$(printf '%s' "$KEYS" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).publicKey')
   PRIV=$(printf '%s' "$KEYS" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).privateKey')
   unset KEYS
   printf '%s' "$PUB" | wc -c    # expect 87
   printf '%s' "$PRIV" | wc -c   # expect 43
   ```

2. Save both keys in the password manager now. A sensitive Vercel value cannot be read back, and
   losing the private key means rotating, which makes everyone turn alerts on again.
3. Add them to Vercel Production. This does not redeploy anything:

   ```sh
   printf '%s' "$PUB" | vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production --no-sensitive
   printf '%s' "$PRIV" | vercel env add VAPID_PRIVATE_KEY production --sensitive
   unset PUB PRIV
   vercel env ls production    # both names are listed
   ```

   Leave `VAPID_SUBJECT` unset: it defaults to `https://www.cincysports.xyz`, and a typo in it
   switches push off. If it is set anyway:
   `printf '%s' 'https://www.cincysports.xyz' | vercel env add VAPID_SUBJECT production --no-sensitive`.
   Never copy the production pair into Preview or Development. (The flags above exist in Vercel
   CLI 53.3.2, checked with `vercel env add --help`; the CLI also reads the value from stdin.)

4. Migrations before code. `supabase db push --linked --dry-run` must list exactly
   `20260929170000`, `20260929170100` and `20260929170200`. Then `supabase db push --linked`. Then
   a read-only check that
   `select jobname, schedule from cron.job where jobname = 'cincy-push-sends-cleanup';` returns
   one row with the schedule `40 9 * * *`.
5. Merge `feat/push-alerts` into `main` and push. The keys must exist before this build, because
   `NEXT_PUBLIC_*` is inlined at build time. If they were added after it started, redeploy without
   the build cache. Optional staging: skip step 3, merge, check the site, then do step 3 and
   redeploy. Deploying without keys is safe: `/me` says alerts are "not available yet" and the
   prompt never shows.
6. After the deploy:
   - `curl -sI https://www.cincysports.xyz/sw.js`. Expect these headers, and no `Set-Cookie`:
     - `Content-Type: application/javascript; charset=utf-8`
     - `Cache-Control: no-cache, no-store, must-revalidate`
     - `Content-Security-Policy: default-src 'self'; script-src 'self'`
     - `X-Content-Type-Options: nosniff`

     They were verified on `next start`, not yet on Vercel.

   - `curl -s https://www.cincysports.xyz/rules | grep -o 'configured\\":[a-z]*'` must print
     `configured\":true`. That proves both keys were present at build time and are a pair. (Checked
     against a local build: with a throwaway pair it prints `configured\":true`, without keys
     `configured\":false`.)
   - The Vercel logs show no line starting `push alerts are off`.
7. Matt's real-device checklist, in this order, before anyone is told:
   1. `curl -sI https://www.cincysports.xyz/sw.js` headers as in step 6.
   2. iPhone Safari tab: the "add to Home Screen" hint shows on `/` and on `/me`.
   3. Open the site from an in-app browser (Facebook or Instagram): the hint says to open it in
      Safari.
   4. Add to Home Screen, open the app from the Home Screen and sign in again (it has a separate
      login from Safari).
   5. Turn on alerts (the permission sheet appears); `/me` shows alerts on.
   6. Send a test alert, lock the phone, and check it arrives. Tap it with the app closed, then
      send another and tap it with the app open. Both should land on `/me`.
   7. A trade offer from a second account: the alert arrives and opens the trade.
   8. A sync that gives points: exactly one score alert for your team.
   9. A reply and a reaction from a second account, each alerting once.
   10. Leave the app idle for an hour, open it in airplane mode, then turn the network back on:
       alerts must still be on (this is the regression check for the offline session case).
   11. iOS Settings > Notifications off for the app: `/me` shows blocked. Turn it back on.
   12. Sign out, then trigger an alert: nothing arrives and the device row is gone.
   13. On a preview at a stable branch URL with its own valid Preview-scoped key pair A, turn
       alerts on. Set a new valid pair B for that branch and redeploy. Reopen it: `/me` still says
       On and a test alert arrives. WebKit re-subscribing without a tap is unverified. (A wrong or
       mismatched public key does not exercise this: push then reads as "not available" and the
       device check never runs. A preview is also another origin, with its own worker,
       subscription and localStorage, and it may share the production database.)
   14. Android Chrome: prompt, turn on, test alert, then a score alert after a sync.
   15. Desktop Chrome: turn on, test, sign out, sign in as another account. The old subscription
       is dropped and the prompt returns.
   16. Desktop Safari: turn on and test.
8. Rollout is everyone at once, right after Matt has tested his own iPhone the same hour. There is
   no owner-only gate. The Home Screen email copy and a launch announcement come afterwards (see
   follow-ups).
9. Rollback: remove the two Vercel variables and redeploy, and the site reads "not available yet"
   again. The migrations are additive and can stay. Reverting the code is also safe.

## Known limits and follow-ups

- Trades: offers voided because a player moved in another trade get no email. A team whose offer
  was accepted cannot be deleted on its own mid-season (by design, see ADR-003). The concurrent
  accept path is designed for (lock order, typed `busy` error) but not load tested.
- Free agents:
  - Pages read a 10-minute cached model, so a sport that just locked can show Add buttons until
    the cache refreshes. The move itself is refused correctly.
  - Tennis and golf pools only grow over the season (the load is insert-only). Expect about
    120-150 athletes by season end.
  - UT Rio Grande Valley (ESPN id 292) is knowingly missing from the college football pool
    because ESPN's site teams list omits it.
  - Most WTA free agents have no headshot in ESPN's data, so they show initials.
  - Moves have no cap by decision, so streaming is possible (ADR-004).
  - Offers voided by a move get no email.
  - The concurrent-listing guard in `make_free_agent_move` is not covered by pgTAP because it
    needs two sessions.
  - `LeagueData.results` grows to about 1,500-2,500 rows once the pool is loaded. Measure the
    cached read model size after the first production load. The data cache has a documented
    per-item limit, and the failure mode is uncached reads (slower pages), not an outage.
- Push alerts (full reasoning in [ADR-005](decisions/ADR-005-web-push-alerts.md)):
  - How the prompt behaves: the in-app "Get alerts on this device?" card shows only to signed-in
    members who own a team, only on `/`, `/feed`, `/trades` and `/trades/*`. The first "Not now"
    hides it for 14 days and the second for good, remembered per member per browser. A device whose
    keys cannot encrypt (`push_invalid_subscription`) is removed like a 404 or 410.
  - A member who is offline with an expired token sees no account control in the header (the
    session state stays "loading") instead of a wrong "Sign in". This is intended: push drops a
    device on "signed out", so a session that could not be refreshed is never read as one.
  - In the sync cron, the 20 second delivery and 3 second tail share the route's 60 seconds with
    the sync itself. If a sync ever takes longer than about 37 seconds, claimed score alerts can
    be lost (delivery is at most once). The sync is unaffected.
  - Delivery is at most once. A key is claimed before the send, so a transient failure is not
    retried, and a run that crashes between saving results and notifying loses its alert.
  - Overlapping sync runs (the 30-minute cron and an admin "Sync now" together) can each send a
    score alert for the same points, because their run ids differ. The feed already duplicates its
    score post in that case; that predates push. Fix later with a per-sport lock or a
    skip-if-running check in `runs.start`.
  - Points recorded outside a regular sync run (the refresh before a free-agent move, free-agent
    runs) are never alerted, by push or in the feed.
  - With no VAPID keys, each reaction still does two small database reads after the response and
    logs one info line.
  - "Also on N other devices" undercounts while this browser's server row is missing. The daily
    refresh, or a test alert that finds no row, heals it.
  - Safari desktop caps script-writable storage at 7 days (ITP), so the device marker can vanish.
    A member who is still signed in then has the subscription dropped as "no marker" and is asked
    again. A sturdier fix is a "whose is this endpoint" action instead of dropping.
  - Turning notifications off in browser settings cleans up the browser at once, but the server
    row goes on the next 404 or 410 from the push service (the marker stores no endpoint). Signing
    out deletes it immediately.
  - Reply and reaction alerts open `/feed`, not the message. Firefox's `pushsubscriptionchange` is
    not handled; the daily refresh covers it.
  - A static route's server graph still lists the `web-push` chunk, because Next registers every
    Server Action for every route. It is never evaluated there (measured with a sentinel), and the
    client bundle has none of it.
  - `--ring` (the brand color) gives about 1.4:1 focus-ring contrast on the dark canvas across the
    whole app. The push controls use a lighter ring. Fixing the token is an app-wide follow-up.
  - The prompt card is `max-w-3xl`, narrower than the widest pages. Cosmetic.
  - One shared, code-point-safe text clipper in `src/domain` should serve trades, free agents and
    push. Trades `truncate` slices by UTF-16 units and can split an emoji.
  - Not built: updating the Home Screen email's "push alerts are coming soon" line
    (`PUSH_ALERTS_NOTE` in `features/announcements/email/home-screen-email.tsx`), and a launch
    announcement with the `pnpm announce:*` runner. Both are follow-ups for after launch.
  - A new real push host shows up as a refused host in the logs
    (`push subscription refused: endpoint host not allowed`). Add it to
    `src/domain/push/endpoint.ts` deliberately and tightly, with a test. Chrome's numbered
    `jmt<N>.google.com` hosts are allowed by a pattern; a `google.com` suffix would not be safe.
  - Chromium's `unsubscribe()` finishes upstream asynchronously. In a local check, an unsubscribe
    followed at once by a subscribe with a **different key** gave a subscription the push service
    answered 410 to about one time in four, sometimes for a few seconds and sometimes for good.
    The same key at once, or a 10 second pause first, was always fine. The silent re-subscribe
    after a key rotation (and turning alerts on over a stale-key subscription) now waits 10
    seconds between the two, so the residual risk is negligible. If it ever did hit the bad case,
    the device would show "on" and the first alert would be lost, because delivery removes the row
    on the 410. Registering a subscription the push service has killed for good again only repeats
    the loop, so the recovery is different: a first test alert with no server row gets `not_found`
    and registers the device again; a second gets `push_gone`, which ends the dead subscription
    (`forgetDead`) and offers Turn on again. Turning alerts off and on also works.
  - **Not verified on real phones.** Nothing has been tried on a real iPhone, Android phone,
    Firefox or desktop Safari, so Apple's push service, iOS notification taps (the tap handler is
    covered only by a `node:vm` test) and WebKit's `WindowClient.navigate` are unverified, as are
    the `/sw.js` headers on Vercel.
  - What was verified in desktop Chromium (headed, a normal profile, not incognito: Chrome turns
    the Push API off there) against Google's real push service and the local stack, through the
    app: turn on from the prompt (22 to 33 seconds in fresh Chromium profiles for the first
    subscribe, which the old 15 second limit would have failed) and from `/me`; a test alert, a trade offer
    from a second account, a reply, a reaction, and one score alert after a real sync run, each
    arriving as a notification shown by `public/sw.js` with the right text and link; sign-out
    deleting the device row at once and a later alert not being sent. Only the desktop Chromium
    path was proven that way.
  - The e2e suite uses an in-memory subscription stub for the "on" path (headless Chromium has no
    push service), plus a CDP test of the worker's push handler and a local mock push service that
    decrypts the body. The real-device checklist above closes the rest.
- Profile photos: not yet tried with an iPhone HEIC photo in production (Safari converts to JPEG
  on pick, so it should work).
- `profiles.avatar_url` is writable by its owner through the API (a column grant that predates
  photo uploads), so a member could point it at any URL. It only ever renders as an `<img>`, but
  tightening it (a check or a trigger that allows only our bucket or the Google photo) is cheap.
- e2e coverage is a smoke suite; the trade flows were verified by hand and by service tests.
- README screenshots predate the feed, trades and the new header.
