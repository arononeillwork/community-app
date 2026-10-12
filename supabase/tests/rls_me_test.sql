-- Access tests for the "Me" area: notifications, settings (preferences, profile, contact sharing),
-- My flat (tenants of my flats, fees) and Where the money goes. Run with:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -q -f supabase/tests/rls_me_test.sql
-- Each check raises an exception on failure; every block rolls back, so the sample data is untouched.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
set client_min_messages = notice;

create or replace function pg_temp.login(p_email text) returns void language plpgsql as $$
declare uid uuid;
begin
  perform set_config('role', 'none', true);  -- allow switching user within one transaction
  select id into uid from auth.users where email = p_email;
  if uid is null then raise exception 'no user %', p_email; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- Rows changed by a statement run as the current user (RLS applies).
create or replace function pg_temp.affected(q text) returns int language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok  - %', msg;
end $$;

-- ---------------------------------------------------------------- notifications
begin;
select set_config('test.other', (select id::text from profiles where email = 'tenant1@oceanagardens.test'), true);
select pg_temp.login('owner4@oceanagardens.test');
select pg_temp.check((select count(*) from notifications) > 0, 'owner sees their notifications');
select pg_temp.check((select count(*) from notifications where profile_id <> auth.uid()) = 0, 'nobody sees anyone else''s notifications');
update notifications set read_at = now() where profile_id = auth.uid() and read_at is null;
select pg_temp.check((select count(*) from notifications where read_at is null) = 0, 'a person can mark all their notifications read');
select pg_temp.check(pg_temp.affected($q$update notifications set read_at = now() where profile_id = current_setting('test.other')::uuid$q$) = 0, 'a person cannot mark someone else''s notifications read');
do $$ begin
  insert into notifications (community_id, profile_id, kind, title)
  values ('0cea0a00-0000-4000-8000-000000000001', current_setting('test.other')::uuid, 'notice', 'Fake');
  raise exception 'FAIL: member created a notification for someone else';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'members cannot send notifications to other people');
rollback;

-- ---------------------------------------------------------------- preferences and profile
begin;
select set_config('test.other', (select id::text from profiles where email = 'owner1@oceanagardens.test'), true);
select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select count(*) from user_preferences) = 1, 'a person only sees their own preferences');
update user_preferences set font_scale = 150, theme = 'dark', notify_channel = 'whatsapp' where profile_id = auth.uid();
select pg_temp.check((select font_scale = 150 and theme = 'dark' from user_preferences where profile_id = auth.uid()), 'a person can save their own display settings');
select pg_temp.check(pg_temp.affected($q$update user_preferences set font_scale = 200 where profile_id = current_setting('test.other')::uuid$q$) = 0, 'a person cannot change someone else''s settings');
do $$ begin
  update user_preferences set font_scale = 120 where profile_id = auth.uid();
  raise exception 'FAIL: invalid text size saved';
exception when check_violation then null;
end $$;
select pg_temp.check(true, 'only the offered text sizes can be saved');

update profiles set full_name = 'Lucía Fernández Ruiz', phone = '+34 622 999 001' where id = auth.uid();
select pg_temp.check((select phone = '+34 622 999 001' from profiles where id = auth.uid()), 'a person can update their own name and phone');
select pg_temp.check(pg_temp.affected($q$update profiles set phone = '000' where id = current_setting('test.other')::uuid$q$) = 0, 'a person cannot update someone else''s profile');
do $$ begin
  update profiles set is_platform_admin = true where id = auth.uid();
  raise exception 'FAIL: member made themselves platform admin';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'a person cannot make themselves a platform administrator');
rollback;

-- ---------------------------------------------------------------- contact sharing
begin;
select set_config('test.other', (select id::text from profiles where email = 'owner1@oceanagardens.test'), true);
select pg_temp.login('tenant1@oceanagardens.test');
insert into contact_preferences (profile_id, community_id, preferred_method, best_times, visibility)
values (auth.uid(), '0cea0a00-0000-4000-8000-000000000001', 'phone', 'Evenings', 'all')
on conflict (profile_id, community_id) do update set preferred_method = excluded.preferred_method, best_times = excluded.best_times, visibility = excluded.visibility;
select pg_temp.check((select visibility = 'all' from contact_preferences where profile_id = auth.uid()), 'a person can upsert their own contact sharing');
do $$ begin
  insert into contact_preferences (profile_id, community_id, visibility)
  values ('de300000-0000-4000-8000-000000000002'::uuid, '0cea0a00-0000-4000-8000-000000000001', 'all');
  raise exception 'FAIL: wrote contact sharing for someone else';
