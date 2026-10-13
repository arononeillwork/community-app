-- Regression tests for the pre-deploy security audit (migration 20261014000002_security_hardening.sql).
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

-- ---------------------------------------------------------------- cross-community references
begin;
select set_config('test.unit', (select id::text from units where label = 'B-3C'), true);
select set_config('test.dm', 'de300000-0000-4000-8000-000000000002', true);
select pg_temp.login('admin@demoheights.test');
do $$ begin
  insert into unit_ownerships (community_id, unit_id, owner_id)
  values (current_setting('test.dm')::uuid, current_setting('test.unit')::uuid, auth.uid());
  raise exception 'FAIL: other community admin attached themselves to an Oceana flat';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'an ownership row cannot point at another community''s flat');
do $$ begin
  insert into fee_payments (community_id, unit_id, paid_on, amount_cents)
  values (current_setting('test.dm')::uuid, current_setting('test.unit')::uuid, current_date, 10000);
  raise exception 'FAIL: other community admin recorded a payment against an Oceana flat';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'a fee payment cannot point at another community''s flat');
select pg_temp.check((select count(*) from unit_tenants('0cea0a00-0000-4000-8000-000000000001')) = 0, 'unit_tenants returns nothing to non-members');
rollback;

-- ---------------------------------------------------------------- profiles
begin;
select pg_temp.login('tenant1@oceanagardens.test');
do $$ begin
  update profiles set email = 'someone.else@example.test' where id = auth.uid();
  raise exception 'FAIL: a user changed the email on their profile';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'people cannot change the email stored on their profile');
update profiles set full_name = full_name, phone = phone where id = auth.uid();
select pg_temp.check(true, 'people can still change their name and phone');
reset role;
update auth.users set email = 'tenant1.changed@oceanagardens.test' where email = 'tenant1@oceanagardens.test';
select pg_temp.check((select email from profiles where full_name = 'Lucía Fernández') = 'tenant1.changed@oceanagardens.test',
  'the profile email follows the confirmed sign-in email');
rollback;

-- ---------------------------------------------------------------- office directory
begin;
select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select count(*) from directory('0cea0a00-0000-4000-8000-000000000001')) = 0, 'residents cannot list every member');
rollback;
begin;
select pg_temp.login('treasurer@oceanagardens.test');
select pg_temp.check((select count(*) from directory('0cea0a00-0000-4000-8000-000000000001')) > 20, 'the treasurer can use the office directory');
rollback;

-- ---------------------------------------------------------------- owners adding tenants
begin;
select set_config('test.member', (select id::text from profiles where email = 'tenant5@oceanagardens.test'), true);
select set_config('test.outsider', (select id::text from profiles where email = 'admin@demoheights.test'), true);
select set_config('test.a2b', (select id::text from units where label = 'A-2B'), true);
select pg_temp.login('owner4@oceanagardens.test');
insert into tenancies (community_id, unit_id, tenant_id, tenancy_type, status, invited_name)
values ('0cea0a00-0000-4000-8000-000000000001', current_setting('test.a2b')::uuid, current_setting('test.member')::uuid, 'long_term', 'active', 'Typed name');
select pg_temp.check((select status from tenancies where tenant_id = current_setting('test.member')::uuid and unit_id = current_setting('test.a2b')::uuid) = 'pending',
  'adding someone who already lives here needs the office''s approval');
select pg_temp.check((select full_name = 'Typed name' and phone is null and email is null from unit_tenants('0cea0a00-0000-4000-8000-000000000001')
                      where tenant_id = current_setting('test.member')::uuid and unit_id = current_setting('test.a2b')::uuid),
  'the owner sees only the name they typed, and no contact details, until the office approves');
do $$ begin
  update tenancies set status = 'ended' where tenant_id = current_setting('test.member')::uuid and unit_id = current_setting('test.a2b')::uuid;
  update tenancies set status = 'active' where tenant_id = current_setting('test.member')::uuid and unit_id = current_setting('test.a2b')::uuid;
  raise exception 'FAIL: owner reactivated a tenancy';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'an owner cannot approve or reactivate a tenancy by ending it first');
do $$ begin
  insert into tenancies (community_id, unit_id, tenant_id)
  values ('0cea0a00-0000-4000-8000-000000000001', current_setting('test.a2b')::uuid, current_setting('test.outsider')::uuid);
  raise exception 'FAIL: owner attached an account from another community';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'an owner cannot attach someone from another community');
rollback;

-- ---------------------------------------------------------------- reports
begin;
select set_config('test.reporter', (select id::text from profiles where email = 'owner5@oceanagardens.test'), true);
select set_config('test.someone', (select id::text from profiles where email = 'tenant2@oceanagardens.test'), true);
select pg_temp.login('tenant1@oceanagardens.test');
insert into complaints (community_id, kind, title, description, reporter_id)
values ('0cea0a00-0000-4000-8000-000000000001', 'complaint', 'Spoof test', 'Testing', current_setting('test.someone')::uuid);
select pg_temp.check((select reporter_id = auth.uid() from complaints where title = 'Spoof test'), 'a report is always filed in the name of the person sending it');
rollback;

begin;
-- 'Party noise again' is about flat A-3A, reported by owner5.
select set_config('test.c', (select id::text from complaints where title = 'Party noise again'), true);
select set_config('test.owner', (select o.owner_id::text from unit_ownerships o join units u on u.id = o.unit_id where u.label = 'A-3A' limit 1), true);
select pg_temp.login((select email from profiles where id = current_setting('test.owner')::uuid));
select pg_temp.check((select count(*) from complaints where id = current_setting('test.c')::uuid) = 0,
  'the owner of the flat a report is about cannot read the report row (and so not who made it)');
