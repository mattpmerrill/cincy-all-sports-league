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

## Scripts

`pnpm dev`, `pnpm build`, `pnpm check` (lint, format, types, import graph, unit tests),
`pnpm test:e2e`. Contributor rules are in [AGENTS.md](AGENTS.md).
