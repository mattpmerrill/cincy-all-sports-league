-- Weekly digest opt-in. Default true: every signed-up member gets the email until they opt out.
-- Note profiles are publicly readable (see profiles_and_auth), so this flag is visible too; it is
-- a preference, not a secret. Emails themselves stay in auth.users, server-side only.

alter table public.profiles
  add column weekly_email_opt_in boolean not null default true;

-- Users toggle it on their own row through the existing "own update" policy. Column grants are
-- additive; the role column stays guarded by the profiles_protect_role trigger regardless.
grant update (weekly_email_opt_in) on public.profiles to authenticated;
