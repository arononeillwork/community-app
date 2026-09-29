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
reset role; select pg_temp.login('tenant1@oceanagardens.test');
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
reset role; select pg_temp.login('tenant1@oceanagardens.test');
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
reset role; select pg_temp.login('tenant2@oceanagardens.test');
insert into complaints (community_id, kind, title, description, status)
values ('0cea0a00-0000-4000-8000-000000000001', 'incident', 'Test leak', 'Water on the stairs', 'resolved');
select pg_temp.check((select status from complaints where title = 'Test leak') = 'new', 'reported incident starts as new regardless of input');
rollback;

-- ---------------------------------------------------------------- owner
begin;
reset role; select pg_temp.login('owner4@oceanagardens.test');
select pg_temp.check((select count(*) from fee_charges) > 0, 'owner sees their own charges');
select pg_temp.check((select bool_and(owns_unit(unit_id)) from fee_charges), 'owner sees only charges for their units');
select pg_temp.check((select count(*) from invoices) = 0, 'owner cannot read invoices');
select pg_temp.check((select count(*) from documents where visibility = 'owners') = 1, 'owner sees owner-only documents');
select pg_temp.check((select count(*) from documents where visibility = 'admins') = 0, 'owner cannot see admin documents');
rollback;

-- owner can add a tenant to their own unit, but not to someone else's
begin;
select set_config('test.t8', (select id::text from profiles where email = 'tenant8@oceanagardens.test'), true);
reset role; select pg_temp.login('owner4@oceanagardens.test');
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
reset role; select pg_temp.login('tenant3@oceanagardens.test');
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
reset role; select pg_temp.login('treasurer@oceanagardens.test');
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
reset role; select pg_temp.login('treasurer@oceanagardens.test');
select pg_temp.check((select approve_invoice(id) from invoices where invoice_number = 'RR-1229') = 'received', 'first approval (treasurer) leaves the large invoice waiting');
select pg_temp.check((select approve_invoice(id) from invoices where invoice_number = 'RR-1229') = 'received', 'approving twice does not count twice');
reset role; select pg_temp.login('admin@oceanagardens.test');
select pg_temp.check((select approve_invoice(id) from invoices where invoice_number = 'RR-1229') = 'approved', 'second approval (admin) approves the large invoice');
select pg_temp.check((select count(*) from audit_log where table_name = 'invoices' and new_data ->> 'invoice_number' = 'RR-1229' and action = 'update') = 1,
  'approval is written to the audit log');
rollback;

-- ---------------------------------------------------------------- fee allocation
begin;
reset role; select pg_temp.login('treasurer@oceanagardens.test');
insert into fee_payments (community_id, unit_id, paid_on, amount_cents)
select community_id, unit_id, current_date, overdue_cents from v_unit_balance where label = 'C-2C';
select pg_temp.check((select overdue_cents from v_unit_balance where label = 'C-2C') = 0, 'payment is allocated to the oldest open charges and clears arrears');
rollback;

-- ---------------------------------------------------------------- cross-community
begin;
reset role; select pg_temp.login('admin@demoheights.test');
select pg_temp.check((select count(*) from units) = 2, 'Demo Heights admin only sees own units');
select pg_temp.check((select count(*) from complaints) = 0, 'Demo Heights admin sees no Oceana complaints');
select pg_temp.check((select count(*) from directory('0cea0a00-0000-4000-8000-000000000001')) = 0, 'Demo Heights admin cannot read Oceana directory');
rollback;

-- ---------------------------------------------------------------- profiles (own name/phone only)
begin;
reset role; select pg_temp.login('tenant1@oceanagardens.test');
update profiles set full_name = 'Renamed Tenant', phone = '+34 600 000 000' where id = auth.uid();
select pg_temp.check((select full_name from profiles where id = auth.uid()) = 'Renamed Tenant', 'member can update their own name and phone');
do $$ begin
  update profiles set is_platform_admin = true where id = auth.uid();
  raise exception 'FAIL: member made themselves platform admin';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'member cannot make themselves platform admin');
do $$ begin
  update profiles set email = 'someone@else.test' where id = auth.uid();
  raise exception 'FAIL: member changed their profile email';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'member cannot change the email on their profile');
update profiles set full_name = 'Hacked' where email = 'owner1@oceanagardens.test';
select pg_temp.check((select count(*) from profiles where full_name = 'Hacked') = 0, 'member cannot rename someone else');
rollback;

-- ---------------------------------------------------------------- topic proposer names
begin;
reset role; select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select count(*) from v_meeting_topics where proposed_by is not null) > 0
  and (select count(*) from v_meeting_topics where proposed_by is not null and proposed_by_name is null) = 0,
  'members see who proposed each topic');
rollback;
begin;
reset role; select pg_temp.login('admin@demoheights.test');
select pg_temp.check((select member_name(proposed_by, community_id) from meeting_topics where community_id = '0cea0a00-0000-4000-8000-000000000001' and proposed_by is not null limit 1) is null,
  'member_name() hides names from other communities');
rollback;

-- ---------------------------------------------------------------- tenancies: reopen + tenant names
begin;
reset role; select pg_temp.login('treasurer@oceanagardens.test');
select pg_temp.check((select count(*) from unit_tenant_names((select unit_id from tenancies t join profiles p on p.id = t.tenant_id where p.email = 'tenant1@oceanagardens.test' limit 1))) >= 1,
  'owner sees the names of their flat''s tenants');
update tenancies set status = 'ended', end_date = greatest(start_date, current_date)
where tenant_id = (select id from profiles where email = 'tenant1@oceanagardens.test');
do $$ begin
  update tenancies set status = 'active', end_date = null
  where tenant_id = (select id from profiles where email = 'tenant1@oceanagardens.test');
  raise exception 'FAIL: owner reopened an ended tenancy';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'owner cannot reopen an ended tenancy');
