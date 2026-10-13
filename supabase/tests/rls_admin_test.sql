-- Administration area: access tests. Run with:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -q -f supabase/tests/rls_admin_test.sql
-- Each check raises an exception on failure; every block rolls back, so the sample data is unchanged.
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

-- A known unanswered question to work with (seeds/admin.sql adds some; create one if not).
create or replace function pg_temp.question() returns uuid language plpgsql as $$
declare conv uuid; m uuid;
begin
  select id into m from public.assistant_messages
  where community_id = '0cea0a00-0000-4000-8000-000000000001' and unanswered and role = 'user' limit 1;
  if m is not null then return m; end if;
  insert into public.assistant_conversations (community_id, profile_id)
  values ('0cea0a00-0000-4000-8000-000000000001', (select id from public.profiles where email = 'tenant2@oceanagardens.test'))
  returning id into conv;
  insert into public.assistant_messages (community_id, conversation_id, role, content, unanswered)
  values ('0cea0a00-0000-4000-8000-000000000001', conv, 'user', 'Test question for the admin tests', true) returning id into m;
  return m;
end $$;

-- ---------------------------------------------------------------- administrator
begin;
select set_config('test.q', pg_temp.question()::text, true) is not null as prepared \gset
select pg_temp.login('admin@oceanagardens.test');
select pg_temp.check((select count(*) from assistant_messages where id = current_setting('test.q')::uuid) = 1,
  'admin can read an unanswered question');
select pg_temp.check((select count(distinct profile_id) from memberships where community_id = '0cea0a00-0000-4000-8000-000000000001') >= 29,
  'admin reads every membership of the community');
select pg_temp.check((select count(*) from profiles p where exists (select 1 from memberships m where m.profile_id = p.id
  and m.community_id = '0cea0a00-0000-4000-8000-000000000001')) >= 29, 'admin reads every member profile');
insert into faq_entries (community_id, question, answer)
values ('0cea0a00-0000-4000-8000-000000000001', 'Test FAQ question', 'Test FAQ answer');
select pg_temp.check((select count(*) from faq_entries where question = 'Test FAQ question') = 1, 'admin can add an FAQ entry');
update faq_entries set answer = 'Edited FAQ answer' where question = 'Test FAQ question';
select pg_temp.check((select answer from faq_entries where question = 'Test FAQ question') = 'Edited FAQ answer', 'admin can edit an FAQ answer');
delete from faq_entries where question = 'Test FAQ question';
select pg_temp.check((select count(*) from faq_entries where question = 'Test FAQ question') = 0, 'admin can delete an FAQ entry');
select pg_temp.check(resolve_unanswered_question('0cea0a00-0000-4000-8000-000000000001', current_setting('test.q')::uuid),
  'admin can mark a question as answered');
select pg_temp.check((select count(*) from assistant_messages where id = current_setting('test.q')::uuid) = 0,
  'an answered question leaves the admin list');
select pg_temp.check(not resolve_unanswered_question('0cea0a00-0000-4000-8000-000000000001', current_setting('test.q')::uuid),
  'resolving twice does nothing');
update units set bedrooms = 4 where label = 'A-2B' and community_id = '0cea0a00-0000-4000-8000-000000000001';
select pg_temp.check((select bedrooms from units where label = 'A-2B') = 4, 'admin can edit a flat');
insert into buildings (community_id, name, sort) values ('0cea0a00-0000-4000-8000-000000000001', 'Block D', 4);
select pg_temp.check((select count(*) from buildings where name = 'Block D') = 1, 'admin can add a block');
update community_branding set primary_color = '#1d4ed8' where community_id = '0cea0a00-0000-4000-8000-000000000001';
select pg_temp.check((select primary_color from community_branding where community_id = '0cea0a00-0000-4000-8000-000000000001') = '#1d4ed8',
  'admin can change branding');
update communities set name = 'Oceana Gardens (test)', settings = settings || '{"tenant_requires_approval": true}'
where id = '0cea0a00-0000-4000-8000-000000000001';
select pg_temp.check((select name from communities where id = '0cea0a00-0000-4000-8000-000000000001') = 'Oceana Gardens (test)',
  'admin can rename the community and change settings');
