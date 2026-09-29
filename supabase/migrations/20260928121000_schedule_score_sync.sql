-- Score sync trigger: Supabase calls the app's cron route every 30 minutes.
--
-- Why here and not Vercel Cron: on the Hobby plan Vercel's own cron runs at most daily, and the
-- steady traffic from this job also keeps a free Supabase project from auto-pausing.
--
-- The bearer secret is NOT in this file. The job reads it from Supabase Vault at run time, so the
-- one-time setup (run once per project, in the SQL editor) is:
--
--   select vault.create_secret('<the same value as CRON_SECRET in Vercel>', 'cron_secret');
--
-- Until that exists the job still fires, sends an empty bearer and gets a harmless 401. To rotate
-- the secret: select vault.update_secret(id, '<new>') from vault.secrets where name = 'cron_secret';

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Re-running the migration (or changing the schedule later) must not stack duplicate jobs.
select cron.unschedule(jobid) from cron.job where jobname = 'cincy-score-sync';

select cron.schedule(
  'cincy-score-sync',
  '*/30 * * * *',
  $job$
  select net.http_post(
    url := 'https://cincy-all-sports-league.vercel.app/api/cron/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        ''
      )
    ),
    body := '{}'::jsonb,
    -- A full sync measures ~3s; leave room for a slow ESPN day inside the route's 60s limit.
    timeout_milliseconds := 60000
  );
  $job$
);
