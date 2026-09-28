# ADR-001: Scoring lives in the domain layer; the database stores facts

Status: accepted

## Context

Points come from a rubric (win points, cumulative playoff milestones, major finishes with caps,
final rank bands) that varies per sport and per season. It could be computed in SQL (views or
triggers), stored as a column, or computed in application code.

## Decision

The database records what happened: wins, ties, rounds reached, major finishes, final ranks, and
the rules table. Points are never stored. Pure TypeScript in `src/domain/scoring` computes points
and breakdowns from facts plus rules, and `src/domain/standings` ranks teams and applies
tiebreakers.

## Consequences

- One place owns the rubric, and it is unit-testable without a database.
- "Why does this team have 16.4?" is answerable from the breakdown the same function produces.
- Rule changes (for example cumulative vs highest-only playoff scoring) are data, not migrations.
- Leaderboards compute on read. With 20 teams and 11 picks each this is cheap, and results are
  cached and revalidated after each sync.
