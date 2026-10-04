# Status and handoff

Where the project stands and how to pick it up. Update this at the end of each working session.

**As of 2026-10-04.** Everything under "Shipped" and "What is live" is live on
https://www.cincysports.xyz, `main` is clean and deployed (`9d0b5c0`), and production has every
migration that `main` has applied (42, checked on 2026-10-04). The one thing outside `main` is the
branch `feat/matchups`: weekly head-to-head matchups
([issue #1](https://github.com/mattpmerrill/cincy-all-sports-league/issues/1)), built and reviewed
phase by phase, not merged and not pushed. Nothing from it is in production. There are no other side
branches, worktrees or open pull requests.

## On a branch: weekly matchups (2026-10-04, not shipped)

Branch `feat/matchups`, built on this machine. No migration has been applied to production, the
branch is not merged or pushed, and its three pg_cron jobs (`cincy-matchups-edt`,
`cincy-matchups-est` and `cincy-matchups-retry`) do not exist in production yet.

- **What it is.** Every Monday each fantasy team gets one opponent, chosen by standings neighbors
  (no repeat inside 3 weeks when it can be avoided). Whoever gains more points over the week wins;
  equal gains, 0 to 0 included, are a tie. Bragging rights only: a W-L-T record, with season scoring
  and standings untouched ([ADR-001](decisions/ADR-001-scoring-in-domain-db-stores-facts.md) is
  unchanged). It shows as a matchup card and list on the Week tab, a Season | Matchups switch on
  Standings (`/?view=matchups`), the record on season rows and the team page, a Monday feed post,
  and a Monday digest section.
- **Where to start reading.** [ADR-007](decisions/ADR-007-weekly-matchups.md) for the decisions and
  "Matchup flow" in [architecture](architecture.md) for the two flows. Code: `domain/matchups`
  (pairing, scoring, the table, rollover rules), `features/matchups` (rollover service, read
  models, components), `src/app/api/cron/matchups/route.ts`, `data/matchups.repository.ts`, and the
  four migrations `20261005120000` to `20261005120300` (table, `roll_matchup_week`, RLS, the
  pg_cron jobs). The digest section is `domain/digest/build-matchups-section.ts`.
- **Deferred by decision.** Push alerts for lead changes and wins, a "Rivalry" tag, and lead-change
  feed posts.
- **Verified.**
  - pgTAP on a freshly reset local stack: `supabase/tests/11_matchups.test.sql` (100 assertions:
    constraints, public read, deny tests for every client write and for a client calling the
    function, every `roll_matchup_week` path and error token, the cascade and all three cron jobs)
    passes, and so does the whole suite (11 files, 728 tests; `pnpm test:db`, run 2026-10-04).
  - Vitest: 133 files and 1581 tests passing (`pnpm check`, run 2026-10-04). The pairing search is
    covered by a 30-week, 20-team simulation (zero rematches).
  - Two e2e smoke tests (the Week matchups region and the Standings switch) ran during the build.
    They are written to pass on an empty database, so they prove the pages render and not that
    matchups display. They were not re-run for this update, so no count is given.
  - The UI was looked at in a real browser on the local stack, by the builder and independently by
    the reviewer (Playwright at 320, 390 and 1280 px, signed in and signed out, with seeded weeks).
  - The digest was rendered locally to HTML and text with a stub sender, and the screenshots were
    looked at in Chromium.
  - Opus reviewer runs during the build.
- **Not verified.**
  - The real pg_cron jobs have not fired against the app, and nothing has run against production
    data.
  - Real phones, and real mail clients (Gmail, Outlook, Apple Mail) for the digest section.
  - Keyboard and screen-reader passes.
  - The two-team games filter (`?team=a&vs=b`) in a browser: it is covered by unit tests only,
    because the local database has no games.
  - A forced matchups read failure in a browser. The "section left out" behavior is covered by
    unit tests.

### Ship checklist for weekly matchups (needs Matt's explicit go-ahead)

Every step touches production (the database, the live site or its schedule), so each needs a yes
from Matt at the time. Run the commands from the repo root. Timing matters: week one opens on the first firing of the rollover that is due on a Monday, and the
first week never opens part-way through a week. The migration (which creates the jobs) and the
deploy must both be live before the last firing on the Monday you want it to open, or week one waits
until the following Monday. The Monday firings are 10:45, 11:45 and 12:15 UTC, and the route counts
a firing as due from 06:30 Eastern. So the last firing that can open week one is 12:15 UTC, which
is **8:15 am Eastern while daylight time lasts (through Monday 2026-10-26; the clocks change on
2026-11-01) and 7:15 am Eastern in standard time (Mondays 2026-11-02 to 2027-03-08)**. Aim for
before 6:45 am Eastern anyway: the daylight-time 12:15 firing lands after the 8:00 am digest, so the
digest would go out without the section that day, and a deploy still building at the deadline has
no margin. The next Monday is 2026-10-05.

1. Migrations before code. `supabase db push --linked --dry-run` must list exactly
   `20261005120000`, `20261005120100`, `20261005120200` and `20261005120300`. Then
   `supabase db push --linked`. The three jobs reuse the `cron_secret` vault secret the other jobs
   already use.
2. Read-only check that the jobs exist:
   `select jobname, schedule from cron.job where jobname in ('cincy-matchups-edt', 'cincy-matchups-est', 'cincy-matchups-retry');`
   returns three rows: `45 10 * * *`, `45 11 * * *` and `15 12 * * *`.
3. Merge `feat/matchups` into `main` (it auto-deploys). `LeagueData` did not change, so there is no
   league cache key bump; the new matchups cache has its own key (`v1`). Until the first rollover,
   the Week tab and the Standings switch show "Matchups start Monday".
4. After the first rollover (any time after 6:45 am Eastern on that Monday):
   - `select week_start, count(*) from matchups group by 1;` shows one week with 10 rows.
   - The feed has the "Weekly matchups" post, and the Monday digest (8:00 am) shows the section.
   - The Vercel logs have `matchups rollover finished` with `action: "pair"` and `post: "written"`,
     and no `matchups rollover refused`. pg_net ignores the HTTP status, so a refusal is only
     visible in the log.
5. Season end, when it comes: the Monday after the season's last week closes the last matchups
   (close-only). Flip the active season to the next one only after that run, or the old season's
   last week stays open.
6. Rollback: matchups are additive. To stop the rollover, unschedule the three jobs
   (`select cron.unschedule('cincy-matchups-edt'), cron.unschedule('cincy-matchups-est'), cron.unschedule('cincy-matchups-retry');`); the
   pages keep showing what exists. The migrations can stay.

## Shipped 2026-10-03 and 2026-10-04

- **Records** (PR #2): every pick shows its participant's regular-season record (`W-L`, NFL `W-L-T`
  when there is a tie, NHL `W-L-OTL`, MLS `W-L-D`), or an athlete's ranking ("No. 4 WTA"), on team
  pages, sport pages and the free-agent list. Sync writes `participant_records` from the same ESPN
  fetch as wins (no extra calls); a records failure is logged and never fails a sync. Start at
  `domain/records`, `features/sync/record-plan.ts` and the "Records" section of
  [architecture](architecture.md).
- **Week tab** (PR #2; `/week`, public): the games every team's picks play Monday to Sunday,
  Eastern time, with showdowns (two league teams on opposite sides), a team filter, a "My team"
  shortcut and per-team game counts; plus a "This week" panel on each team page. Games live in
  `games`, refreshed by `/api/cron/games` (`range=live` at :10 and :40, `range=weeks` daily at
  09:25 UTC). Team sports only. See [ADR-006](decisions/ADR-006-weekly-games-feed.md) and "Games
  flow" in [architecture](architecture.md). It is the base for weekly head-to-head matchups.
- **Slide-out menu** (PR #3): the bottom bar is five tabs (Standings, Week, Feed, Trades, Sports).
  A menu that slides in from the right replaces the avatar dropdown and holds My team, Profile and
  settings, Admin (admins only), Free agents, Rules, Sign out, Privacy and Terms. Visitors get
  Join the league and Sign in. No migrations.
- **Product update email** (PR #4): one announcement covering Week, records, showdowns and the
  menu, with a screenshot under each feature (`pnpm announce:product-update`). It has been sent.
- **ESPN images served directly** (`9d0b5c0`, 2026-10-04): `images.unoptimized` is on in
  `next.config.ts`, so logos and headshots load straight from ESPN's CDN. The Vercel Hobby team
  had reached 75% of its image-transformation allowance, which every project on the account
  shares. Matt confirmed on 2026-10-04 that this is resolved.

PR #2 was built in a cloud session that could reach neither ESPN nor a Supabase stack. Its
description lists checks to run on a local stack before merging (`pnpm test:db` with the new
`09_records` and `10_games` pgTAP files, `pnpm db:types` with no diff, the live ESPN smoke for
games and records, a browser look signed out and signed in, `pnpm build` and `pnpm test:e2e`).
Which of them ran before the merge was not recorded here. What production shows on 2026-10-04:
all six migrations applied, `cincy-games-live` and `cincy-games-weeks` active, 146 rows in `games`
refreshed the same day, 329 rows in `participant_records`, and `/week` answering 200.

## State on 2026-10-04

The site rested from 2026-09-30 to 2026-10-03 after the trades, free agents, Home Screen how-to
and push alerts work.

- The local Supabase stack is stopped (`supabase start` brings it back). `.env.local` still points
  at production, so use the local-stack variables from "Running it locally" for anything you run.
- Push alerts: 8 members with 10 devices have alerts on (3 and 3 on day one). Five free-agent
  moves have been made.
- Score syncs: no failed run from 2026-10-01 to 2026-10-04. The only failures in the last week
  were three on 2026-09-30, in one 30-minute run at 08:30 UTC where ESPN answered HTTP 403 for
  three sports at once; the next run was fine. If 403s repeat, ESPN may be blocking Vercel's
  addresses.
- Nothing is scheduled to email members except the Monday digest. These pg_cron jobs run on their
  own: `cincy-score-sync` every 30 minutes, `cincy-games-live` at :10 and :40,
  `cincy-free-agent-refresh` daily at 09:15 UTC, `cincy-games-weeks` daily at 09:25 UTC,
  `cincy-push-sends-cleanup` daily at 09:40 UTC, and the weekly digest at 8am Eastern on Mondays
  (`weekly-digest-edt` at 12:00 UTC and `weekly-digest-est` at 13:00 UTC). On the branch only, not
  in production yet: `cincy-matchups-edt` (10:45 UTC), `cincy-matchups-est` (11:45 UTC) and
  `cincy-matchups-retry` (12:15 UTC), which together fire daily to roll the weekly matchups. The
  first two are 6:45 am Eastern in daylight and standard time respectively, and the retry is 7:15
  am EST (8:15 am EDT) so a failed standard-time call still gets a second chance before the digest.

Read-only health checks (Supabase SQL editor or the MCP `execute_sql`):

```sql
-- Sync health: failures in the last week, by hour.
select date_trunc('day', started_at) d, count(*) filter (where status = 'failed') failed,
       count(*) filter (where status = 'succeeded') ok
from sync_runs where started_at > now() - interval '7 days' group by 1 order by 1 desc;
-- Push adoption: members with at least one device, and devices in total.
select count(distinct user_id) members, count(*) devices from push_subscriptions;
-- Free agent moves so far.
select count(*) from free_agent_moves;
-- Games feed: rows by status and the last refresh.
select status, count(*), max(updated_at) from games group by 1;
```

Then look at the Vercel logs for `push delivery finished` with a non-zero `rejected`, `pruned` or
`storeErrors`, and for `push subscription refused: endpoint host not allowed` (a real push host
missing from the allow-list). Read the feed for replies from anyone who tried alerts on Android,
Firefox or desktop Safari: those are the platforms nobody has checked.

Open items, none urgent:

- Move the push private key backup from `~/.config/cincy-league/` to the password manager, then
  delete the files.
- Check push alerts on an Android phone, Firefox and desktop Safari, and record the result here.
- Agent worktrees left under `.claude/worktrees/` make `pnpm lint` and `pnpm format:check` scan
  their `.next` folders. Remove worktrees after merging, or add `.claude` to the ESLint and
  Prettier ignores.
- The app-wide focus ring contrast and the shared emoji-safe text clipper (both under "Known
  limits").
- Run the PR #2 local checks listed under "Shipped" if they were never run, starting with
  `pnpm test:db` and `pnpm db:types`.
- Every announcement email is sent. Nothing else is queued.
- Ship weekly matchups, or decide not to (checklist above). It is built and reviewed on `feat/matchups`.

## What is live

| Area             | What it does                                                                                                                                                                                                | Start reading                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Leaderboard      | Live standings from ESPN, ties, movement, per-sport bars; nudges visitors to claim a team                                                                                                                   | `src/app/page.tsx`, `features/standings`, `features/claims`                                                                    |
| Scoring and sync | Facts in the DB, points in `domain/scoring`; pg_cron sync every 30 min                                                                                                                                      | [ADR-001](decisions/ADR-001-scoring-in-domain-db-stores-facts.md), `features/sync`                                             |
| Feed             | Trash talk, reactions, replies, realtime, automatic League posts                                                                                                                                            | `features/feed`                                                                                                                |
| Weekly digest    | Monday 8am ET standings email via Resend, one-click unsubscribe                                                                                                                                             | `features/digest`                                                                                                              |
| Trades           | Trading block and direct offers, 24h open bidding, earned points stay, email alerts, badge, confetti                                                                                                        | [ADR-003](decisions/ADR-003-trades.md), `features/trades`, "Trade flow" in [architecture](architecture.md)                     |
| Free agents      | Drop a pick and add a free agent in any sport, instantly; daily pool load from ESPN; earned points stay                                                                                                     | [ADR-004](decisions/ADR-004-free-agent-moves.md), `features/free-agents`, "Free-agent flow" in [architecture](architecture.md) |
| Push alerts      | Web Push to a phone or computer for trade offers, replies and reactions, and your team's new points; per-topic switches on /me; test alert; in-app prompt. **Live since 2026-09-30; checked on an iPhone.** | [ADR-005](decisions/ADR-005-web-push-alerts.md), `features/push`, "Push flow" in [architecture](architecture.md)               |
| Profile          | Name, email preferences, profile photo upload (Storage bucket `avatars`)                                                                                                                                    | `src/app/me`, `features/profile`                                                                                               |
| Records          | Each pick's regular-season record, or an athlete's ranking, on team pages, sport pages and the free-agent list                                                                                              | `domain/records`, `features/sync/record-plan.ts`, "Records" in [architecture](architecture.md)                                 |
| Week             | `/week`: the games every team's picks play Monday to Sunday, showdowns, team filter; a "This week" panel on team pages                                                                                      | [ADR-006](decisions/ADR-006-weekly-games-feed.md), "Games flow" in [architecture](architecture.md)                             |
| Navigation       | Bottom tabs: Standings, Week, Feed, Trades (with a Trades or Free agents switch), Sports; slide-out menu from the right for My team, Profile, Admin, Free agents, Rules and Sign out                        | `ui/nav-links.tsx`, `features/auth/components/header-account.tsx`                                                              |

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
  run as `pnpm announce:trades`, `announce:free-agents`, `announce:home-screen`,
  `announce:push-alerts`, `announce:product-update`) names its
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
  (measured: see the read model bullet under Known limits).
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
- Replies to league email (2026-10-01): app email (digest, trade alerts, announcements) sends a
  Reply-To from `DIGEST_REPLY_TO` (set in Vercel Production and `.env.local` to Matt's Gmail; a
  malformed value drops the header and logs `email Reply-To is off`). Mail sent to
  `league@cincysports.xyz` itself, including replies to Supabase auth emails (which have no
  Reply-To setting), is forwarded to Matt's Gmail by ImprovMX: MX `mx1`/`mx2.improvmx.com` and an
  apex SPF TXT in Vercel DNS, catch-all alias. Resend's sending records on `send.` and
  `resend._domainkey` are separate. Delivery check: the ImprovMX dashboard logs, or its API
  (`/v3/domains/cincysports.xyz/logs`, key `IMPROVMX_API_KEY` in `.env.local`). Its DKIM rows read
  invalid by design: we never send through ImprovMX.
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

Feature ideas that are not limits live in the
[GitHub project](https://github.com/users/mattpmerrill/projects/2) (see [backlog.md](backlog.md)).

- Records and the Week tab:
  - `LeagueData.records` carries every record of the season, free agents included (about 1,450
    small rows, roughly 150 kB as JSON), because the free-agent board scores from the same data.
    Re-check the cached item size with the results bullet below.
  - An athlete ranked outside every `final_rank_band` has no result, so shows no ranking line.
  - Golf and tennis tournaments are not on the Week page (team sports only, ADR-006).
  - A newly picked college team shows its games after the next live refresh (pro leagues store
    every game, so a pro pick shows at once). A game ESPN deletes outright is never removed.
  - Every image is served unoptimized (`images.unoptimized` in `next.config.ts`), so ESPN logos
    and headshots arrive at ESPN's size instead of being resized for the device.
- Weekly matchups (on a branch, not shipped; full reasoning in
  [ADR-007](decisions/ADR-007-weekly-matchups.md)):
  - The record shown on a past week's view is season-to-date, not "as of" that week.
  - The digest section's lists are capped (3 other results and 3 other pairings with a team, 4 and
    4 without), with a "See all {n} matchups" link. If the rollover has not run by digest time, the
    section says the matchups are still being settled and shows no scores. The digest report's
    `matchupsSection` is `included`, `none` or `read_failed`.
  - The feed card says "Last week's results" because the payload carries only the new week's date.
  - An odd number of teams gives one team a bye, and there is no bye history.
  - The daily non-Monday firings do a full league load and an idempotent database call (about
    20 ms locally) to find out nothing is due.
  - The Monday feed post is written after the rollover commits and is never repeated, so a crash
    in between loses that week's post and nothing recreates it.
  - A missed Monday is caught up on a later day. The new week keeps the calendar week's label but
    its start totals are from the catch-up day, so the previous week absorbs the extra days.
  - Deleting a fantasy team deletes its matchups, which removes those results from the opponents'
    records.
  - The checks listed under "Not verified" in the branch section above.
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
  - `LeagueData.results` could grow to about 1,500-2,500 rows once the pool has scores. On
    2026-09-29, with the whole pool loaded, production held 270 result rows (about 103 kB as JSON),
    because only sports in season have scores. Re-check when more sports are in season. The data
    cache has a documented per-item limit, and the failure mode is uncached reads (slower pages),
    not an outage.
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
  - Announced on 2026-09-30 with a feed post and an email to 17 members
    (`pnpm announce:push-alerts`); the Home Screen email now says alerts are live.
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
  - **Real phones.** Matt tested an iPhone by hand on 2026-09-30 and reported that everything
    works; which of the checklist steps he ran was not recorded. The `/sw.js` headers were
    checked on Vercel the same day. Still unverified: Android, Firefox, desktop Safari, and
    WebKit's `WindowClient.navigate` on a notification tap (the tap handler is otherwise covered
    only by a `node:vm` test).
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
- README screenshots predate the feed, trades, the Week tab and the slide-out menu.
