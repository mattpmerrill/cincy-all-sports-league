-- Push alert switches per topic. Same shape as trade_emails: default true (turning alerts on for a
-- device is the real opt-in), visible because profiles are publicly readable (a preference, not a
-- secret), toggled through the existing "own update" policy plus a column grant. The
-- profiles_protect_role trigger only guards role, so it is unaffected by these columns.

alter table public.profiles
  add column push_trades boolean not null default true,
  add column push_feed boolean not null default true,
  add column push_scores boolean not null default true;

grant update (push_trades, push_feed, push_scores) on public.profiles to authenticated;
