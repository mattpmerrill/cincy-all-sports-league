-- Games refresh triggers: Supabase calls the app's games cron route on two schedules.
--
--   live   every 30 minutes at :10 and :40. Re-reads yesterday and today (scores, status, kickoff
--          changes). Offset ten minutes from the score sync at :00 and :30 so the two do not start
--          in the same minute and compete for the same ESPN rate and database connections.
--   weeks  daily at 09:25 UTC (04:25 or 05:25 Eastern, after the day's games have settled and ten
--          minutes after the free-agent refresh at 09:15). Loads this week and next week, so the
--          Week page is full before anyone opens it and a rescheduled game moves.
--
-- The route returns 401 on an empty bearer, so a project without the vault secret just logs 401s
-- (see 20260928121000_schedule_score_sync.sql for the one-time secret setup). pg_net does not
-- follow redirects, so the URLs name the custom domain directly.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Re-running the migration (or changing a schedule later) must not stack duplicate jobs.
select cron.unschedule(jobid) from cron.job where jobname in ('cincy-games-live', 'cincy-games-weeks');

select cron.schedule(
  'cincy-games-live',
  '10,40 * * * *',
  $job$
  select net.http_post(
    url := 'https://www.cincysports.xyz/api/cron/games?range=live',
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
  'cincy-games-weeks',
  '25 9 * * *',
  $job$
  select net.http_post(
    url := 'https://www.cincysports.xyz/api/cron/games?range=weeks',
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
