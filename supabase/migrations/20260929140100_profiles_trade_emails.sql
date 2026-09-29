-- Trade email alerts opt-in. Same shape as weekly_email_opt_in: default true, visible because
-- profiles are publicly readable (a preference, not a secret), toggled through the existing
-- "own update" policy plus a column grant. The profiles_protect_role trigger only guards role, so
-- it is unaffected by this column.

alter table public.profiles
  add column trade_emails boolean not null default true;

grant update (trade_emails) on public.profiles to authenticated;
