-- Library (Bins & info, Local area, Documents): access tests. Run with:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -q -f supabase/tests/rls_library_test.sql
-- Each check raises an exception on failure; the script stops at the first failure. Every block rolls back.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
set client_min_messages = notice;

create or replace function pg_temp.login(p_email text) returns void language plpgsql as $$
declare uid uuid;
begin
  select id into uid from auth.users where email = p_email;
  if uid is null then raise exception 'no user %', p_email; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok  - %', msg;
end $$;

-- Test files in the documents bucket: one per visibility level, plus one no document points to.
-- Created as the database owner inside each transaction, so nothing is left behind. Deletes are allowed the
-- way the Storage API allows them (storage.allow_delete_query), so the policies are what decides.
create or replace function pg_temp.seed_files() returns void language plpgsql as $$
declare oc uuid := '0cea0a00-0000-4000-8000-000000000001';
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  insert into storage.objects (bucket_id, name) values
    ('documents', oc || '/test-all.pdf'), ('documents', oc || '/test-owners.pdf'),
    ('documents', oc || '/test-admins.pdf'), ('documents', oc || '/test-loose.pdf');
  update public.documents set storage_path = oc || '/test-all.pdf' where community_id = oc and title = 'House rules 2026';
  update public.documents set storage_path = oc || '/test-owners.pdf' where community_id = oc and title = 'Insurance policy summary';
  update public.documents set storage_path = oc || '/test-admins.pdf' where community_id = oc and title = 'Concierge service contract';
end $$;

-- ---------------------------------------------------------------- documents: rows and files follow visibility
begin;
select pg_temp.seed_files();
select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select count(*) from documents where visibility = 'all') > 0, 'tenant sees documents for everyone');
select pg_temp.check((select count(*) from documents where visibility <> 'all') = 0, 'tenant sees no owners-only or admins-only documents');
select pg_temp.check((select count(*) from storage.objects where name like '%/test-all.pdf') = 1, 'tenant can open the file of a document for everyone');
select pg_temp.check((select count(*) from storage.objects where name like '%/test-owners.pdf') = 0, 'tenant cannot open the file of an owners-only document');
select pg_temp.check((select count(*) from storage.objects where name like '%/test-admins.pdf') = 0, 'tenant cannot open the file of an admins-only document');
select pg_temp.check((select count(*) from storage.objects where name like '%/test-loose.pdf') = 0, 'tenant cannot open or list a file no document points to (upload in progress or orphan)');
select pg_temp.check((select count(*) from document_translations t join documents d on d.id = t.document_id where d.visibility <> 'all') = 0,
  'tenant sees no translations of restricted documents');
rollback;

begin;
select pg_temp.seed_files();
select pg_temp.login('owner4@oceanagardens.test');
select pg_temp.check((select count(*) from documents where visibility = 'owners') >= 1, 'owner sees owners-only documents');
select pg_temp.check((select count(*) from documents where visibility = 'admins') = 0, 'owner does not see admins-only documents');
select pg_temp.check((select count(*) from storage.objects where name like '%/test-owners.pdf') = 1, 'owner can open the file of an owners-only document');
select pg_temp.check((select count(*) from storage.objects where name like '%/test-admins.pdf') = 0, 'owner cannot open the file of an admins-only document');
select pg_temp.check((select count(*) from storage.objects where name like '%/test-loose.pdf') = 0, 'owner cannot open a file no document points to');
select pg_temp.check((select count(*) from document_translations t join documents d on d.id = t.document_id where d.title = 'Insurance policy summary') = 1,
  'owner sees the translation of an owners-only document');
rollback;

begin;
select pg_temp.seed_files();
select pg_temp.login('treasurer@oceanagardens.test');
select pg_temp.check((select count(*) from documents where visibility = 'admins') >= 1, 'treasurer sees admins-only documents');
select pg_temp.check((select count(*) from storage.objects where name like '%/test-admins.pdf') = 1, 'treasurer can open the file of an admins-only document');
select pg_temp.check((select count(*) from storage.objects where name like '%/test-loose.pdf') = 0, 'treasurer cannot open a file no document points to');
do $$ begin
  delete from storage.objects where bucket_id = 'documents' and name like '%/test-all.pdf';
  if found then raise exception 'FAIL: treasurer deleted a document file'; end if;
