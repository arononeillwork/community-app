-- Row Level Security + business-rule tests. Run with:  npm run db:test
-- Each check raises an exception on failure; the script stops at the first failure.
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

-- ---------------------------------------------------------------- anonymous
begin;
set local role anon;
select pg_temp.check((select count(*) from communities) = 2, 'anon can read communities for landing pages');
select pg_temp.check((select count(*) from community_public_info) = 2, 'anon can read public info');
select pg_temp.check((select count(*) from invoices) = 0, 'anon cannot read invoices');
select pg_temp.check((select count(*) from profiles) = 0, 'anon cannot read profiles');
rollback;

-- ---------------------------------------------------------------- tenant
begin;
select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select count(*) from invoices) = 0, 'tenant cannot read invoices');
select pg_temp.check((select count(*) from fee_charges) = 0, 'tenant cannot read fee charges');
select pg_temp.check((select count(*) from suppliers) = 0, 'tenant cannot read suppliers (IBANs)');
select pg_temp.check((select count(*) from audit_log) = 0, 'tenant cannot read audit log');
select pg_temp.check((select count(*) from bin_schedules) = 5, 'tenant can read bin schedules');
select pg_temp.check((select count(*) from documents where visibility = 'admins') = 0, 'tenant cannot see admin-only documents');
select pg_temp.check((select count(*) from documents where visibility = 'owners') = 0, 'tenant cannot see owner-only documents');
select pg_temp.check((select count(*) from community_spend_summary('0cea0a00-0000-4000-8000-000000000001')) = 9, 'tenant can see aggregate "where the money goes"');
select pg_temp.check((select count(*) from directory('0cea0a00-0000-4000-8000-000000000001') where is_my_owner and (email is not null)) = 1,
  'tenant sees their own landlord''s contact details');
select pg_temp.check((select count(*) from contact_preferences where profile_id <> auth.uid()) = 0, 'tenant cannot read other people''s contact preferences');
select pg_temp.check((select count(*) from complaints) = (select count(*) from complaints where reporter_id = auth.uid()),
  'tenant only sees their own complaints');
select pg_temp.check((select count(*) from communities c join memberships m on m.community_id = c.id) >= 1, 'tenant sees own membership');
rollback;

-- tenant cannot change a complaint status
begin;
select pg_temp.login('tenant1@oceanagardens.test');
do $$ begin
  update complaints set status = 'resolved' where reporter_id = auth.uid();
  if found then raise exception 'FAIL: tenant changed complaint status'; end if;
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'tenant cannot change complaint status');
rollback;

-- tenant can report an incident; status forced to new
begin;
select pg_temp.login('tenant2@oceanagardens.test');
insert into complaints (community_id, kind, title, description, status)
values ('0cea0a00-0000-4000-8000-000000000001', 'incident', 'Test leak', 'Water on the stairs', 'resolved');
select pg_temp.check((select status from complaints where title = 'Test leak') = 'new', 'reported incident starts as new regardless of input');
rollback;

-- ---------------------------------------------------------------- owner
begin;
select pg_temp.login('owner4@oceanagardens.test');
select pg_temp.check((select count(*) from fee_charges) > 0, 'owner sees their own charges');
select pg_temp.check((select bool_and(owns_unit(unit_id)) from fee_charges), 'owner sees only charges for their units');
select pg_temp.check((select count(*) from invoices) = 0, 'owner cannot read invoices');
select pg_temp.check((select count(*) from documents where visibility = 'owners') = 1, 'owner sees owner-only documents');
select pg_temp.check((select count(*) from documents where visibility = 'admins') = 0, 'owner cannot see admin documents');
rollback;

