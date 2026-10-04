# ADR-007: Weekly matchups are bragging rights, frozen at a Monday rollover and written by one SQL function

Status: accepted (built on `feat/matchups`, not yet shipped)

## Context

Members wanted a reason to look at the league every week, not only at the season table. The owner's
decisions (Matt, 2026-10-04):

- Every Monday each team gets one opponent. Whoever gains more points over the week wins, and equal
  gains (including 0 to 0) are a tie.
- Opponents are chosen by standings neighbors.
- Bragging rights only. A W-L-T record, with season scoring and the season standings untouched, so
  [ADR-001](ADR-001-scoring-in-domain-db-stores-facts.md) is unchanged.
- Where it shows: a matchup card and list on the Week tab, a Season | Matchups switch on Standings,
  the record on season rows and the team page, a Monday feed post and a Monday digest section.
- Deferred: push alerts for lead changes and wins, a "Rivalry" tag, lead-change feed posts.

Facts that shape the design:

- Scoring is computed in the app from stored facts (ADR-001). Nothing in the database knows a team's
  points, so the database cannot compute a weekly gain by itself.
- Scores arrive by a 30-minute sync (`:00` and `:30`). A game that starts late Sunday night can
  finish after midnight, so "the week" cannot end at Sunday 23:59 without dropping those points.
- The league's week is Monday to Sunday in Eastern time ([ADR-006](ADR-006-weekly-games-feed.md)),
  and pg_cron runs on UTC, so a daily job needs two schedules to cover both halves of the
  daylight-saving year.
- A Monday run can fail (a deploy, an outage) and must not cost a week.

## Decision

**Bragging rights only, and a one-way import rule.** Matchups read season totals and never feed
back. `domain/scoring` and `domain/standings` may not import `domain/matchups`, and
dependency-cruiser enforces it (`scoring-never-reads-matchups`), so the promise cannot erode by
accident. The matchup standings are their own table: wins, then fewer losses, then total weekly
points gained, then season rank, then name. Rank is shared on equal wins, losses and points gained.
A tie is not worth half a win, so 0-0-2 ranks below 1-1-0.

**The week closes at the Monday rollover, with totals frozen in the row.** A `matchups` row holds
`home_start_points` and `away_start_points`, written when the week opens. A live score is the
team's current credited total (the number the Standings page shows) minus its start. The end
totals are written at the next rollover, and one read of the totals closes last week and opens this
one, so no point is lost and none is counted twice. The result (win, loss, tie) is derived by
`scoreMatchup` and never stored, so a corrected result can never leave a stale winner on a week
that is still open. Once a week is final, its frozen end totals are used and later corrections do
not rewrite it. A gain can be negative when a correction lowers a total.

The rollover runs at 6:45 am Eastern: pg_cron `cincy-matchups-edt` (`45 10 * * *` UTC) and
`cincy-matchups-est` (`45 11 * * *` UTC), calling `POST /api/cron/matchups` with the `CRON_SECRET`
bearer. The `:45` minute sits between the `:00` and `:30` score syncs and the `:10` and `:40` games
refreshes, so it never starts in the same minute as one, and it lands before the 8:00 am digest so
the digest can already include the new week. Each job is an hour off for half the year, so the
route decides: `rolloverWindow` does nothing before Monday 06:30 Eastern, and every later day of
the week counts as due so a missed Monday is caught up. The jobs fire daily for that reason.

A third job, `cincy-matchups-retry` (`15 12 * * *` UTC), exists for standard time. In daylight time
two firings are due before the 12:00 UTC digest (10:45 and 11:45 UTC), so one failed pg_net call
still leaves a second. From November to March only one is (11:45 UTC, since 10:45 UTC is 5:45 am and
not yet due), and a single failure would cost that Monday's digest section. 12:15 UTC is 7:15 am
EST, a retry before the 8:00 am digest. In daylight time it is 8:15 am, after the digest, and an
idempotent repeat. 12:15 keeps clear of the `:00` and `:30` score syncs and sits five minutes after
the games refresh at `:10`.

**Alternatives for where the weeks come from.**

- _Compute from `standings_snapshots`._ A snapshot is one row per team per date, written by a sync
  that changed something. It has no time of day, so a boundary at 6:45 am Monday cannot be
  expressed: you would pick Sunday's or Monday's snapshot, and a Sunday-night finish lands in one or
  the other by accident. It would also leave a week's start and end to be found by "latest on or
  before", which moves when a sync happens to run. The row-level freeze gives each matchup its own
  exact start.
