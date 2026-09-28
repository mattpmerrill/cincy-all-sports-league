-- Claim review is one atomic step: mark the claim and hand over the team together, so a failure
-- can never leave an approved claim on an ownerless team. SECURITY DEFINER because the caller
-- (an admin) has no direct write path that also updates the sibling rows; the is_admin() check
-- inside is the authorization.

create function public.approve_team_claim(claim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim public.team_claims;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;

  -- Lock the claim so two admins approving concurrently serialize.
  select * into claim from public.team_claims where id = claim_id for update;
  if not found then
    raise exception 'claim not found' using errcode = 'no_data_found';
  end if;
  if claim.status <> 'pending' then
    raise exception 'claim already reviewed' using errcode = 'check_violation';
  end if;

  -- The partial unique indexes on team_claims reject a second approved claim for the team or the
  -- user, which aborts this whole function.
  update public.team_claims
     set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now()
   where id = claim_id;

  update public.fantasy_teams set owner_id = claim.user_id where id = claim.fantasy_team_id;

  -- Anyone else waiting on this team, and this user's other requests, are now moot.
  update public.team_claims
     set status = 'rejected', reviewed_by = (select auth.uid()), reviewed_at = now()
   where status = 'pending'
     and id <> claim_id
     and (fantasy_team_id = claim.fantasy_team_id or user_id = claim.user_id);
end;
$$;

create function public.reject_team_claim(claim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;

  update public.team_claims
     set status = 'rejected', reviewed_by = (select auth.uid()), reviewed_at = now()
   where id = claim_id and status = 'pending';
  if not found then
    raise exception 'pending claim not found' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Supabase grants EXECUTE on new functions to everyone by default; narrow it.
revoke execute on function public.approve_team_claim(uuid) from public, anon;
revoke execute on function public.reject_team_claim(uuid) from public, anon;
grant execute on function public.approve_team_claim(uuid) to authenticated;
grant execute on function public.reject_team_claim(uuid) to authenticated;

-- Trigger-only functions are never meant to be called through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_role() from public, anon, authenticated;
revoke execute on function public.enforce_pick_uniqueness() from public, anon, authenticated;
revoke execute on function public.enforce_result_consistency() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
