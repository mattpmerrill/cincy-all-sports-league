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

| Layer          | May import                          | Notes                                                         |
| -------------- | ----------------------------------- | ------------------------------------------------------------- |
| `app`          | features, ui, domain, lib           | Routes only. Never touches `data` or `integrations` directly. |
| `features`     | data, integrations, ui, domain, lib | Never another feature.                                        |
| `data`         | domain, lib                         | The only place queries are built. Maps rows to domain types.  |
| `integrations` | domain, lib                         | One adapter per vendor. Only features import them.            |
| `ui`           | domain, lib                         | Props in, markup out.                                         |
| `domain`       | domain only                         | No React, Next, Supabase or Node.                             |
| `lib`          | lib only                            | Generic plumbing with no business meaning.                    |

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
     if anything changed:
       standings_snapshots upsert for today (scoreParticipant -> scoreFantasyTeam -> rankStandings)
       revalidateLeague() ......... drops the cached public read model
```

The admin "Sync now" button runs the same service for one sport. Admin overrides are locked rows that sync never overwrites
([ADR-002](decisions/ADR-002-espn-public-api-with-admin-overrides.md)).

## Conventions

- Expected failures return `Result<T, AppError>` with a stable `code`; unexpected ones throw and
  are logged with a correlation id.
- Environment is parsed once in `lib/env.ts` (public) and `lib/env.server.ts` (secrets, guarded
  by `server-only`).
- Styling uses only the tokens in `app/globals.css`.