- _Close at Sunday midnight._ Rejected for the late-game reason above: points arrive up to a sync
  after the game ends, so the closing read would be taken before the last results exist.
- _Store the result._ Rejected: a derived result cannot go stale. The cost is that every page
  scores the matchups it shows, which is a handful of subtractions.

**Pairing: nearest-first with a 3-week rematch guard, as a search.** `pairByStandings` walks the
standings from the top. The top unpaired team plays the nearest team below it that it has not met
in the last `REMATCH_WEEKS` (3) weeks. A plain greedy walk of that rule strands the bottom of the
table. Re-running the test's simulation harness (20 teams, 30 weeks, eight seeds, three levels of
table movement) with the greedy walk, 5.9 to 9.3 percent of pairings were rematches (7.4 percent
pooled), roughly half of them the same opponent two weeks running, and every one was at standings
position 17 or lower, because the last teams are left with whoever remains. So the function runs a
depth-first search that tries each team's opponents nearest-first and backs up when a later team
has no fresh opponent, and returns the first rematch-free slate. The same harness gave no rematch
in any week, an average rank gap of about 2 (2.0 to 2.3) and a largest gap of 5 or 6, against 4 for
greedy. A 20-team week needs at most 66 search nodes (54 with a frozen table). The search is capped
at `MAX_SEARCH_NODES` (20,000). When no rematch-free slate exists (two teams who just met, or four
who have all met), or the cap is hit, it falls back to the greedy walk, which takes the nearest team
even if it is a recent opponent, so everyone still plays. The result depends on nothing but the
ranking and the set of recent pairs. The test pins zero rematches and a gap ceiling of 8; the greedy
figures above were measured once for this ADR and are not pinned by a test.

An odd field leaves one team without a matchup, a bye, which is the team the walk reaches last
with nobody below it. There is no bye history, so the same team can get consecutive byes.

**One writer, in SQL.** `roll_matchup_week(season, week_start, finals, pairings)` is the only way a
row changes. It is `security definer`, executable only by `service_role`, and the table has RLS with
a public read policy and no write policy or grant for anyone else, so a direct write from a browser
is denied twice. The app computes the totals and the pairings (scoring lives in the app) and hands
them in. The function:

- takes a row lock on the season (`for no key update`) so two overlapping rollovers serialize, and
  the second sees the first's committed rows and changes nothing;
- is idempotent per week: when the week already has rows it returns `rolled: false` and touches
  nothing, not even finalizing, because finalizing belongs to the call that opens the next week with
  totals from the same moment;
- finalizes every open row of an earlier week, not only the previous one, so a missed Monday closes
  at the first totals available after it, and fails with `missing_final` rather than leave half a
  result;
- treats an empty pairing list as close-only, finalizing and opening nothing;
- refuses a week earlier than one the season already has (`week_out_of_order`), so open rows never
  appear behind a running week;
- validates its JSON before any cast and raises a stable token (`invalid_week_start`,
  `season_not_found`, `week_out_of_order`, `invalid_pairings`, `duplicate_team`, `invalid_finals`,
  `missing_final`), which the repository maps to a typed `Result`. Anything else is thrown and
  logged.

A matchup row carries composite foreign keys on `(team, season)`, so a team cannot be paired with a
team of another season, and `matchups_result_all_or_nothing` makes a half-closed row impossible.
`NaN` is rejected by check constraints because it would silently poison every comparison.

**Catch-up and no partial first week.** A season with no matchups waits for a Monday
(`waiting_for_monday`): the first week opens only on a Monday, with everyone starting at the same
point in the week, never part-way through one. Once any matchup exists, a later day may catch up. A
catch-up run opens a week whose label is the calendar week but whose start totals were frozen on the
catch-up day, so the prior week absorbs the extra days of scoring. Between Monday 00:00 and the
rollover, and after a missed Monday, `displayWeek` keeps last week's matchups on screen, labelled
as still counting, instead of showing "nothing this week". Consequence for shipping: the migration
and the deploy must both be live before the last firing on the Monday you want week one to open.
That is the 12:15 UTC retry: 8:15 am Eastern in daylight time (until 2026-11-01) and 7:15 am
Eastern in standard time (2026-11-02 to 2027-03-08). Aim for before 6:45 am, because the
daylight-time retry lands after the 8:00 am digest, which would then go out without the section. A
merge after the last firing means week one opens the following Monday.