end $$;
select pg_temp.check(true, 'treasurer cannot delete document files');
do $$ begin
  update documents set title = 'Changed' where visibility = 'admins';
  if found then raise exception 'FAIL: treasurer edited a document'; end if;
end $$;
select pg_temp.check(true, 'treasurer cannot edit documents');
rollback;

-- tenants cannot upload, edit or delete
begin;
select pg_temp.seed_files();
select pg_temp.login('tenant1@oceanagardens.test');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('documents', '0cea0a00-0000-4000-8000-000000000001/tenant.pdf');
  raise exception 'FAIL: tenant uploaded a document file';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'tenant cannot upload document files');
do $$ begin
  delete from storage.objects where bucket_id = 'documents' and name like '%/test-all.pdf';
  if found then raise exception 'FAIL: tenant deleted a document file'; end if;
end $$;
select pg_temp.check(true, 'tenant cannot delete document files');
do $$ begin
  insert into documents (community_id, title) values ('0cea0a00-0000-4000-8000-000000000001', 'Tenant document');
  raise exception 'FAIL: tenant created a document';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'tenant cannot create documents');
do $$ begin
  insert into document_translations (community_id, document_id, language, translated_text, status)
  select community_id, id, 'fr', 'Texte', 'done' from documents where title = 'House rules 2026';
  raise exception 'FAIL: tenant added a translation';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'tenant cannot add translations');
rollback;

-- admins manage documents, files and translations of their own community only
begin;
select pg_temp.seed_files();
select pg_temp.login('admin@oceanagardens.test');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'documents' and name like '%/test-%') = 4, 'admin can open every document file');
insert into document_translations (community_id, document_id, language, translated_text, status)
select community_id, id, 'fr', 'Règlement intérieur', 'done' from documents where title = 'House rules 2026';
select pg_temp.check((select count(*) from document_translations where language = 'fr') = 1, 'admin can add a translation');
do $$ begin
  insert into document_translations (community_id, document_id, language, translated_text, status)
  select 'de300000-0000-4000-8000-000000000002', id, 'nl', 'Huisregels', 'done' from documents where title = 'House rules 2026';
  raise exception 'FAIL: admin added a translation under another community';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'admin cannot file a translation under another community');
with d as (delete from storage.objects where bucket_id = 'documents' and name like '%/test-all.pdf' returning 1)
select pg_temp.check((select count(*) from d) = 1, 'admin can delete a document file');
insert into storage.objects (bucket_id, name) values ('documents', '0cea0a00-0000-4000-8000-000000000001/admin-upload.pdf');
select pg_temp.check(true, 'admin can upload a document file');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('documents', 'de300000-0000-4000-8000-000000000002/elsewhere.pdf');
  raise exception 'FAIL: admin uploaded into another community';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'admin cannot upload into another community');
rollback;

-- another community's admin sees nothing of Oceana
begin;
select pg_temp.seed_files();
select pg_temp.login('admin@demoheights.test');
select pg_temp.check((select count(*) from documents where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0, 'other community admin sees no Oceana documents');
select pg_temp.check((select count(*) from document_translations where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0, 'other community admin sees no Oceana translations');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'documents' and name like '0cea0a00%') = 0, 'other community admin cannot open Oceana files');
do $$ begin
  delete from storage.objects where bucket_id = 'documents' and name like '0cea0a00%';
  if found then raise exception 'FAIL: other community admin deleted an Oceana file'; end if;
end $$;
select pg_temp.check(true, 'other community admin cannot delete Oceana files');
select pg_temp.check((select count(*) from info_pages where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0, 'other community admin sees no Oceana info pages');
select pg_temp.check((select count(*) from bin_schedules where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0, 'other community admin sees no Oceana bins');
select pg_temp.check((select count(*) from local_places where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0, 'other community admin sees no Oceana places');
select pg_temp.check((select count(*) from local_place_suggesters('0cea0a00-0000-4000-8000-000000000001')) = 0, 'other community admin sees no Oceana suggesters');
do $$ begin
  insert into local_places (community_id, name, place_type, recommended_by)
  values ('0cea0a00-0000-4000-8000-000000000001', 'Spam', 'shop', auth.uid());
  raise exception 'FAIL: outsider suggested a place';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'other community admin cannot suggest Oceana places');
rollback;

-- ---------------------------------------------------------------- info pages + bins
begin;
select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select count(*) from info_pages where visibility = 'all') > 0, 'tenant reads info pages for everyone');
select pg_temp.check((select count(*) from info_pages where visibility <> 'all') = 0, 'tenant does not read owners-only or admins-only info');
do $$ begin
  update info_pages set title = 'Changed';
  if found then raise exception 'FAIL: tenant edited an info page'; end if;
