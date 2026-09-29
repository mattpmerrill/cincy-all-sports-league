-- Point the score sync job at the custom domain.
--
-- pg_net does not follow redirects, so once the vercel.app address redirects to the custom domain
-- the old URL would get a 308 and never reach the sync route. Same job otherwise.

select cron.unschedule(jobid) from cron.job where jobname = 'cincy-score-sync';

select cron.schedule(
  'cincy-score-sync',
  '*/30 * * * *',
  $job$
  select net.http_post(
    url := 'https://www.cincysports.xyz/api/cron/sync',
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