**Season end.** The Monday after the season's last week is close-only, and so is any later week, so
a run of failed jobs still closes the last week. The service skips the call when nothing is open
(`nothing_open`). The active season must be flipped only after that close-only run: the rollover
works on the active season, so flipping first leaves the old season's last week open for good.

**The feed post is at most once.** The Monday post is written only by the run whose rpc reported
`rolled: true`, and only after the rpc committed. A repeat sees `rolled: false` and writes nothing,
so the post can never be duplicated. The price is that a crash between the commit and the write
loses that week's post, and no later run recovers it, by design: a "post if missing" check would
need its own state, for a courtesy message. A failed write is logged and never fails or undoes the
rollover. The 500-character message body cannot hold ten results and ten pairings with real team
names, so the body is a one-line summary that lists as many as fit and says how many were left out,
and the full lists live in a `matchups_week` payload (validated like the other League payloads),
which the feed card renders. The payload carries the new week's Monday and the results of the week
before it. The post and the digest both word a result and a pairing through `resultSentence`
and `pairingSentence` in `domain/matchups` (which use `gainTexts` to decide how many decimals show
a close finish), so the neutral wording has one owner.

**The digest section.** The Monday digest reads the season's matchups once per run
(`domain/digest/build-matchups-section.ts`). Its results are those of the latest earlier week that
is final and was finalized on or after this Monday (Eastern date), headed "Last week's matchups"
when that is the previous Monday's week and "Latest matchup results" otherwise, so a fully missed
week still shows and a stale week (the Monday after a season ends) does not. The pairings are this
week's live matchups. The section is capped so the recipient's own result and pairing and their
record do not sit under twenty lines on a phone: up to 3 other results and 3 other pairings with a
team, 4 and 4 without one, and a "See all {n} matchups" link when anything was cut. When the
rollover has not run by digest time (an earlier week is still live and this week has no rows), the
section says the matchups are still being settled and prints no scores. A failed matchups read
never costs the email: the digest goes out without the section, and `DigestReport.matchupsSection`
reports `included`, `none` or `read_failed`, so the cron response shows a failed read.

**Reading and caching.** The pages read two caches. The matchups cache (`matchups` tag, one-hour
expiry as a safety net) holds the season's rows, about ten a week. Live scores come from the league
cache, which has its own tag and 10-minute expiry, so a score sync never needs to drop the matchups
cache. The rollover drops the matchups cache after any successful rpc and the league cache only on
the run that rolled, so the daily repeats do not churn it, and pages never show gains computed from
totals older than the ones just frozen. `LeagueData` is unchanged, so the league cache key stays
`v4`. Matchup reads on the Week, Standings and team pages are wrapped (`safe-reads`): a failure is
logged and the section is left out, never the page. The Week page streams the matchups section
behind Suspense so the games never wait on it.

**Two-team games filter.** A matchup card links to the Week games list for both teams
(`?team=a&vs=b#games`). `vs` means nothing without `team` or when it repeats it, and a bad value is
ignored like the other filters.

## Consequences

- Nothing is stored that scoring can contradict. A scoring correction changes a live week's numbers
  at once and a final week's not at all.
- The rollover is a single place to reason about, and its failures are typed. pg_net ignores the HTTP
  status, so the log line (`matchups rollover refused`, at error unless the code is
  `week_out_of_order` or `season_not_found`) is the only alarm.
- Pairing is deterministic for a ranking and a history, so a rerun after a crash builds the same
  slate.
- Deleting a fantasy team deletes its matchups (cascade), which removes a result from its opponent's
  record too.
- Adding a third write path to `matchups` needs a new ADR: the all-or-nothing and idempotency
  guarantees hold only because there is one writer.

## Known limits

- The record shown on a past week's view is season-to-date, not "as of" that week.
- The feed card says "Last week's results" because the payload carries only the new week's date.
- An odd number of teams gives one team a bye, and there is no bye history.
- The daily non-Monday firings (three a day) do a full league load and an idempotent rpc (about 20 ms locally) to
  find out nothing is due. That is accepted for the catch-up guarantee.
- A lost feed post cannot be recovered (see above).
- Not verified: real phones; real mail clients (Gmail, Outlook, Apple Mail); keyboard and
  screen-reader passes; the two-team games filter in a browser (the local database has no games); a
  forced matchups read failure in a browser; and the real pg_cron jobs firing against the app.
