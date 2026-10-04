-- Matchups rollover trigger: Supabase calls the app's matchups cron route daily, on two schedules.
--
--   cincy-matchups-edt  10:45 UTC, which is 6:45 am Eastern in daylight time.
--   cincy-matchups-est  11:45 UTC, which is 6:45 am Eastern in standard time.
--
-- pg_cron runs on UTC and Eastern shifts by an hour twice a year, so two jobs cover both. Each is
-- an hour off 6:45 am Eastern for half the year, so the route itself decides: it does nothing
-- before Monday 6:30 am Eastern, and nothing when the week already has matchups. The first call
-- after 6:30 am on a Monday rolls the week and every other call is a no-op.
--
-- Why :45. The score sync runs at :00 and :30 and the games refresh at :10 and :40, and the
-- rollover reads fresh totals, so it starts 15 minutes after a score sync has finished rather than
-- in the same minute as one. It also lands 15 minutes before the next sync and well before the
-- weekly digest (12:00 UTC in daylight time, 13:00 in standard), so the digest never races a
-- rollover and can already include the new week.
--
-- Daily rather than Mondays only, so a Monday the route failed (a deploy, an outage) is caught up
-- the next morning instead of costing a whole week.
--
-- Like the other cron routes, the matchups route is meant to answer 401 to an empty bearer, so a
-- project without the vault secret just logs 401s (see 20260928121000_schedule_score_sync.sql for
-- the one-time secret setup). pg_net does not follow redirects, so the URL names the custom domain
-- directly.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Re-running the migration (or changing a schedule later) must not stack duplicate jobs.
select cron.unschedule(jobid) from cron.job where jobname in ('cincy-matchups-edt', 'cincy-matchups-est');

select cron.schedule(
  'cincy-matchups-edt',
  '45 10 * * *',
  $job$
  select net.http_post(
    url := 'https://www.cincysports.xyz/api/cron/matchups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        ''
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

select cron.schedule(
  'cincy-matchups-est',
  '45 11 * * *',
  $job$
  select net.http_post(
    url := 'https://www.cincysports.xyz/api/cron/matchups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        ''
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