exception when insufficient_privilege or foreign_key_violation then null;
end $$;
select pg_temp.check(true, 'a person cannot write someone else''s contact sharing');
select pg_temp.check(pg_temp.affected($q$update contact_preferences set visibility = 'all' where profile_id = current_setting('test.other')::uuid$q$) = 0, 'a person cannot change someone else''s contact sharing');
do $$ begin
  insert into contact_preferences (profile_id, community_id, visibility)
  values (auth.uid(), 'de300000-0000-4000-8000-000000000002', 'all');
  raise exception 'FAIL: contact sharing saved for a community the person is not in';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'contact sharing can only be saved for the person''s own community');
rollback;

-- Sharing choices change what neighbours see (owner4 owns A-2B in Block A and C-1A in Block C,
-- where tenant5 rents; owner1 lives in Block A).
begin;
select set_config('test.o4', (select id::text from profiles where email = 'owner4@oceanagardens.test'), true);
update contact_preferences set visibility = 'admins' where profile_id = current_setting('test.o4')::uuid;
select pg_temp.login('owner1@oceanagardens.test');
select pg_temp.check((select not shared and phone is null and email is null from block_directory('0cea0a00-0000-4000-8000-000000000001')
  where profile_id = current_setting('test.o4')::uuid and unit_label = 'A-2B'), '"Only the administrators": block neighbours see the name only');
rollback;

begin;
select set_config('test.o4', (select id::text from profiles where email = 'owner4@oceanagardens.test'), true);
update contact_preferences set visibility = 'unit' where profile_id = current_setting('test.o4')::uuid;
select pg_temp.login('owner1@oceanagardens.test');
select pg_temp.check((select not shared from block_directory('0cea0a00-0000-4000-8000-000000000001')
  where profile_id = current_setting('test.o4')::uuid and unit_label = 'A-2B'), '"Only my landlord or tenant": hidden from the rest of the block');
select pg_temp.login('tenant5@oceanagardens.test');
select pg_temp.check((select shared and phone is not null from block_directory('0cea0a00-0000-4000-8000-000000000001')
  where profile_id = current_setting('test.o4')::uuid and unit_label = 'C-1A'), '"Only my landlord or tenant": the tenant of that flat still sees them');
select pg_temp.login('admin@oceanagardens.test');
select pg_temp.check((select bool_and(shared and phone is not null) from block_directory('0cea0a00-0000-4000-8000-000000000001')
  where profile_id = current_setting('test.o4')::uuid), 'administrators always see the contact details');
rollback;

begin;
select set_config('test.o4', (select id::text from profiles where email = 'owner4@oceanagardens.test'), true);
update contact_preferences set visibility = 'block' where profile_id = current_setting('test.o4')::uuid;
select pg_temp.login('owner1@oceanagardens.test');
select pg_temp.check((select shared and phone is not null from block_directory('0cea0a00-0000-4000-8000-000000000001')
  where profile_id = current_setting('test.o4')::uuid and unit_label = 'A-2B'), '"People in my block": block neighbours see the phone');
rollback;

-- ---------------------------------------------------------------- tenants of my flats
begin;
select pg_temp.login('owner4@oceanagardens.test');
select pg_temp.check((select count(*) from unit_tenants('0cea0a00-0000-4000-8000-000000000001')) = 1, 'owner sees the tenancies of their own flats only');
select pg_temp.check((select bool_and(owns_unit(unit_id)) from unit_tenants('0cea0a00-0000-4000-8000-000000000001')), 'every tenancy returned is for a flat the owner owns');
select pg_temp.check((select full_name = 'Astrid Berg' and email is not null from unit_tenants('0cea0a00-0000-4000-8000-000000000001')), 'owner sees their tenant''s name and shared details');
rollback;

