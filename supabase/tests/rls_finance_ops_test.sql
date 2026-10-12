-- Finance operations (contracts, budgets, owner fees, levies, quotes): access rules and fee logic.
-- Run with:  psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -q -f supabase/tests/rls_finance_ops_test.sql
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

-- Unit ids are looked up as the superuser, before logging in.
create or replace function pg_temp.unit(p_label text) returns uuid language sql as $$
  select id from public.units where community_id = '0cea0a00-0000-4000-8000-000000000001' and label = p_label
$$;

-- ---------------------------------------------------------------- residents see no finance working data
begin;
select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select count(*) from contracts) = 0, 'tenant cannot read contracts');
select pg_temp.check((select count(*) from quotes) = 0, 'tenant cannot read quotes');
select pg_temp.check((select count(*) from budgets) = 0, 'tenant cannot read budgets');
select pg_temp.check((select count(*) from fee_schedules) = 0, 'tenant cannot read fee schedules');
select pg_temp.check((select count(*) from fee_reminders) = 0, 'tenant cannot read fee reminders');
select pg_temp.check((select count(*) from v_contract_key_dates) = 0, 'tenant sees nothing in the contract key dates view');
select pg_temp.check((select count(*) from v_unit_balance where charged_cents > 0) = 0, 'tenant sees no balances in v_unit_balance');
rollback;

begin;
select pg_temp.login('owner4@oceanagardens.test');
select pg_temp.check((select count(*) from contracts) = 0, 'owner cannot read contracts');
select pg_temp.check((select count(*) from quotes) = 0, 'owner cannot read quotes');
select pg_temp.check((select count(*) from fee_reminders) = 0, 'owner cannot read the reminder log');
do $$ begin
  insert into quotes (community_id, job_title, supplier_name, amount_cents)
  values ('0cea0a00-0000-4000-8000-000000000001', 'Sneaky quote', 'Me', 100);
  raise exception 'FAIL: owner added a quote';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'owner cannot add a quote');
with d as (delete from fee_payments where true returning 1)
select pg_temp.check(count(*) = 0, 'owner cannot delete their own fee payments') from d;
rollback;

-- ---------------------------------------------------------------- other community
begin;
select pg_temp.login('admin@demoheights.test');
select pg_temp.check((select count(*) from contracts where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0, 'other community admin cannot read Oceana contracts');
select pg_temp.check((select count(*) from quotes where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0, 'other community admin cannot read Oceana quotes');
select pg_temp.check((select count(*) from budgets where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0, 'other community admin cannot read Oceana budgets');
select pg_temp.check((select count(*) from levies where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0, 'other community admin cannot read Oceana levies');
rollback;

begin;
do $$ begin perform set_config('test.unit', pg_temp.unit('C-2C')::text, true); end $$;
select pg_temp.login('admin@demoheights.test');
do $$ begin
  perform send_fee_reminder(current_setting('test.unit')::uuid, null);
  raise exception 'FAIL: other community admin sent an Oceana reminder';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'other community admin cannot send an Oceana fee reminder');
do $$ begin
  insert into fee_payments (community_id, unit_id, paid_on, amount_cents)
  values ('0cea0a00-0000-4000-8000-000000000001', current_setting('test.unit')::uuid, current_date, 100);
  raise exception 'FAIL: other community admin recorded an Oceana payment';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'other community admin cannot record an Oceana payment');
rollback;

-- ---------------------------------------------------------------- fee reminders
begin;
do $$ begin perform set_config('test.unit', pg_temp.unit('B-2B')::text, true); end $$;
select pg_temp.login('tenant1@oceanagardens.test');
do $$ begin
  perform send_fee_reminder(current_setting('test.unit')::uuid, null);
  raise exception 'FAIL: tenant sent a fee reminder';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'tenant cannot send a fee reminder');
reset role;
select pg_temp.login('owner4@oceanagardens.test');
do $$ begin
  perform send_fee_reminder(current_setting('test.unit')::uuid, null);
  raise exception 'FAIL: owner sent a fee reminder';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'owner cannot send a fee reminder');
do $$ begin
  insert into notifications (community_id, profile_id, kind, title)
  select '0cea0a00-0000-4000-8000-000000000001', auth.uid(), 'fee_reminder', 'Fake';
  raise exception 'FAIL: member inserted a notification directly';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'members cannot write notifications directly');
rollback;

