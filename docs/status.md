# Status and handoff

Where the project stands and how to pick it up. Update this at the end of each working session.

**As of 2026-09-29.** Everything below is live on https://www.cincysports.xyz, `main` is clean and
deployed, and production has every migration in `supabase/migrations/` applied.

## What is live

| Area             | What it does                                                                                                            | Start reading                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Leaderboard      | Live standings from ESPN, ties, movement, per-sport bars; nudges visitors to claim a team                               | `src/app/page.tsx`, `features/standings`, `features/claims`                                                                    |
| Scoring and sync | Facts in the DB, points in `domain/scoring`; pg_cron sync every 30 min                                                  | [ADR-001](decisions/ADR-001-scoring-in-domain-db-stores-facts.md), `features/sync`                                             |
| Feed             | Trash talk, reactions, replies, realtime, automatic League posts                                                        | `features/feed`                                                                                                                |
| Weekly digest    | Monday 8am ET standings email via Resend, one-click unsubscribe                                                         | `features/digest`                                                                                                              |
| Trades           | Trading block and direct offers, 24h open bidding, earned points stay, email alerts, badge, confetti                    | [ADR-003](decisions/ADR-003-trades.md), `features/trades`, "Trade flow" in [architecture](architecture.md)                     |
| Free agents      | Drop a pick and add a free agent in any sport, instantly; daily pool load from ESPN; earned points stay                 | [ADR-004](decisions/ADR-004-free-agent-moves.md), `features/free-agents`, "Free-agent flow" in [architecture](architecture.md) |
| Profile          | Name, email preferences, profile photo upload (Storage bucket `avatars`)                                                | `src/app/me`, `features/profile`                                                                                               |
| Navigation       | Tabs: Standings, Feed, Trades (with a Trades or Free agents switch), Sports, Rules; account menu (avatar) in the header | `ui/nav-links.tsx`, `features/auth/components/header-account.tsx`                                                              |

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
   SUPABASE_SECRET_KEY=$SECRET_KEY NEXT_PUBLIC_SITE_URL=http://localhost:3000 RESEND_API_KEY= \
   pnpm dev
   ```

   `RESEND_API_KEY=` (blank) keeps local runs from sending real email.

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
- Digest test: `/api/cron/weekly-digest?only=<email>` with the `CRON_SECRET` bearer.
- A one-off League post in the feed is a row in `messages` with `kind = 'league'`, the active
  `season_id` and an empty payload.

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
- Profile photos: not yet tried with an iPhone HEIC photo in production (Safari converts to JPEG
  on pick, so it should work).
- `profiles.avatar_url` is writable by its owner through the API (a column grant that predates
  photo uploads), so a member could point it at any URL. It only ever renders as an `<img>`, but
  tightening it (a check or a trigger that allows only our bucket or the Google photo) is cheap.
- e2e coverage is a smoke suite; the trade flows were verified by hand and by service tests.
- README screenshots predate the feed, trades and the new header.