select pg_temp.check((select count(*) from flat_reports('0cea0a00-0000-4000-8000-000000000001') where id = current_setting('test.c')::uuid) = 1,
  'but they see the report about their flat, without the reporter');
select add_owner_note(current_setting('test.c')::uuid, 'It was a birthday, sorry. It will not happen again.');
select pg_temp.check((select count(*) from flat_report_notes(current_setting('test.c')::uuid)) = 1, 'the owner can send the office a note');
reset role;
select pg_temp.login((select email from profiles p join complaints c on c.reporter_id = p.id where c.id = current_setting('test.c')::uuid));
select pg_temp.check((select count(*) from complaint_updates where complaint_id = current_setting('test.c')::uuid and internal) = 0,
  'the reporter does not see the owner''s private note');
reset role;
select pg_temp.login('admin@oceanagardens.test');
select pg_temp.check((select count(*) from complaint_updates where complaint_id = current_setting('test.c')::uuid and internal) = 1,
  'the office sees the owner''s note');
select pg_temp.check((select count(*) from notifications where title like 'Note from the flat owner:%') >= 1, 'the office is alerted about the note');
rollback;

-- ---------------------------------------------------------------- finance controls
begin;
select pg_temp.login('treasurer@oceanagardens.test');
insert into invoices (community_id, supplier_id, category_id, invoice_number, issue_date, net_cents, vat_cents, status)
select '0cea0a00-0000-4000-8000-000000000001', s.id, s_cat.id, 'SEC-TEST-1', current_date, 500000, 105000, 'paid'
from suppliers s, expense_categories s_cat where s.community_id = '0cea0a00-0000-4000-8000-000000000001'
  and s_cat.community_id = s.community_id limit 1;
select pg_temp.check((select status from invoices where invoice_number = 'SEC-TEST-1') = 'received', 'a new invoice always starts awaiting approval');
reset role;
update budgets set status = 'approved' where community_id = '0cea0a00-0000-4000-8000-000000000001' and year = extract(year from current_date);
select pg_temp.login('treasurer@oceanagardens.test');
do $$ begin
  update budgets set status = 'draft' where community_id = '0cea0a00-0000-4000-8000-000000000001' and year = extract(year from current_date);
  raise exception 'FAIL: treasurer reopened an approved budget';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'only an administrator can reopen an approved budget');
rollback;

-- ---------------------------------------------------------------- topic proposers outside the block
begin;
select set_config('test.topic', (select id::text from meeting_topics where title = 'Electric car chargers in the garage'), true);
select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select topic_proposer_name(current_setting('test.topic')::uuid)) like '% _.', 'proposers from other blocks are shown as first name and initial');
reset role;
select pg_temp.login('admin@oceanagardens.test');
select pg_temp.check((select topic_proposer_name(current_setting('test.topic')::uuid)) not like '% _.', 'the office sees the full name');
rollback;

-- ---------------------------------------------------------------- holiday-let guests
begin;
select pg_temp.login('tenant7@oceanagardens.test');
select pg_temp.check((select is_limited_guest('0cea0a00-0000-4000-8000-000000000001')), 'a holiday-let tenant is a limited guest');
select pg_temp.check((select count(*) from block_directory('0cea0a00-0000-4000-8000-000000000001') d
                      where d.unit_id not in (select unit_id from tenancies where tenant_id = auth.uid())) = 0,
  'guests do not get the block member list (only their own flat)');
select pg_temp.check((select count(*) from documents) = 0, 'guests do not see community documents');
select pg_temp.check((select count(*) from info_pages) > 0, 'guests still see building information');
rollback;

-- ---------------------------------------------------------------- invitations need consent
begin;
select set_config('test.invitee', (select id::text from profiles where email = 'admin@demoheights.test'), true);
select pg_temp.login('admin@oceanagardens.test');
insert into community_invitations (community_id, profile_id, email, role, invited_by)
values ('0cea0a00-0000-4000-8000-000000000001', current_setting('test.invitee')::uuid, 'admin@demoheights.test', 'treasurer', auth.uid());
select pg_temp.check((select count(*) from profiles where id = current_setting('test.invitee')::uuid) = 0,
  'the office cannot read an invited person''s profile before they accept');
reset role;
select pg_temp.login('tenant1@oceanagardens.test');
do $$ begin
  insert into community_invitations (community_id, profile_id, email, role)
  values ('0cea0a00-0000-4000-8000-000000000001', auth.uid(), 'x@example.test', 'admin');
  raise exception 'FAIL: a resident created an invitation';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'residents cannot create invitations');
reset role;
select pg_temp.login('admin@demoheights.test');
select pg_temp.check((select count(*) from my_invitations('0cea0a00-0000-4000-8000-000000000001')) = 1, 'the invited person sees their invitation');
select pg_temp.check(not is_member('0cea0a00-0000-4000-8000-000000000001'), 'they are not a member until they accept');
select accept_invitation((select id from my_invitations('0cea0a00-0000-4000-8000-000000000001') limit 1));
select pg_temp.check(is_finance('0cea0a00-0000-4000-8000-000000000001'), 'accepting gives them the role they were invited to');
rollback;

\echo 'All security tests passed'
