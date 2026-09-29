# Cincy's All-Sports League

A mobile-first web app for a family fantasy league: 20 teams, each with one pick in 11 sports.
Members sign in, follow a live leaderboard, and watch their scores update automatically from
ESPN's public data. It replaced a hand-typed spreadsheet.

<p>
  <img src="docs/screenshots/leaderboard-mobile.png" alt="Leaderboard on a phone" width="260">
  <img src="docs/screenshots/team-mobile.png" alt="Team page on a phone" width="260">
  <img src="docs/screenshots/sport-mobile.png" alt="Sport page on a phone" width="260">
</p>

![Leaderboard on desktop](docs/screenshots/leaderboard-desktop.png)

More: [team (desktop)](docs/screenshots/team-desktop.png),
[rules](docs/screenshots/rules-mobile.png), [sign in](docs/screenshots/login-mobile.png),
[profile](docs/screenshots/me-mobile.png).

## Features

- Live leaderboard with shared ranks for ties, movement arrows and per-sport breakdowns
- Team pages with an explanation of every point ("4 wins x 4.1 = 16.4")
- Sport pages ranking all 20 picks
- Sign in with Google or email; claim a team, approved by an admin
- Scores sync from ESPN on a schedule; admins can correct and lock any result
- A live league feed: trash talk, reactions, replies and automatic score posts
- Trades: a trading block and direct offers with 24 hours of open bidding; points a player already
  earned stay with the team that earned them
- Free agents: swap your pick in any sport for anyone no team holds, instantly, and keep the points
  it already earned
- A weekly standings email and trade alerts, each with its own opt-out
- Profile photos, uploaded and cropped in the browser
- Public read access; sign-in only for claiming a team, posting, trading and administration

Current state, local setup and open follow-ups: [docs/status.md](docs/status.md).

## Tech stack

Next.js 16 (App Router, Server Components, Server Actions), TypeScript (strict), Tailwind CSS v4,
shadcn/ui (Radix), Supabase (Postgres, Auth, RLS), Zod, Vitest, Playwright, pnpm.

## Architecture

Layers depend in one direction, `app -> features -> data -> domain -> lib`, enforced by ESLint
and dependency-cruiser. Scoring is pure, unit-tested TypeScript in `src/domain`; the database
stores only facts (wins, rounds reached, finishes) and Row Level Security guards every table.
The ESPN adapter validates every response and never leaks vendor types.

See [docs/architecture.md](docs/architecture.md) and the [decision records](docs/decisions/).

## Local setup

Requires Node 22+ and pnpm.

```sh
pnpm install
cp .env.example .env.local   # fill in the values below
pnpm dev
```

Open http://localhost:3000.

### Environment variables

| Name                                   | Scope       | Purpose                                                                                                   |
| -------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | public      | Supabase project URL                                                                                      |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public      | Supabase publishable (anon-level) key; RLS applies                                                        |
| `NEXT_PUBLIC_SITE_URL`                 | public      | Canonical origin for metadata (default `http://localhost:3000`; production `https://www.cincysports.xyz`) |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | public      | Optional. Google Search Console HTML-tag token; renders the verification meta tag when set                |
| `SUPABASE_SECRET_KEY`                  | server only | Secret key for the sync job; bypasses RLS                                                                 |
| `CRON_SECRET`                          | server only | Shared secret guarding the sync and digest routes                                                         |
| `RESEND_API_KEY`                       | server only | Optional locally. Resend key for the weekly digest; unset means sending returns `email_not_configured`    |
| `DIGEST_SIGNING_SECRET`                | server only | 32+ chars. Signs unsubscribe links (rotating it breaks links already sent)                                |
| `DIGEST_FROM`                          | server only | Optional. Sender, default `Cincy's All-Sports League <league@cincysports.xyz>`                            |

## Auth setup

Sign-in is Supabase Auth: email and password, plus Google. Sessions live in cookies and are kept
fresh by `src/proxy.ts`; that proxy is not the authorization boundary, so every Server Action,
route handler and service re-checks who is calling, and RLS has the last word.

**Google provider.** In Google Cloud Console, create an OAuth client (type: Web application) with
the authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. In Supabase,
Authentication > Providers > Google, paste the client ID and secret and enable it. Email sign-in
works without this step.

**Redirect URLs.** In Supabase, Authentication > URL Configuration, set the Site URL to the
production origin and add every origin the app runs on to Redirect URLs (the app sends users back
to `/auth/callback`, so use a wildcard path):

