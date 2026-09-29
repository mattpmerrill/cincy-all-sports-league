-- RLS and grants for free-agent moves. Moves are publicly readable like the feed post each one
-- writes. There are deliberately NO insert, update or delete policies and no write grants: every
-- write goes through make_free_agent_move (service_role only), so a direct write from anon or
-- authenticated is denied twice over.
--
-- The new banked_scores columns (source, free_agent_move_id) are covered by that table's existing
-- table-level grants and policy. No realtime publication: nothing in the UI listens for moves.

alter table public.free_agent_moves enable row level security;

create policy "public read" on public.free_agent_moves for select to anon, authenticated using (true);

-- Same pattern as trade_table_privileges: strip everything, grant back only what the app needs.
-- service_role needs explicit grants in this CLI version.
revoke all on public.free_agent_moves from anon, authenticated, service_role;
grant all on public.free_agent_moves to service_role;
grant select on public.free_agent_moves to anon, authenticated;
