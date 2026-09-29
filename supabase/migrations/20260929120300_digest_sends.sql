-- One row per weekly digest, keyed by the Monday it covers. The primary key is what makes the
-- send idempotent: the two pg_cron firings (daylight and standard time) race to insert one row.
-- Service role only; see feed_rls_policies and feed_table_privileges (no policies, no grants).

create table public.digest_sends (
  week_start date primary key,
  sent_at timestamptz not null default now(),
  recipient_count integer not null check (recipient_count >= 0),
  status text not null check (status in ('sent', 'partial', 'failed'))
);
