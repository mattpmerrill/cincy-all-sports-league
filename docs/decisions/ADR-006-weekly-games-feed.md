# ADR-006: The weekly schedule is stored games, refreshed from ESPN, joined to picks on read

Status: accepted

## Context

Members asked to see, week by week, the games their picks play ("my NCAA football, NFL and NHL teams
all play this week"). It is also the precursor to weekly head-to-head matchups between fantasy
teams, so the data has to be shaped per team and per game, not as a one-off page.

- Standings never needed a schedule: scoring uses cumulative facts ([ADR-001](ADR-001-scoring-in-domain-db-stores-facts.md)).
- ESPN has two kinds of game feed. Pro leagues have a league-wide scoreboard per day
  (`scoreboard?dates=YYYYMMDD`), which includes the postseason. College sports have thousands of
  teams and no usable league-wide feed (the directory work already found this); each team has its
  own full-season schedule instead, and that response includes its postseason games.
- The league's week is Monday to Sunday in Eastern time. Games near midnight and across the two
  daylight-saving changes must land on the right day.
- ESPN answered 403 to the sandbox this was built in, so the new feeds were written from ESPN's
  known response shape and their fixtures are hand-built, not recorded.

## Decision

**Store games; join to picks on read.** A `games` table holds each game (home and away side, start
time, status, score, headline) keyed by (sport, ESPN event id). Which fantasy team has a stake in a
game is not stored: `buildWeekSlate` derives it from the current picks at render time. A free-agent
move or a trade therefore changes the Week page the moment the league cache refreshes, with no
backfill, and the games table stays a plain fact table that anyone can read (public read, writes
by `service_role` only, allow and deny tests in pgTAP). Each side keeps the ESPN team id and name
next to the nullable `participants` reference, because most opponents are teams nobody holds.

**Why stored, not fetched on render.** Rendering would put 8 to 15 ESPN calls (a week of
scoreboards per sport) or up to 60 college schedule calls inside every page view. Slow, unbounded
by traffic, and it would make a public page depend on ESPN being up. Stored games make the page one
cached database read, let an ESPN outage show stale scores instead of an error, and give matchups a
history to build on. The cost is a second refresh pipeline and a table.

**Scoreboard for pro, team schedule for college.** Pro sports (NFL, NBA, NHL, MLB, MLS, WNBA) read
the scoreboard, one call per Eastern day, and store every game in the league (about 6,000 a year),
so a newly picked team already has its games. College sports (football, basketball, softball) call
the team schedule only for teams somebody holds, the same cost as the existing records feed. A
game between two held teams comes back twice and is stored once. The cost: a college team picked
today shows its games after the next refresh (the live run, every 30 minutes), not instantly.

**Cadence.** Two pg_cron jobs call `POST /api/cron/games` with the `CRON_SECRET` bearer:

- `range=live` at :10 and :40 every hour. It re-reads yesterday and today (scores, status,
  kickoff changes). It is offset ten minutes from the 30-minute score sync so the two never start
  in the same minute, and the page's "scores refresh every 30 minutes" matches the scoring cadence.
- `range=weeks` daily at 09:25 UTC (after the 09:15 free-agent refresh). It loads this week and
  next, so the page is full before anyone opens it and a moved game follows.

Only sports whose season window touches the refreshed days are asked, so off-season sports cost no
call. Sports run three at a time with each sport's ESPN calls six at a time; one sport failing never
stops another; only changed rows are written, and the games cache tag is dropped only when
something changed.

**ESPN call budget** (per run, worst case with every sport in season; typical runs are lower
because sports are off-season most of the year):

| Run     | Pro sports (per sport)                                         | College (per sport)  | Realistic peak           |
| ------- | -------------------------------------------------------------- | -------------------- | ------------------------ |
| `live`  | 3 scoreboard days (the day before yesterday, yesterday, today) | 1 per held team (20) | about 50 calls, 48 a day |
| `weeks` | 15 scoreboard days (14 days and the day before)                | 1 per held team (20) | about 150 calls, once    |

The extra scoreboard day before the window covers a late game that ESPN may file under the previous
scoreboard day; `dev/smoke.ts games` prints where late games land so this can be tightened to 2 and
14 calls once verified against the live feed.

**One owner for the league week.** `domain/calendar/week.ts` owns Monday-of-a-date, the seven
days, stepping weeks, validating `?week=` (must be a Monday) and the Eastern date of an instant,
all from Eastern wall-clock parts and never a fixed UTC offset. The weekly digest's `weekWindow`
uses it too. `GAME_STATUSES` in `domain/schedule` owns the status list; the database enum and the
ESPN mapping mirror it, and a test fails if the enum and the domain list disagree.

**Page behavior.** `/week` is public. A bad or out-of-season `?week=` and an unknown `?team=` fall
back (nearest season week, all teams) instead of returning 404: they are harmless filters, a stale
bookmark should still land somewhere useful, and clamping the week to the season bounds how many
cache entries the URL can create. Games that two different fantasy teams hold opposite sides of are
marked as showdowns.

**Team sports only in v1.** Golf and tennis are tournaments with a field, not games, and their feed
is ESPN's tournament field data, which cannot be recorded or verified from here. Athletes on the
weekly page are a follow-up.

## Consequences

- A kickoff moved by ESPN is picked up within 30 minutes; a game ESPN deletes outright is not
  removed from the table (only updated or added). Postponed games usually keep their event id and
  move, which is handled. Orphan cleanup can be added if it shows up in practice.
- The fixtures for the new adapter are hand-built. Run `pnpm tsx src/integrations/espn/dev/smoke.ts games`
  against live ESPN before shipping, and replace the fixtures with recorded responses.
- `participants.espn_id` is the join between ESPN team ids and our rows. A team missing from the
  pool is stored by name and linked on a later run once the roster load adds it.
- Games for a college team that a member newly picks are missing until the next live run.
- The Week page and the team page share one cached read per week (`games` tag, five-minute safety
  net), so an extra page costs no extra query.
- Weekly head-to-head matchups can read `games` and the slate directly; nothing in the table is
  specific to the Week page.
