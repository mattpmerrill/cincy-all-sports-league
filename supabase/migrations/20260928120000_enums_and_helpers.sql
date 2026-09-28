-- Enumerated types and the one trigger function every table with updated_at shares.

create type public.participant_kind as enum ('team', 'athlete');

-- cumulative: every playoff milestone reached adds up; highest_only: only the best counts.
create type public.playoff_scoring_mode as enum ('cumulative', 'highest_only');

-- See the scoring contract: how a recorded fact converts to points.
create type public.scoring_rule_kind as enum (
  'per_win',
  'per_tie',
  'playoff_milestone',
  'major_finish',
  'final_rank_band'
);

create type public.user_role as enum ('member', 'admin');
create type public.claim_status as enum ('pending', 'approved', 'rejected');

-- manual rows are admin overrides; sync may overwrite espn rows unless they are locked.
create type public.result_source as enum ('espn', 'manual');

create type public.sync_status as enum ('running', 'succeeded', 'failed', 'skipped');

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
