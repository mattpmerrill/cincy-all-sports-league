-- Commissioner rule changes for 2026-27: playoff points no longer stack, MLS scores its 2027
-- "sprint season" (14 games, Feb to May), and a sport can end before the season does.
-- The UPDATEs are idempotent and target rows by natural key, so they are safe on the live DB.

alter table public.season_sports
  add column if not exists ends_on date;

-- Nullable: most sports run to seasons.ends_on. When set, sync stops and the sport shows Final
-- after this date, so games outside a truncated season (MLS after the sprint) never count.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'season_sports_ends_after_starts' and conrelid = 'public.season_sports'::regclass
  ) then
    alter table public.season_sports
      add constraint season_sports_ends_after_starts check (ends_on is null or ends_on > starts_on);
  end if;
end $$;

update public.seasons
set playoff_scoring_mode = 'highest_only'
where name = '2026-27';

update public.season_sports ss
set ends_on = date '2027-05-31'
from public.seasons se, public.sports sp
where ss.season_id = se.id and ss.sport_id = sp.id
  and se.name = '2026-27' and sp.code = 'mls';

-- 3.6 per win; a draw is one-third of a win.
update public.scoring_rules r
set points = case r.code when 'win' then 3.6 else 1.2 end
from public.seasons se, public.sports sp
where r.season_id = se.id and r.sport_id = sp.id
  and se.name = '2026-27' and sp.code = 'mls' and r.code in ('win', 'tie');