begin;
update contact_preferences set visibility = 'admins' where profile_id = (select id from profiles where email = 'tenant5@oceanagardens.test');
select pg_temp.login('owner4@oceanagardens.test');
select pg_temp.check((select full_name = 'Astrid Berg' and email is null and phone is null and not shared from unit_tenants('0cea0a00-0000-4000-8000-000000000001')),
  'a tenant who shares with administrators only shows to the landlord by name only');
rollback;

begin;
update tenancies set status = 'ended', end_date = current_date
where tenant_id = (select id from profiles where email = 'tenant5@oceanagardens.test');
select pg_temp.login('owner4@oceanagardens.test');
select pg_temp.check((select full_name = 'Astrid Berg' and email is null and phone is null and not shared from unit_tenants('0cea0a00-0000-4000-8000-000000000001')),
  'a former tenant shows to the landlord by name only');
select pg_temp.login('admin@oceanagardens.test');
select pg_temp.check((select bool_and(shared and email is not null) from unit_tenants('0cea0a00-0000-4000-8000-000000000001')
  where tenant_id = (select id from profiles where email = 'tenant5@oceanagardens.test')), 'administrators still see a former tenant''s details');
rollback;

begin;
select pg_temp.login('treasurer@oceanagardens.test');
select pg_temp.check((select count(*) from unit_tenants('0cea0a00-0000-4000-8000-000000000001')) = 1, 'the treasurer role does not widen unit_tenants (own flat B-3C only)');
select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select count(*) from unit_tenants('0cea0a00-0000-4000-8000-000000000001')) = 0, 'a tenant gets no tenancy list');
select pg_temp.login('admin@demoheights.test');
select pg_temp.check((select count(*) from unit_tenants('0cea0a00-0000-4000-8000-000000000001')) = 0, 'another community''s admin gets nothing');
rollback;

begin;
select set_config('test.all', (select count(*)::text from tenancies where community_id = '0cea0a00-0000-4000-8000-000000000001'), true);
select pg_temp.login('admin@oceanagardens.test');
select pg_temp.check((select count(*) from unit_tenants('0cea0a00-0000-4000-8000-000000000001')) = current_setting('test.all')::int, 'administrator sees every tenancy');
rollback;

begin;
set local role anon;
do $$ begin
  perform * from unit_tenants('0cea0a00-0000-4000-8000-000000000001');
  raise exception 'FAIL: anon could call unit_tenants';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'signed-out visitors cannot call unit_tenants');
rollback;

-- ---------------------------------------------------------------- adding, changing and ending tenancies
begin;
select set_config('test.t', (select id::text from profiles where email = 'owner19@oceanagardens.test'), true);
select set_config('test.a2b', (select id::text from units where label = 'A-2B'), true);
select set_config('test.b3c', (select id::text from units where label = 'B-3C'), true);
select pg_temp.login('owner4@oceanagardens.test');
insert into tenancies (community_id, unit_id, tenant_id, tenancy_type, end_date)
values ('0cea0a00-0000-4000-8000-000000000001', current_setting('test.a2b')::uuid, current_setting('test.t')::uuid, 'long_term', current_date + 365);
select pg_temp.check((select status = 'active' and added_by = auth.uid() from tenancies where tenant_id = current_setting('test.t')::uuid),
  'owner adds a tenant to their own flat; active straight away when no approval is needed');
select pg_temp.check(pg_temp.affected($q$update tenancies set end_date = current_date + 30 where tenant_id = current_setting('test.t')::uuid$q$) > 0, 'owner can change the end date');
update tenancies set status = 'ended', end_date = current_date where tenant_id = current_setting('test.t')::uuid;
select pg_temp.check((select status = 'ended' from tenancies where tenant_id = current_setting('test.t')::uuid), 'owner can end the tenancy now');
do $$ begin
  insert into tenancies (community_id, unit_id, tenant_id)
  values ('0cea0a00-0000-4000-8000-000000000001', current_setting('test.b3c')::uuid, current_setting('test.t')::uuid);
  raise exception 'FAIL: owner added a tenant to another owner''s flat';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'owner cannot add a tenant to a flat they do not own');