- `https://<production-domain>/**`
- `https://*-<vercel-team-slug>.vercel.app/**` (preview deployments)
- `http://localhost:3000/**` (local dev against a hosted project)

Locally, `supabase/config.toml` already allows `http://127.0.0.1:3000`; browse the dev server at
that address, not `localhost`, so cookies and redirects line up.

**First admin.** Only admins can promote others, so the first one is set from the command line.
Sign in to the app once (this creates the profile), then run this against the project whose keys
are in `.env.local`:

```sh
pnpm make-admin you@example.com
```

The script prints the target project host, finds the auth user by email with the secret key, and
sets `profiles.role = 'admin'`. After that, admins can promote and demote members under
`/admin/members`. The last remaining admin can't be demoted.

**Claiming a team.** After signing in, a member requests an unclaimed team on `/me`. An admin
approves or rejects it under `/admin`; approval sets the team's owner in one database transaction.

## Dev results

A fresh local database has the seeded league but no results, so every team sits at 0.
`supabase/dev-results.sql` loads the 2026-09-28 spreadsheet state (NCAAF and NFL wins), two
`sync_runs` rows and yesterday's standings snapshots, so the leaderboard, "Updated 12 min ago" and
the movement arrows have something to show. It is local-only and never run automatically:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/dev-results.sql
```

Never run it against the hosted project. To run the app against the local stack without touching
`.env.local`, export the values from `supabase status` in your shell before `pnpm dev`
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
`CRON_SECRET`); shell variables win over `.env.local`.

## Caching

Public pages read one league model, cached with Next's data cache under the tag `league` (10
minute safety expiry). Points are computed per request from cached facts, so the cache holds no
derived state. Anything that writes results calls `revalidateLeague()` from `@/lib/league-cache`
(Route Handlers and Server Actions only) and the next visit sees fresh standings.

## Smoke tests

`pnpm test:e2e` runs the Playwright specs in `e2e/`. Set `E2E_BASE_URL` to test a running
deployment (the league must be seeded); without it the suite builds and serves the app itself.

## Score sync

`src/features/sync` pulls facts from ESPN (through `src/integrations/espn`, behind a vendor-neutral
`ResultsProvider`) and writes them to `participant_results` with `source = 'espn'`.

- **Trigger.** Supabase `pg_cron` + `pg_net` call `POST /api/cron/sync` every 30 minutes
  (migration `20260928121000_schedule_score_sync.sql`). Vercel Hobby's own cron only runs daily.
  The route requires `Authorization: Bearer $CRON_SECRET` (constant-time compare). `GET` works for
  a manual `curl`; `?sport=nfl` (repeatable) syncs just those sports.
- **One call is enough.** A full all-sports sync measured about 2.4 s (about 6.7 s fully
  sequential) against complete past seasons, far inside the route's 60 s `maxDuration`, so cron
  makes a single call and there is no rotation. Sports run four at a time.
- **Windows and isolation.** A sport syncs only between its `season_sports.starts_on` and the
  season's `ends_on`; outside that a single "skipped" note is written per day. One sport failing
  records a failed `sync_runs` row and never stops the others.
- **Rules.** Locked rows are never modified or deleted. Byes count as reaching earlier rounds.
  Majors write one row per event for picked athletes once the event is complete. WTA and FedExCup
  ranks are an in-season projection onto the final-rank band; an admin confirms the true final
  rank by locking it. A fact with no matching rule code fails that sport loudly.
- **After a change** sync upserts today's `standings_snapshots` and calls `revalidateLeague()`.
- **Admin.** `/admin/results` shows sync health and a "Sync now" button per sport; each sport page
  lists the picks' results to add, edit, delete, lock or unlock. Rows added by hand are locked by
  default, otherwise the next sync would overwrite them.

### Cron setup (one time per Supabase project)

The migration contains no secret. In the Supabase SQL editor run once, using the same value as
`CRON_SECRET` in Vercel:

```sql
select vault.create_secret('<the CRON_SECRET value>', 'cron_secret');
```

Until then the job fires and gets a harmless 401. Check runs with
`select * from cron.job_run_details order by start_time desc limit 5;` and the `sync_runs` table.
Locally, test with `curl -X POST -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/sync?sport=nfl"`.

## Scripts

`pnpm dev`, `pnpm build`, `pnpm check` (lint, format, types, import graph, unit tests),
`pnpm test:e2e`. Contributor rules are in [AGENTS.md](AGENTS.md).
