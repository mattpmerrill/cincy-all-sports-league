# Cincy's All-Sports League

A mobile-first web app for a family fantasy league: 20 teams, each with one pick in 11 sports.
Members sign in, follow a live leaderboard, and watch their scores update automatically from
ESPN's public data. It replaced a hand-typed spreadsheet.

<!-- Screenshots: add leaderboard, team page and sport page images here -->

> Screenshots coming soon.

## Features

- Live leaderboard with shared ranks for ties, movement arrows and per-sport breakdowns
- Team pages with an explanation of every point ("4 wins x 4.1 = 16.4")
- Sport pages ranking all 20 picks
- Sign in with Google or email; claim a team, approved by an admin
- Scores sync from ESPN on a schedule; admins can correct and lock any result
- Public read access; sign-in only for claiming a team and administration

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

| Name                                   | Scope       | Purpose                                            |
| -------------------------------------- | ----------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | public      | Supabase project URL                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public      | Supabase publishable (anon-level) key; RLS applies |
| `SUPABASE_SECRET_KEY`                  | server only | Secret key for the sync job; bypasses RLS          |
| `CRON_SECRET`                          | server only | Shared secret guarding the sync route              |

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

## Scripts

`pnpm dev`, `pnpm build`, `pnpm check` (lint, format, types, import graph, unit tests),
`pnpm test:e2e`. Contributor rules are in [AGENTS.md](AGENTS.md).
