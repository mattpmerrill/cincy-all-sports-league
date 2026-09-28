# ADR-002: ESPN's public API for results, with admin overrides

Status: accepted

## Context

Scores were typed into a spreadsheet by hand. ESPN's public site API exposes standings,
postseason schedules, rankings and logos for every sport in the league. It is unofficial and
undocumented, so shapes can change and some results (a golfer without a ranking, an odd bracket)
may be missing or wrong.

## Decision

- A single adapter in `src/integrations/espn` fetches with a timeout and bounded retry, validates
  every response with Zod, and maps to domain types. ESPN shapes never leave the adapter.
- A scheduled sync writes results with `source = 'espn'`, idempotently, isolating failures per
  sport.
- Admins can enter or correct a result in the app and lock it. Locked rows are never overwritten
  by sync.

## Consequences

- No paid data vendor and no manual typing in the normal case.
- If ESPN changes a shape, validation fails loudly for that sport only, and the admin editor
  covers the gap until the mapper is fixed.
- Mappers are tested against recorded JSON fixtures, not live calls.
