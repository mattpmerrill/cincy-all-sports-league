-- At-most-once send ledger. A send is claimed as (recipient, dedupe_key) BEFORE it goes out, so a
-- reaction toggled on and off does not re-alert, and re-running the same event is a no-op. The
-- price is that a failed transient send is not retried later, which suits alerts that go stale.
create table public.push_sends (
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  dedupe_key text not null check (length(dedupe_key) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (recipient_id, dedupe_key)
);

-- Serves the daily cleanup below.
create index push_sends_created_at_idx on public.push_sends (created_at);

-- Internal bookkeeping, not member data: no policies, service_role only, like push_subscriptions.
alter table public.push_sends enable row level security;
revoke all on public.push_sends from anon, authenticated, service_role;
grant select, insert, update, delete on public.push_sends to service_role;

-- Keys embed run, offer or reply ids, so an old key can never collide with a new event and the
-- ledger only needs to outlive the longest alert TTL; 90 days is far beyond that and keeps it
-- small. Pure SQL, so no secret or HTTP call is involved. 09:40 UTC sits away from the 09:15
-- free-agent refresh and the half-hour score sync.
create extension if not exists pg_cron;

-- Re-running the migration (or changing the schedule later) must not stack duplicate jobs.
select cron.unschedule(jobid) from cron.job where jobname = 'cincy-push-sends-cleanup';

select cron.schedule(
  'cincy-push-sends-cleanup',
  '40 9 * * *',
  $job$
  delete from public.push_sends where created_at < now() - interval '90 days';
  $job$
);
