-- LOCAL DEV ONLY. Never run against the hosted project: it writes fake sync runs and snapshots.
-- Not part of `supabase db reset`; load it by hand (see README, "Dev results"):
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/dev-results.sql
-- Facts as of 2026-09-28 from the spreadsheet: NCAAF and NFL wins only. Safe to re-run.

begin;

with wins(team, ncaaf, nfl) as (
  values
    ('Sher Bear', 4, 3),
    ('Coop Doggies', 4, 3),
    ('Papie', 4, 3),
    ('Dirk''s Sporting Goods', 4, 2),
    ('Frosty X Salmon', 4, 2),
    ('Minnesota''s Golden 0-4''s', 3, 3),
    ('Double Play', 4, 1),
    ('Big Ohio Guy', 4, 1),
    ('Philly Flyers', 4, 1),
    ('Big Booty Brooksie', 4, 1),
    ('Sweet Rolls', 3, 2),
    ('MumMums', 3, 2),
    ('JV Jibby', 3, 2),
    ('Dancing Ivory', 4, 0),
    ('Bob Costas & The Sunshine State', 3, 1),
    ('FoolioIglesias', 3, 1),
    ('Deuces Wild', 3, 1),
    ('Brady''s Benchwarmers', 2, 2),
    ('Team Love', 2, 2),
    ('The Phippen Franchise', 3, 0)
),
per_sport as (
  select team, 'ncaaf' as sport, ncaaf as quantity from wins
  union all
  select team, 'nfl', nfl from wins
)
insert into participant_results (season_id, participant_id, scoring_rule_id, quantity, event_label, source)
select ft.season_id, pk.participant_id, r.id, ps.quantity, '', 'espn'
from per_sport ps
join fantasy_teams ft on ft.name = ps.team
join sports s on s.code = ps.sport
join picks pk on pk.fantasy_team_id = ft.id and pk.sport_id = s.id
join scoring_rules r on r.season_id = ft.season_id and r.sport_id = s.id and r.code = 'win'
where ps.quantity > 0
on conflict (season_id, participant_id, scoring_rule_id, event_label)
do update set quantity = excluded.quantity;

-- Two sync runs so "Updated 12 min ago" and the failure path have something to show.
delete from sync_runs where summary ->> 'dev_seed' = 'true';
insert into sync_runs (started_at, finished_at, status, summary) values
  (now() - interval '3 hours 1 minute', now() - interval '3 hours', 'failed',
   '{"dev_seed": "true", "error": "ESPN timeout"}'),
  (now() - interval '12 minutes 20 seconds', now() - interval '12 minutes', 'succeeded',
   '{"dev_seed": "true", "sports": 2}');

-- Yesterday's standings, so the movement arrows have history: pretend every team with an even
-- name length had one fewer NFL win yesterday (3 points less), then rank the result.
delete from standings_snapshots;
with totals as (
  select ft.id as team_id, ft.season_id, ft.name,
         coalesce(sum(pr.quantity * r.points), 0) as total
  from fantasy_teams ft
  left join picks pk on pk.fantasy_team_id = ft.id
  left join participant_results pr on pr.participant_id = pk.participant_id
  left join scoring_rules r on r.id = pr.scoring_rule_id and r.kind = 'per_win'
  group by ft.id, ft.season_id, ft.name
),
yesterday as (
  select *, greatest(0, total - case when length(name) % 2 = 0 then 3 else 0 end) as prev_total
  from totals
)
insert into standings_snapshots (season_id, fantasy_team_id, snapshot_date, total_points, rank)
select season_id, team_id, (now() at time zone 'America/New_York')::date - 1, prev_total, rank() over (order by prev_total desc)
from yesterday;

commit;