begin;
do $$ begin perform set_config('test.unit', pg_temp.unit('B-2B')::text, true); end $$;
do $$ begin perform set_config('test.paid_unit', pg_temp.unit('A-1A')::text, true); end $$;
do $$ begin perform set_config('test.owner', (select o.owner_id::text from unit_ownerships o where o.unit_id = pg_temp.unit('B-2B') limit 1), true); end $$;
select pg_temp.login('treasurer@oceanagardens.test');
select pg_temp.check(send_fee_reminder(current_setting('test.unit')::uuid, 'Please use reference CUOTA B-2B') = 1, 'treasurer sends a reminder to the one owner of B-2B');
select pg_temp.check((select count(*) from fee_reminders where unit_id = current_setting('test.unit')::uuid and channel = 'in_app'
  and note = 'Please use reference CUOTA B-2B') = 1, 'the reminder is logged with its note');
select pg_temp.check((select count(*) from notifications where profile_id <> auth.uid()) = 0, 'treasurer cannot read other people''s notifications');
do $$ begin
  perform send_fee_reminder(current_setting('test.paid_unit')::uuid, null);
  raise exception 'FAIL: reminder sent for a flat with nothing overdue';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'no reminder for a flat that is up to date');
reset role;
select pg_temp.check((select count(*) from notifications where profile_id = current_setting('test.owner')::uuid and kind = 'fee_reminder'
  and link = '/my-units' and body like 'Flat B-2B has €710.86%Please use reference CUOTA B-2B.%') = 1, 'the owner gets an in-app notification with the amount, the note and a link to My flat');
rollback;

-- ---------------------------------------------------------------- payments: allocation and removal
begin;
do $$ begin perform set_config('test.unit', pg_temp.unit('C-2C')::text, true); end $$;
select pg_temp.login('treasurer@oceanagardens.test');
insert into fee_payments (community_id, unit_id, paid_on, amount_cents, method, reference)
values ('0cea0a00-0000-4000-8000-000000000001', current_setting('test.unit')::uuid, current_date, 100000, 'bank_transfer', 'TEST');
select pg_temp.check((select status = 'paid' and paid_cents = amount_cents from fee_charges
  where unit_id = current_setting('test.unit')::uuid and period_label = '2026 Q3'), 'a payment pays the oldest open charge first');
select pg_temp.check((select status = 'partial' and paid_cents = 100000 - 71086 from fee_charges
  where unit_id = current_setting('test.unit')::uuid and period_label = '2026 Q4'), 'the rest of the payment part-pays the next charge');
select pg_temp.check((select count(*) from payment_allocations a join fee_payments p on p.id = a.payment_id where p.reference = 'TEST') = 2,
  'the payment is split into two allocations');
with d as (delete from fee_payments where reference = 'TEST' and unit_id = current_setting('test.unit')::uuid returning 1)
select pg_temp.check(count(*) = 1, 'treasurer can remove a payment recorded by mistake') from d;
select pg_temp.check((select bool_and(status = 'unpaid' and paid_cents = 0) from fee_charges
  where unit_id = current_setting('test.unit')::uuid and period_label in ('2026 Q3', '2026 Q4')), 'removing the payment re-opens the charges it paid');
select pg_temp.check((select count(*) from payment_allocations a where not exists (select 1 from fee_payments p where p.id = a.payment_id)) = 0,
  'no allocations are left behind');
select pg_temp.check((select overdue_cents from v_unit_balance where unit_id = current_setting('test.unit')::uuid) = 142172,
  'the flat''s overdue balance is back to what it was');
rollback;

begin;
do $$ begin perform set_config('test.unit', pg_temp.unit('A-2B')::text, true); end $$;
select pg_temp.login('treasurer@oceanagardens.test');
insert into fee_payments (community_id, unit_id, paid_on, amount_cents, reference)
values ('0cea0a00-0000-4000-8000-000000000001', current_setting('test.unit')::uuid, current_date, 100000, 'OVERPAY');
select pg_temp.check((select bool_and(status = 'paid') from fee_charges where unit_id = current_setting('test.unit')::uuid)
  and (select unallocated_cents from fee_payments where reference = 'OVERPAY')
      = 100000 - (select sum(a.amount_cents) from payment_allocations a join fee_payments p on p.id = a.payment_id where p.reference = 'OVERPAY'),
  'an overpayment pays every open charge, oldest first, and keeps the rest as credit');
rollback;

-- ---------------------------------------------------------------- schedules, levies, quotes, budgets
begin;
select pg_temp.login('treasurer@oceanagardens.test');
select pg_temp.check((select generate_fee_charges(id) from fee_schedules
  where community_id = '0cea0a00-0000-4000-8000-000000000001' and year = extract(year from current_date)::int) = 0,
  'generating charges again for this year adds nothing (idempotent)');