select pg_temp.check(pg_temp.affected($q$update tenancies set end_date = current_date + 5 where unit_id = current_setting('test.b3c')::uuid$q$) = 0, 'owner cannot change tenancies of other flats');
rollback;

begin;
update communities set settings = jsonb_set(settings, '{tenant_requires_approval}', 'true') where id = '0cea0a00-0000-4000-8000-000000000001';
select set_config('test.t', (select id::text from profiles where email = 'owner19@oceanagardens.test'), true);
select set_config('test.a2b', (select id::text from units where label = 'A-2B'), true);
select pg_temp.login('owner4@oceanagardens.test');
insert into tenancies (community_id, unit_id, tenant_id, tenancy_type, status)
values ('0cea0a00-0000-4000-8000-000000000001', current_setting('test.a2b')::uuid, current_setting('test.t')::uuid, 'holiday_let', 'active');
select pg_temp.check((select status = 'pending' from tenancies where tenant_id = current_setting('test.t')::uuid and unit_id = current_setting('test.a2b')::uuid),
  'with approval switched on, a landlord''s new tenancy is pending whatever the form says');
do $$ begin
  update tenancies set status = 'active' where tenant_id = current_setting('test.t')::uuid and unit_id = current_setting('test.a2b')::uuid;
  raise exception 'FAIL: owner approved their own tenancy';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'only an administrator can approve a pending tenancy');
rollback;

begin;
select set_config('test.t', (select id::text from profiles where email = 'owner19@oceanagardens.test'), true);
select pg_temp.login('tenant1@oceanagardens.test');
do $$ begin
  insert into tenancies (community_id, unit_id, tenant_id)
  select '0cea0a00-0000-4000-8000-000000000001', unit_id, current_setting('test.t')::uuid from tenancies where tenant_id = auth.uid() limit 1;
  raise exception 'FAIL: tenant sublet their flat';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'tenants cannot add tenants');
rollback;

-- ---------------------------------------------------------------- fees and where the money goes
begin;
select pg_temp.login('owner4@oceanagardens.test');
select pg_temp.check((select bool_and(charged_cents > 0) from v_unit_balance where owns_unit(unit_id)), 'owner sees the balance of their own flats');
select pg_temp.check((select coalesce(sum(charged_cents), 0) from v_unit_balance where not owns_unit(unit_id)) = 0, 'owner sees no fee amounts for other flats');
select pg_temp.check((select count(*) from fee_payments where not owns_unit(unit_id)) = 0, 'owner sees only payments for their own flats');
select pg_temp.check((select count(*) from community_spend_summary('0cea0a00-0000-4000-8000-000000000001', extract(year from current_date)::int)) = 9,
  'members see spending per category');
select pg_temp.check((select sum(budget_cents) from community_spend_summary('0cea0a00-0000-4000-8000-000000000001', extract(year from current_date)::int - 1)) > 0,
  'last year''s budget is available for the year switcher');
select pg_temp.check((select count(*) from community_contracts_public('0cea0a00-0000-4000-8000-000000000001')) >= 7, 'members see the current contracts');
rollback;

begin;
select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select coalesce(sum(charged_cents), 0) + coalesce(sum(overdue_cents), 0) from v_unit_balance) = 0, 'tenants see no fee amounts at all');
select pg_temp.check((select count(*) from fee_payments) = 0, 'tenants see no fee payments');
rollback;

begin;
select pg_temp.login('admin@demoheights.test');
select pg_temp.check((select count(*) from community_spend_summary('0cea0a00-0000-4000-8000-000000000001', extract(year from current_date)::int)) = 0,
  'another community''s admin cannot see Oceana spending');
select pg_temp.check((select count(*) from community_contracts_public('0cea0a00-0000-4000-8000-000000000001')) = 0,
  'another community''s admin cannot see Oceana contracts');
select pg_temp.check((select count(*) from notifications where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0,
  'another community''s admin sees no Oceana notifications');
rollback;

\echo 'All "me" RLS tests passed'