rollback;
begin;
reset role; select pg_temp.login('owner1@oceanagardens.test');
select pg_temp.check((select count(*) from unit_tenant_names((select unit_id from tenancies t join profiles p on p.id = t.tenant_id where p.email = 'tenant1@oceanagardens.test' limit 1)))
  = case when exists (select 1 from unit_ownerships o join tenancies t on t.unit_id = o.unit_id join profiles p on p.id = t.tenant_id
                      where p.email = 'tenant1@oceanagardens.test' and o.owner_id = auth.uid()) then 1 else 0 end,
  'unit_tenant_names() returns nothing for other owners'' flats');
rollback;

-- ---------------------------------------------------------------- treasurer reads owner names
begin;
reset role; select pg_temp.login('treasurer@oceanagardens.test');
select pg_temp.check((select count(*) from v_unit_balance where community_id = '0cea0a00-0000-4000-8000-000000000001' and owner_names is null) = 0,
  'treasurer sees owner names on every flat balance');
select pg_temp.check((select count(*) from profiles p where p.email = 'admin@demoheights.test') = 0, 'treasurer cannot read other communities'' profiles');
rollback;
begin;
reset role; select pg_temp.login('owner4@oceanagardens.test');
select pg_temp.check((select count(*) from profiles) = 1, 'owner still only reads their own profile');
rollback;

-- ---------------------------------------------------------------- quotes
begin;
reset role; select pg_temp.login('treasurer@oceanagardens.test');
select choose_quote(id) from quotes where supplier_name = 'Cubiertas Andalucía';
select pg_temp.check((select count(*) from quotes where job_title = 'Roof waterproofing Block C' and chosen) = 1
  and (select chosen from quotes where supplier_name = 'Cubiertas Andalucía'), 'choose_quote() marks exactly one quote chosen');
rollback;
begin;
select set_config('test.q', (select id::text from quotes where supplier_name = 'Cubiertas Andalucía'), true);
reset role; select pg_temp.login('owner4@oceanagardens.test');
do $$ begin
  perform choose_quote(current_setting('test.q')::uuid);
  raise exception 'FAIL: owner chose a quote';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'only finance roles can choose a quote');
rollback;

-- ---------------------------------------------------------------- fee credit + zero charges
begin;
reset role; select pg_temp.login('treasurer@oceanagardens.test');
-- Overpay A-1A by 100 € so it holds credit, then raise a levy: the credit pays towards it.
insert into fee_payments (community_id, unit_id, paid_on, amount_cents)
select community_id, unit_id, current_date, (charged_cents - paid_cents) + 10000 from v_unit_balance where label = 'A-1A';
select pg_temp.check((select sum(unallocated_cents) from fee_payments p join units u on u.id = p.unit_id where u.label = 'A-1A') = 10000, 'overpayment becomes credit');
insert into levies (community_id, title, total_cents, due_date) values ('0cea0a00-0000-4000-8000-000000000001', 'Test levy', 1000000, current_date + 60);
select pg_temp.check((select allocate_levy(id) from levies where title = 'Test levy') = 36, 'a levy is charged to every flat');
select pg_temp.check((select sum(unallocated_cents) from fee_payments p join units u on u.id = p.unit_id where u.label = 'A-1A') = 0
  and (select paid_cents from fee_charges fc join units u on u.id = fc.unit_id join levies l on l.id = fc.levy_id where u.label = 'A-1A' and l.title = 'Test levy') = 10000,
  'existing credit is applied to a new levy');
-- A 0-cent charge must not block payments.
insert into fee_charges (community_id, unit_id, levy_id, period_label, due_date, amount_cents)
select community_id, id, (select id from levies where title = 'Test levy'), 'Zero', current_date - 400, 0 from units where label = 'B-1A';
insert into fee_payments (community_id, unit_id, paid_on, amount_cents) select community_id, id, current_date, 500 from units where label = 'B-1A';
select pg_temp.check(true, 'a 0-cent charge does not block payments');
rollback;

-- ---------------------------------------------------------------- storage follows document visibility
begin;
insert into storage.objects (bucket_id, name) values ('documents', '0cea0a00-0000-4000-8000-000000000001/rls-test-owners.pdf');
insert into documents (community_id, title, storage_path, visibility)
values ('0cea0a00-0000-4000-8000-000000000001', 'RLS test owners file', '0cea0a00-0000-4000-8000-000000000001/rls-test-owners.pdf', 'owners');
reset role; select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select count(*) from storage.objects where name like '%rls-test-owners.pdf') = 0, 'tenant cannot read an owners-only file from storage');
reset role; select pg_temp.login('owner4@oceanagardens.test');
select pg_temp.check((select count(*) from storage.objects where name like '%rls-test-owners.pdf') = 1, 'owner can read an owners-only file from storage');
reset role; select pg_temp.login('admin@demoheights.test');
select pg_temp.check((select count(*) from storage.objects where name like '%rls-test-owners.pdf') = 0, 'other community cannot read the file');
rollback;

-- ---------------------------------------------------------------- meetings.updated_at
begin;
reset role; select pg_temp.login('admin@oceanagardens.test');
update meetings set updated_at = now() - interval '1 day' where id = (select id from meetings limit 1);
update meetings set title = title || ' (edited)' where id = (select id from meetings order by updated_at limit 1);
select pg_temp.check((select count(*) from meetings where title like '% (edited)' and updated_at >= now() - interval '1 minute') = 1, 'editing a meeting updates updated_at');
rollback;

\echo 'All RLS tests passed'