rollback;

-- admin cannot change how the community is reached
begin;
select pg_temp.login('admin@oceanagardens.test');
do $$ begin
  update communities set slug = 'stolen-slug' where id = '0cea0a00-0000-4000-8000-000000000001';
  raise exception 'FAIL: community admin changed the slug';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'community admin cannot change the slug');
do $$ begin
  update communities set status = 'suspended' where id = '0cea0a00-0000-4000-8000-000000000001';
  raise exception 'FAIL: community admin suspended the community';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'community admin cannot change the status');
do $$ begin
  update communities set custom_domain = 'example.org' where id = '0cea0a00-0000-4000-8000-000000000001';
  raise exception 'FAIL: community admin set a custom domain';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'community admin cannot change the custom domain');
rollback;

begin;
select pg_temp.login('platform@communityapp.test');
update communities set custom_domain = 'community.oceanagardens.test' where id = '0cea0a00-0000-4000-8000-000000000001';
select pg_temp.check((select custom_domain from communities where id = '0cea0a00-0000-4000-8000-000000000001') = 'community.oceanagardens.test',
  'platform admin can still set a custom domain');
rollback;

-- approving a landlord-added tenancy activates the tenant's membership
begin;
select pg_temp.login('admin@oceanagardens.test');
select set_config('test.t', coalesce((select id::text from tenancies where status = 'pending'
  and community_id = '0cea0a00-0000-4000-8000-000000000001' limit 1), ''), true) is not null as prepared \gset
select pg_temp.check(current_setting('test.t') <> '', 'there is a pending tenancy to approve');
update tenancies set status = 'active' where id = current_setting('test.t')::uuid;
select pg_temp.check((select m.status from memberships m join tenancies t on t.tenant_id = m.profile_id and m.community_id = t.community_id
  where t.id = current_setting('test.t')::uuid and m.role = 'tenant') = 'active', 'approving a tenancy activates the tenant');
rollback;

-- ---------------------------------------------------------------- residents
begin;
select set_config('test.q', pg_temp.question()::text, true) is not null as prepared \gset
select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select count(*) from assistant_messages where unanswered and conversation_id not in
  (select id from assistant_conversations where profile_id = auth.uid())) = 0, 'tenant cannot read other people''s questions');
select pg_temp.check(not resolve_unanswered_question('0cea0a00-0000-4000-8000-000000000001', current_setting('test.q')::uuid),
  'tenant cannot mark questions as answered');
select pg_temp.check((select count(*) from memberships where profile_id <> auth.uid()) = 0, 'tenant cannot read other memberships');
update units set coefficient = 50 where community_id = '0cea0a00-0000-4000-8000-000000000001';
update buildings set name = 'Hacked' where community_id = '0cea0a00-0000-4000-8000-000000000001';
update community_branding set primary_color = '#000000' where community_id = '0cea0a00-0000-4000-8000-000000000001';
update community_public_info set address = 'Hacked' where community_id = '0cea0a00-0000-4000-8000-000000000001';
update communities set name = 'Hacked' where id = '0cea0a00-0000-4000-8000-000000000001';
-- same transaction, now looking as the administrator
reset role;
select pg_temp.login('admin@oceanagardens.test');
select pg_temp.check((select count(*) from units where coefficient = 50) = 0, 'tenant cannot change flats');
select pg_temp.check((select count(*) from buildings where name = 'Hacked') = 0, 'tenant cannot rename blocks');
select pg_temp.check((select primary_color from community_branding where community_id = '0cea0a00-0000-4000-8000-000000000001') <> '#000000',
  'tenant cannot change branding');
select pg_temp.check((select address from community_public_info where community_id = '0cea0a00-0000-4000-8000-000000000001') <> 'Hacked',
  'tenant cannot change the landing page');
select pg_temp.check((select name from communities where id = '0cea0a00-0000-4000-8000-000000000001') <> 'Hacked',
  'tenant cannot rename the community');
rollback;

