# AGENTS.md

The contract for anyone (person or coding agent) changing this repo. It is self-contained. When a
rule here conflicts with a habit, the rule wins. Vocabulary: **MUST** / **MUST NOT** are
non-negotiable; **SHOULD** needs a written reason to skip.

## Before you write code

- Read [docs/architecture.md](docs/architecture.md) and the [ADRs](docs/decisions/).
- This is Next.js 16, which differs from older versions. Check `node_modules/next/dist/docs/`
  before using a Next API.
- Match the surrounding code. Put new code where it belongs; do not restructure to make a change
  fit.
- Do not change the framework, package manager, validation library or test framework as a side
  effect. That needs an ADR.

## Non-negotiables

- **Layers.** `app -> features -> data -> domain -> lib`, plus `ui` and `integrations`. ESLint
  enforces the direction and dependency-cruiser blocks cycles. Do not disable a rule to make code
  pass; move the code.
- **Handler, service, repository.** Every request that reaches data goes
  `route or action -> service -> repository -> database`. The handler does transport and auth, the
  service is the use case, the repository is the only place a query is built.
- **No business logic in UI.** Not in `page.tsx`, `layout.tsx`, `route.ts` or components. Logic
  lives in `domain` (pure rules) or a feature service.
- **One owner per concept.** One module owns a concept's type, values and rules; everything else
  imports it. Sports live in `domain/sports/sports.ts`. Do not re-declare a union, a literal array
  or a "narrowed copy".
- **Zod at every trust boundary.** Forms, params, request bodies, env vars and external (ESPN)
  responses are validated at runtime. Types are not validation.
- **RLS is authoritative.** Every exposed table has policies. An access change ships an allow test
  **and** a deny test. Re-check auth in every Server Action and Route Handler; the proxy is not the
  authorization boundary.
- **Types.** `strict` on, no `any` (use `unknown` and narrow), no non-null `!` except after an
  invariant check. Use discriminated unions for state. Do not hand-edit generated DB types;
  regenerate them.
- **Errors are values.** Expected failures return a typed `Result` with a stable `code`.
  Unexpected ones throw and are logged with a correlation id. Never swallow an error or turn every
  error into `null`. Never show users a stack trace, SQL or a provider payload.
- **Secrets stay server-side.** `SUPABASE_SECRET_KEY`, `CRON_SECRET` and `VAPID_PRIVATE_KEY` are read only through
  `lib/env.server.ts` and never imported into client code. `NEXT_PUBLIC_` means public. Never
  commit `.env*` (except `.env.example`) and never log secrets or personal data.
- **Tokens-only styling.** Colors, radii, shadows and z-indexes come from the design tokens in
  `src/app/globals.css`. No hex values or raw palette classes in components (lint refuses them).
- **Accessibility.** WCAG 2.2 AA: semantic HTML, keyboard and focus, visible focus rings, contrast
  from the tokens, honor `prefers-reduced-motion`. Every screen handles loading, empty and error.
- **External calls.** Timeout every one, retry only idempotent transient operations with bounded
  backoff, make writes idempotent.

## Project: Cincy's All-Sports League

**Purpose.** A mobile-first web app for a 20-team, 11-sport family fantasy league. Members sign in,
see a live leaderboard and their team, and scores update automatically from ESPN's public data.
It doubles as a public portfolio project, so structure and tests should be exemplary.

**File map**

| Path               | What it holds                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `src/app`          | Routes only                                                                                                       |
| `src/features/*`   | Vertical slices: standings, fantasy-teams, sports, auth, claims, results-admin, sync, free-agents, push, matchups |
| `src/domain`       | Pure rules: `scoring`, `standings`, `sports`, `push`, `matchups`                                                  |
| `src/data`         | Repositories and row-to-domain mappers                                                                            |
| `src/integrations` | One adapter per vendor: `espn`, `resend`, `webpush`                                                               |
| `src/lib`          | env, Supabase clients, logger, `Result`                                                                           |
| `src/ui`           | shadcn/ui primitives and design-system components                                                                 |
| `supabase/`        | Migrations, pgTAP tests, seed                                                                                     |
| `docs/`            | Architecture and ADRs                                                                                             |

**Vocabulary.** Use these words in code, UI and docs.

- **Fantasy team**: one of the 20 entries in the league, owned by a member.
- **Pick**: a fantasy team's one choice in a sport.
- **Participant**: the real team or athlete that a pick points at.
- **Free agent**: a participant no team holds that a team can pick up in place of its current pick.
- **Move**: one atomic drop-and-add in a sport.
- **Result**: a recorded fact about a participant (wins, a round reached, a finish, a rank).
- **Scoring rule**: how a kind of result converts to points for a sport in a season.
- **Season**: one league year (for example 2026-27) with its own rules and playoff scoring mode.
- **Alert**: a push notification or email the league sends a member about an event.
- **Matchup**: one week's head-to-head between two fantasy teams, won by more points gained that week. Bragging rights only.

**Commands** (run with pnpm)

| Command          | What it does                                                 |
| ---------------- | ------------------------------------------------------------ |
| `pnpm dev`       | Dev server                                                   |
| `pnpm build`     | Production build                                             |
| `pnpm lint`      | ESLint, including layer boundaries and token rules           |
| `pnpm typecheck` | Generates Next route types, then `tsc --noEmit`              |
| `pnpm test`      | Vitest (unit)                                                |
| `pnpm test:e2e`  | Playwright smoke suite                                       |
| `pnpm format`    | Prettier                                                     |
| `pnpm check`     | lint + format check + typecheck + dependency-cruiser + tests |

**Testing philosophy.** Test what can break in ways that matter: domain logic (every scoring rule
kind, ties, tiebreakers), adapters and mappers (against recorded fixtures), and access rules (RLS
allow and deny). Do not write trivial tests that restate the code. A bug fix ships a regression
test that failed before the fix.

**Comment philosophy.** Explain why, not what. If a comment restates the next line, delete it.
Name the constraint, the trade-off or the surprise.

**Definition of Done.** `pnpm check` is green after your last edit, `pnpm build` passes,
migrations and generated types are current, required tests exist, no secret is exposed. Say what
you ran and what you could not run, and say when a UI change was not looked at in a browser.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