end $$;
select pg_temp.check(true, 'tenant cannot edit info pages');
do $$ begin
  update bin_schedules set weekdays = '{1}';
  if found then raise exception 'FAIL: tenant changed bin days'; end if;
end $$;
select pg_temp.check(true, 'tenant cannot change bin days');
do $$ begin
  insert into bin_schedules (community_id, bin_type, color, weekdays) values ('0cea0a00-0000-4000-8000-000000000001', 'Test', 'red', '{1}');
  raise exception 'FAIL: tenant added a bin';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'tenant cannot add bins');
rollback;

begin;
select pg_temp.login('owner4@oceanagardens.test');
select pg_temp.check((select count(*) from info_pages where visibility = 'owners') >= 1, 'owner reads owners-only info');
select pg_temp.check((select count(*) from info_pages where visibility = 'admins') = 0, 'owner does not read admins-only info');
rollback;

begin;
select pg_temp.login('admin@oceanagardens.test');
select pg_temp.check((select count(*) from info_pages where visibility = 'admins') >= 1, 'admin reads admins-only info');
with u as (update info_pages set title = 'Pool' where title = 'Swimming pool' returning 1)
select pg_temp.check((select count(*) from u) = 1, 'admin can edit info pages');
with u as (update bin_schedules set weekdays = '{2,4}' where bin_type = 'Glass' returning 1)
select pg_temp.check((select count(*) from u) = 1, 'admin can change bin days');
rollback;

-- ---------------------------------------------------------------- local places
begin;
select pg_temp.login('tenant1@oceanagardens.test');
insert into local_places (community_id, name, place_type, recommended_by)
values ('0cea0a00-0000-4000-8000-000000000001', 'Test café', 'cafe', auth.uid());
select pg_temp.check(true, 'tenant can suggest a place in their own name');
do $$ begin
  insert into local_places (community_id, name, place_type, recommended_by)
  values ('0cea0a00-0000-4000-8000-000000000001', 'Fake', 'cafe', (select id from auth.users where email = 'owner1@oceanagardens.test'));
  raise exception 'FAIL: tenant suggested a place in someone else''s name';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'tenant cannot suggest a place in someone else''s name');
do $$ begin
  update local_places set name = 'Changed';
  if found then raise exception 'FAIL: tenant edited a place'; end if;
  delete from local_places;
  if found then raise exception 'FAIL: tenant deleted a place'; end if;
end $$;
select pg_temp.check(true, 'tenant cannot edit or delete places');
select pg_temp.check((select s.name from local_place_suggesters('0cea0a00-0000-4000-8000-000000000001') s join local_places p on p.id = s.place_id where p.name = 'Heladería Los Arcos') = 'Sophie M.',
  'residents see "First L." for other people''s suggestions');
select pg_temp.check((select s.name from local_place_suggesters('0cea0a00-0000-4000-8000-000000000001') s join local_places p on p.id = s.place_id where p.name = 'Panadería La Espiga') = 'Lucía Fernández',
  'residents see their own full name on their suggestions');
rollback;

begin;
select pg_temp.login('admin@oceanagardens.test');
select pg_temp.check((select s.name from local_place_suggesters('0cea0a00-0000-4000-8000-000000000001') s join local_places p on p.id = s.place_id where p.name = 'Heladería Los Arcos') = 'Sophie Martin',
  'admin sees the full name of who suggested a place');
with u as (update local_places set description = 'Changed' where name = 'Taxi rank' returning 1)
select pg_temp.check((select count(*) from u) = 1, 'admin can edit places');
with d as (delete from local_places where name = 'Taxi rank' returning 1)
select pg_temp.check((select count(*) from d) = 1, 'admin can delete places');
rollback;

begin;
set local role anon;
select pg_temp.check((select count(*) from local_places) = 0, 'anon cannot read places');
select pg_temp.check((select count(*) from info_pages) = 0, 'anon cannot read info pages');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'documents') = 0, 'anon cannot read document files');
rollback;

\echo 'library RLS tests passed'