begin;
select pg_temp.login('owner4@oceanagardens.test');
do $$ begin
  insert into faq_entries (community_id, question, answer) values ('0cea0a00-0000-4000-8000-000000000001', 'Owner FAQ', 'No');
  raise exception 'FAIL: owner added an FAQ entry';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'owner cannot add FAQ entries');
update faq_entries set answer = 'Hacked' where community_id = '0cea0a00-0000-4000-8000-000000000001';
delete from faq_entries where community_id = '0cea0a00-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) from faq_entries where community_id = '0cea0a00-0000-4000-8000-000000000001' and answer <> 'Hacked') > 0
  and (select count(*) from faq_entries where answer = 'Hacked') = 0, 'owner cannot edit or delete FAQ entries');
do $$ begin
  insert into memberships (community_id, profile_id, role) values ('0cea0a00-0000-4000-8000-000000000001', auth.uid(), 'admin');
  raise exception 'FAIL: owner made themselves admin';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'owner cannot give themselves the administrator role');
rollback;

begin;
select pg_temp.login('treasurer@oceanagardens.test');
select pg_temp.check((select count(*) from assistant_messages where unanswered and conversation_id not in
  (select id from assistant_conversations where profile_id = auth.uid())) = 0, 'treasurer cannot read unanswered questions');
update tenancies set status = 'active' where status = 'pending';
select pg_temp.check((select count(*) from tenancies where status = 'pending' and not owns_unit(unit_id)) = 0,
  'treasurer only sees tenancies of their own flats');
rollback;

-- ---------------------------------------------------------------- other community
begin;
select set_config('test.q', pg_temp.question()::text, true) is not null as prepared \gset
select pg_temp.login('admin@demoheights.test');
select pg_temp.check((select count(*) from assistant_messages where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0,
  'Demo Heights admin cannot read Oceana questions');
select pg_temp.check(not resolve_unanswered_question('0cea0a00-0000-4000-8000-000000000001', current_setting('test.q')::uuid),
  'Demo Heights admin cannot resolve Oceana questions');
select pg_temp.check(not resolve_unanswered_question('de300000-0000-4000-8000-000000000002', current_setting('test.q')::uuid),
  'an Oceana question cannot be resolved through another community');
select pg_temp.check((select count(*) from memberships where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0,
  'Demo Heights admin cannot read Oceana memberships');
select pg_temp.check((select count(*) from tenancies where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0,
  'Demo Heights admin cannot read Oceana tenancies');
update units set bedrooms = 9 where community_id = '0cea0a00-0000-4000-8000-000000000001';
update community_branding set primary_color = '#000000' where community_id = '0cea0a00-0000-4000-8000-000000000001';
update communities set name = 'Hacked' where id = '0cea0a00-0000-4000-8000-000000000001';
update faq_entries set answer = 'Hacked' where community_id = '0cea0a00-0000-4000-8000-000000000001';
delete from faq_entries where community_id = '0cea0a00-0000-4000-8000-000000000001';
do $$ begin
  insert into memberships (community_id, profile_id, role) values ('0cea0a00-0000-4000-8000-000000000001', auth.uid(), 'admin');
  raise exception 'FAIL: Demo Heights admin joined Oceana as admin';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'Demo Heights admin cannot make themselves an Oceana admin');
-- same transaction, now looking as the Oceana administrator
reset role;
select pg_temp.login('admin@oceanagardens.test');
select pg_temp.check((select count(*) from units where bedrooms = 9) = 0, 'Demo Heights admin cannot change Oceana flats');
select pg_temp.check((select primary_color from community_branding where community_id = '0cea0a00-0000-4000-8000-000000000001') <> '#000000',
  'Demo Heights admin cannot change Oceana branding');
select pg_temp.check((select name from communities where id = '0cea0a00-0000-4000-8000-000000000001') <> 'Hacked',
  'Demo Heights admin cannot rename Oceana');
select pg_temp.check((select count(*) from faq_entries where community_id = '0cea0a00-0000-4000-8000-000000000001' and answer <> 'Hacked') > 0
  and (select count(*) from faq_entries where answer = 'Hacked') = 0, 'Demo Heights admin cannot edit or delete Oceana FAQ entries');
rollback;

\echo 'All administration RLS tests passed'
