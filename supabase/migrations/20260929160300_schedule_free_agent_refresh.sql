-- Daily free-agent pool refresh: Supabase calls the app's free-agents cron route once per sport.
--
-- The route loads every team or athlete ESPN lists for the sport into participants (insert-only,
-- safe to re-run) and refreshes free-agent facts where the 30-minute sync does not cover them.
-- 09:00 UTC is 04:00 or 05:00 Eastern, after the previous day's games have settled.
--
-- Same secret as the score sync: the job reads 'cron_secret' from Supabase Vault at run time, so
-- this file holds no secret. See 20260928121000_schedule_score_sync.sql for the one-time setup.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Re-running the migration (or changing the schedule later) must not stack duplicate jobs.
select cron.unschedule(jobid) from cron.job where jobname = 'cincy-free-agent-refresh';

-- One request per sport, read from the table so the sport list is not repeated here. pg_net sends
-- them asynchronously, so each sport gets its own 60-second route budget instead of sharing one.
-- Codes are lowercase letters only (sports.code check), so they are safe in a query string.
select cron.schedule(
  'cincy-free-agent-refresh',
  '0 9 * * *',
  $job$
  select net.http_post(
    url := 'https://www.cincysports.xyz/api/cron/free-agents?sport=' || code,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        ''
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  from public.sports;
  $job$
);
