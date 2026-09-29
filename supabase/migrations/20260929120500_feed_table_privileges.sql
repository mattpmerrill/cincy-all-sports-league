-- Explicit grants for the feed tables, same pattern as table_privileges: strip everything, then
-- grant back only what the app needs. service_role needs explicit grants in this CLI version.

revoke all on public.messages, public.message_reactions, public.digest_sends
from anon, authenticated, service_role;

grant all on public.messages, public.message_reactions, public.digest_sends to service_role;

grant select on public.messages, public.message_reactions to anon, authenticated;

grant insert on public.messages to authenticated;
-- Soft delete is the only update; there is no hard delete for signed-in users.
grant update (deleted_at) on public.messages to authenticated;

grant insert, delete on public.message_reactions to authenticated;

-- digest_sends: nothing for anon or authenticated.