insert into fee_schedules (community_id, year, frequency, method, annual_total_cents)
values ('0cea0a00-0000-4000-8000-000000000001', 2099, 'quarterly', 'coefficient', 1000000);
select pg_temp.check((select generate_fee_charges(id) from fee_schedules where year = 2099) = 144, 'a new quarterly schedule creates 4 charges for each of the 36 flats');
select pg_temp.check((select abs(sum(amount_cents) - 1000000) < 100 from fee_charges fc join fee_schedules s on s.id = fc.schedule_id where s.year = 2099),
  'the charges add up to the yearly total (to within rounding)');
insert into levies (community_id, title, total_cents, due_date)
values ('0cea0a00-0000-4000-8000-000000000001', 'Test levy', 360000, current_date + 30);
select pg_temp.check((select allocate_levy(id) from levies where title = 'Test levy') = 36, 'a levy is split across all 36 flats');
select pg_temp.check((select allocate_levy(id) from levies where title = 'Test levy') = 0, 'splitting a levy twice adds nothing');
insert into quotes (community_id, job_title, supplier_name, amount_cents) values
  ('0cea0a00-0000-4000-8000-000000000001', 'Test job', 'A', 1000),
  ('0cea0a00-0000-4000-8000-000000000001', 'Test job', 'B', 900);
update quotes set chosen = (supplier_name = 'B') where job_title = 'Test job';
select pg_temp.check((select count(*) from quotes where job_title = 'Test job' and chosen) = 1, 'treasurer can choose one quote for a job');
insert into budgets (community_id, year, name) values ('0cea0a00-0000-4000-8000-000000000001', 2099, 'Budget 2099');
insert into budget_lines (community_id, budget_id, category_id, amount_cents)
select b.community_id, b.id, l.category_id, l.amount_cents from budget_lines l join budgets src on src.id = l.budget_id and src.year = extract(year from current_date)::int
  cross join budgets b where b.year = 2099 and b.community_id = src.community_id and src.community_id = '0cea0a00-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) from budget_lines l join budgets b on b.id = l.budget_id where b.year = 2099) = 9, 'treasurer can copy a budget into a new year');
select pg_temp.check((select count(*) from audit_log where table_name = 'quotes' and action = 'insert' and new_data ->> 'job_title' = 'Test job') = 2,
  'quotes are written to the audit log');
rollback;

begin;
select pg_temp.login('treasurer@oceanagardens.test');
do $$ begin
  insert into budgets (community_id, year, name) values ('0cea0a00-0000-4000-8000-000000000001', extract(year from current_date)::int, 'Duplicate');
  raise exception 'FAIL: two budgets for the same year';
exception when unique_violation then null;
end $$;
select pg_temp.check(true, 'only one budget per year');
rollback;

-- ---------------------------------------------------------------- approved budgets are locked
begin;
select pg_temp.login('treasurer@oceanagardens.test');
do $$ begin
  update budget_lines set amount_cents = amount_cents + 100
  where budget_id = (select id from budgets where community_id = '0cea0a00-0000-4000-8000-000000000001' and year = extract(year from current_date)::int);
  raise exception 'FAIL: changed a line of an approved budget';
exception when check_violation then null;
end $$;
select pg_temp.check(true, 'lines of an approved budget cannot be changed');
do $$ begin
  delete from budget_lines
  where budget_id = (select id from budgets where community_id = '0cea0a00-0000-4000-8000-000000000001' and year = extract(year from current_date)::int);
  raise exception 'FAIL: removed a line of an approved budget';
exception when check_violation then null;
end $$;
select pg_temp.check(true, 'lines of an approved budget cannot be removed');
insert into budgets (community_id, year, name) values ('0cea0a00-0000-4000-8000-000000000001', 2099, 'Budget 2099');
insert into budget_lines (community_id, budget_id, category_id, amount_cents)
select b.community_id, b.id, c.id, 1000 from budgets b
  cross join (select id from expense_categories where community_id = '0cea0a00-0000-4000-8000-000000000001' limit 1) c
  where b.year = 2099 and b.community_id = '0cea0a00-0000-4000-8000-000000000001';
update budget_lines set amount_cents = 2000 where budget_id = (select id from budgets where year = 2099 and community_id = '0cea0a00-0000-4000-8000-000000000001');
select pg_temp.check((select amount_cents from budget_lines where budget_id = (select id from budgets where year = 2099 and community_id = '0cea0a00-0000-4000-8000-000000000001')) = 2000,
  'lines of a draft budget can be edited');
update budgets set status = 'approved' where year = 2099 and community_id = '0cea0a00-0000-4000-8000-000000000001';
delete from budgets where year = 2099 and community_id = '0cea0a00-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) from budget_lines bl where not exists (select 1 from budgets b where b.id = bl.budget_id)) = 0,
  'deleting a whole approved budget still removes its lines');
rollback;
