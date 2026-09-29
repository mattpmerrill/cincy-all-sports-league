-- Weekly standings email trigger: Supabase calls the app's digest route every Monday morning.
--
-- Two jobs cover 08:00 Eastern in both halves of the year: 12:00 UTC is 08:00 EDT and 13:00 UTC
-- is 08:00 EST. Both always fire; the route decides. It skips before Monday 08:00 Eastern (so in
-- winter the 12:00 UTC job is a no-op) and skips once digest_sends has a row for the week (so in
-- summer the 13:00 UTC job is a no-op).
--
-- Same secret as the score sync: the job reads 'cron_secret' from Supabase Vault at run time, so
-- this file holds no secret. See 20260928121000_schedule_score_sync.sql for the one-time setup.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Re-running the migration (or changing a schedule later) must not stack duplicate jobs.
select cron.unschedule(jobid)
from cron.job
where jobname in ('weekly-digest-edt', 'weekly-digest-est');

select cron.schedule(
  'weekly-digest-edt',
  '0 12 * * 1',
  $job$
  select net.http_post(
    url := 'https://www.cincysports.xyz/api/cron/weekly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        ''
      )
    ),
    body := '{}'::jsonb,
    -- About 20 recipients at two sends a second; leave room inside the route's 60s limit.
    timeout_milliseconds := 60000
  );
  $job$
);

select cron.schedule(
  'weekly-digest-est',
  '0 13 * * 1',
  $job$
  select net.http_post(
    url := 'https://www.cincysports.xyz/api/cron/weekly-digest',
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
