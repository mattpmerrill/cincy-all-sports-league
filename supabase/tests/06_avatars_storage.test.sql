-- Profile photo storage: a public bucket where members write only inside their own folder.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'photo1@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'photo2@example.com');

create function pg_temp.set_caller(uid uuid, role_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', role_name)::text, true);
  execute format('set local role %I', role_name);
end $$;
grant execute on function pg_temp.set_caller(uuid, text) to public;

-- ===== bucket =====
select is((select public from storage.buckets where id = 'avatars'), true, 'the avatars bucket is public');
select is((select file_size_limit from storage.buckets where id = 'avatars'), 1048576::bigint, 'photos are capped at 1 MB');
select ok(
  (select 'image/jpeg' = any(allowed_mime_types) and not ('image/gif' = any(allowed_mime_types)) from storage.buckets where id = 'avatars'),
  'only still image types are allowed');

-- ===== owner =====
select pg_temp.set_caller('00000000-0000-0000-0000-0000000000a1', 'authenticated');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('avatars', '00000000-0000-0000-0000-0000000000a1/1.jpg', '00000000-0000-0000-0000-0000000000a1')$$,
  'a member can upload into their own folder');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('avatars', '00000000-0000-0000-0000-0000000000a2/1.jpg', '00000000-0000-0000-0000-0000000000a1')$$,
  '42501', null, 'a member cannot upload into someone else''s folder');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('avatars', 'loose.jpg', '00000000-0000-0000-0000-0000000000a1')$$,
  '42501', null, 'a member cannot upload outside any folder');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars'), 1,
  'a member sees their own photo through the API');
reset role;

-- The second member's photo, written as the table owner.
insert into storage.objects (bucket_id, name, owner_id)
  values ('avatars', '00000000-0000-0000-0000-0000000000a2/1.jpg', '00000000-0000-0000-0000-0000000000a2');

select pg_temp.set_caller('00000000-0000-0000-0000-0000000000a1', 'authenticated');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars' and name like '00000000-0000-0000-0000-0000000000a2/%'), 0,
  'a member cannot list someone else''s folder');
update storage.objects set name = '00000000-0000-0000-0000-0000000000a2/2.jpg'
  where name = '00000000-0000-0000-0000-0000000000a2/1.jpg';
reset role;
select is(
  (select count(*)::int from storage.objects where name = '00000000-0000-0000-0000-0000000000a2/1.jpg'), 1,
  'a member cannot rename someone else''s photo');

-- Storage forbids direct SQL deletes (they go through the Storage API, which applies this
-- policy), so the delete rule is checked by its definition: own folder in the avatars bucket.
select is(
  (select qual from pg_policies where tablename = 'objects' and policyname = 'avatar owners delete own folder'),
  (select qual from pg_policies where tablename = 'objects' and policyname = 'avatar owners read own folder'),
  'deleting is limited to the member''s own folder, same as reading');

-- ===== anon =====
select pg_temp.set_caller(null, 'anon');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('avatars', 'x/1.jpg')$$,
  '42501', null, 'a visitor cannot upload');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 0,
  'visitors list nothing (they load photos by public URL)');
reset role;

select * from finish();
rollback;