-- owner can add a tenant to their own unit, but not to someone else's
begin;
select set_config('test.t8', (select id::text from profiles where email = 'tenant8@oceanagardens.test'), true);
select pg_temp.login('owner4@oceanagardens.test');
insert into tenancies (community_id, unit_id, tenant_id, tenancy_type, end_date)
select '0cea0a00-0000-4000-8000-000000000001', o.unit_id, current_setting('test.t8')::uuid, 'long_term', current_date + 100
from unit_ownerships o where o.owner_id = auth.uid() limit 1;
select pg_temp.check((select count(*) from tenancies where added_by = auth.uid() and status = 'active') >= 1, 'owner can add an active tenant to own unit');
do $$ begin
  insert into tenancies (community_id, unit_id, tenant_id)
  select '0cea0a00-0000-4000-8000-000000000001', o.unit_id, current_setting('test.t8')::uuid
  from unit_ownerships o where o.owner_id <> auth.uid() limit 1;
  raise exception 'FAIL: owner added tenant to another unit';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'owner cannot add a tenant to another owner''s unit');
rollback;

-- ---------------------------------------------------------------- topics + votes
begin;
select pg_temp.login('tenant3@oceanagardens.test');
insert into meeting_topics (community_id, title) values ('0cea0a00-0000-4000-8000-000000000001', 'More benches in the garden');
insert into topic_votes (topic_id, community_id) select id, community_id from meeting_topics where title = 'More benches in the garden';
select pg_temp.check((select votes from v_meeting_topics where title = 'More benches in the garden') = 1, 'member can propose and upvote a topic');
do $$ begin
  insert into topic_votes (topic_id, community_id) select id, community_id from meeting_topics where title = 'More benches in the garden';
  raise exception 'FAIL: double vote allowed';
exception when unique_violation then null;
end $$;
select pg_temp.check(true, 'a member can only vote once per topic');
do $$ begin
  update meeting_topics set status = 'on_agenda' where title = 'More benches in the garden';
  raise exception 'FAIL: member changed topic status';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'only admins can put a topic on the agenda');
rollback;

-- ---------------------------------------------------------------- treasurer + approvals
begin;
select pg_temp.login('treasurer@oceanagardens.test');
select pg_temp.check((select count(*) from invoices) > 80, 'treasurer reads Oceana invoices');
select pg_temp.check((select count(*) from invoices where invoice_number = 'DEMO-001') = 0, 'treasurer cannot see other community invoices');
do $$ begin
  update invoices set status = 'approved' where invoice_number = 'RR-1229';
  raise exception 'FAIL: large invoice approved with one approval';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'invoice over threshold cannot be approved with a single approval');
rollback;

begin;
select pg_temp.login('admin@oceanagardens.test');
select pg_temp.check((select approve_invoice(id) from invoices where invoice_number = 'RR-1229') = 'approved', 'second approval (admin) approves the large invoice');
select pg_temp.check((select count(*) from audit_log where table_name = 'invoices' and new_data ->> 'invoice_number' = 'RR-1229' and action = 'update') = 1,
  'approval is written to the audit log');
rollback;

-- ---------------------------------------------------------------- fee allocation
begin;
select pg_temp.login('treasurer@oceanagardens.test');
insert into fee_payments (community_id, unit_id, paid_on, amount_cents)
select community_id, unit_id, current_date, overdue_cents from v_unit_balance where label = 'C-2C';
select pg_temp.check((select overdue_cents from v_unit_balance where label = 'C-2C') = 0, 'payment is allocated to the oldest open charges and clears arrears');
rollback;

-- ---------------------------------------------------------------- cross-community
begin;
select pg_temp.login('admin@demoheights.test');
select pg_temp.check((select count(*) from units) = 2, 'Demo Heights admin only sees own units');
select pg_temp.check((select count(*) from complaints) = 0, 'Demo Heights admin sees no Oceana complaints');
select pg_temp.check((select count(*) from directory('0cea0a00-0000-4000-8000-000000000001')) = 0, 'Demo Heights admin cannot read Oceana directory');
rollback;

\echo 'All RLS tests passed'
