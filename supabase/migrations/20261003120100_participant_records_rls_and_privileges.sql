-- RLS and grants for participant_records. Readable by everyone, like participant_results, because
-- records show on public pages. Unlike participant_results there is no admin write path: a record
-- is a copy of ESPN's number, so the only writer is sync (service_role). There are deliberately NO
-- insert, update or delete policies and no write grants for anon or authenticated, so a direct
-- write is denied twice over (no privilege, no policy).

alter table public.participant_records enable row level security;

create policy "public read" on public.participant_records for select to anon, authenticated using (true);

-- Same pattern as the other tables: strip everything, grant back only what the app needs.
-- service_role needs explicit grants in this CLI version.
revoke all on public.participant_records from anon, authenticated, service_role;
grant all on public.participant_records to service_role;
grant select on public.participant_records to anon, authenticated;
