-- Finance core: access and business-rule tests for invoices, approvals, disputes, supplier reports,
-- invoice attachments and the audit log. Run with:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -q -f supabase/tests/rls_finance_core_test.sql
-- Each check raises an exception on failure; the script stops at the first failure. Everything is rolled back.
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

-- ---------------------------------------------------------------- residents see nothing of finance
begin;
select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select count(*) from v_invoice_list) = 0, 'tenant cannot read the invoice list');
select pg_temp.check((select count(*) from v_supplier_spend) = 0, 'tenant cannot read supplier spend');
select pg_temp.check((select count(*) from invoice_approvals) = 0, 'tenant cannot read invoice approvals');
select pg_temp.check((select count(*) from audit_log) = 0, 'tenant cannot read the audit log');
select pg_temp.check((select count(*) from audit_log_actors('0cea0a00-0000-4000-8000-000000000001')) = 0, 'tenant gets no audit log people');
select pg_temp.check((select count(*) from supplier_reports((select id from suppliers limit 1))) = 0, 'tenant gets no supplier reports');
do $$ begin
  perform approve_invoice((select id from public.invoices limit 1));
  raise exception 'FAIL: tenant approved an invoice';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'tenant cannot approve invoices');
rollback;

begin;
select pg_temp.login('owner4@oceanagardens.test');
select pg_temp.check((select count(*) from v_invoice_list) = 0, 'owner cannot read the invoice list');
select pg_temp.check((select count(*) from audit_log) = 0, 'owner cannot read the audit log');
select pg_temp.check((select count(*) from audit_log_actors('0cea0a00-0000-4000-8000-000000000001')) = 0, 'owner gets no audit log people');
select pg_temp.check((select count(*) from suppliers) = 0, 'owner cannot read suppliers (bank details)');
select pg_temp.check((select count(*) from invoices) = 0, 'owner cannot read invoices');
rollback;

begin;
select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select count(*) from suppliers) = 0, 'tenant cannot read suppliers (bank details)');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'finance') = 0, 'tenant cannot list finance files');
rollback;

-- Another community's admin cannot approve an Oceana invoice through the RPC.
begin;
select set_config('test.inv', (select id::text from invoices where invoice_number = 'RR-1229'), true);
select pg_temp.login('admin@demoheights.test');
do $$ begin
  perform approve_invoice(current_setting('test.inv')::uuid);
  raise exception 'FAIL: another community approved an Oceana invoice';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'another community''s admin cannot approve an Oceana invoice');
rollback;

-- ---------------------------------------------------------------- other community
begin;
select pg_temp.login('admin@demoheights.test');
select pg_temp.check((select count(*) from v_invoice_list where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0,
  'another community''s admin cannot read Oceana invoices');
select pg_temp.check((select count(*) from audit_log where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0,
  'another community''s admin cannot read the Oceana audit log');
select pg_temp.check((select count(*) from audit_log_actors('0cea0a00-0000-4000-8000-000000000001')) = 0,
  'another community''s admin gets no Oceana audit log people');
select pg_temp.check((select count(*) from supplier_reports('00000000-0000-0000-0000-000000000000')) = 0, 'unknown supplier returns nothing');
rollback;

begin;
select set_config('test.pool', (select id::text from suppliers where name = 'AquaClear Piscinas'), true);
select pg_temp.login('admin@demoheights.test');
select pg_temp.check((select count(*) from supplier_reports(current_setting('test.pool')::uuid)) = 0,
  'another community''s admin gets no reports about an Oceana supplier');
rollback;

-- ---------------------------------------------------------------- treasurer: supplier reports
begin;
select pg_temp.login('treasurer@oceanagardens.test');
select pg_temp.check((select count(*) from complaints where target_supplier_id is not null and reporter_id <> auth.uid()) = 0,
  'treasurer cannot read residents'' complaints directly');
select pg_temp.check((select count(*) from supplier_reports((select id from suppliers where name = 'LimpiaMax Servicios'))) = 2,
  'treasurer sees the reports about a supplier (title and status only)');
select pg_temp.check((select iban_masked(s) from suppliers s where name = 'Fontanería Benítez') = 'ES•• •••• 4567',
  'the masked IBAN shows only the country and the last four characters');
rollback;

-- ---------------------------------------------------------------- approvals follow the amount
-- RR-1229 (over the threshold) has one approval from the treasurer.
begin;
select pg_temp.login('admin@oceanagardens.test');
update invoices set net_cents = net_cents + 10000 where invoice_number = 'RR-1229';
select pg_temp.check((select count(*) from invoice_approvals a join invoices i on i.id = a.invoice_id where i.invoice_number = 'RR-1229') = 0,
  'changing the amount of a received invoice clears its approvals');
select pg_temp.check((select approve_invoice(id) from invoices where invoice_number = 'RR-1229') = 'received',
  'after the change a single approval is no longer enough');
update invoices set notes = 'Roof waterproofing Block C, phase 1' where invoice_number = 'RR-1229';
select pg_temp.check((select count(*) from invoice_approvals a join invoices i on i.id = a.invoice_id where i.invoice_number = 'RR-1229') = 1,
  'editing the description keeps approvals');
rollback;

-- An approved invoice whose amount changes goes back to received.
begin;
select set_config('test.inv', (select id::text from invoices where status = 'approved' and community_id = '0cea0a00-0000-4000-8000-000000000001' limit 1), true);
select pg_temp.login('treasurer@oceanagardens.test');
update invoices set vat_cents = vat_cents + 100 where id = current_setting('test.inv')::uuid;
select pg_temp.check((select status from invoices where id = current_setting('test.inv')::uuid) = 'received',
  'an approved invoice returns to received when its VAT changes');
select pg_temp.check((select count(*) from invoice_approvals where invoice_id = current_setting('test.inv')::uuid) = 0,
  'and its approvals are cleared');
select pg_temp.check((select count(*) from audit_log where table_name = 'invoice_approvals' and action = 'delete'
                      and old_data ->> 'invoice_id' = current_setting('test.inv')) >= 1, 'cleared approvals are in the audit log');
rollback;

-- Paying in the same statement as an amount change is not possible.
begin;
select set_config('test.inv', (select id::text from invoices where status = 'approved' and community_id = '0cea0a00-0000-4000-8000-000000000001' limit 1), true);
select pg_temp.login('treasurer@oceanagardens.test');
update invoices set status = 'paid', net_cents = net_cents * 3 where id = current_setting('test.inv')::uuid;
select pg_temp.check((select status from invoices where id = current_setting('test.inv')::uuid) = 'received',
  'changing the amount while marking paid sends the invoice back for approval');
rollback;

-- Paid invoices keep their approvals (corrections after payment are audited, not re-approved).
begin;
select set_config('test.inv', (select id::text from invoices where status = 'paid' and community_id = '0cea0a00-0000-4000-8000-000000000001' limit 1), true);
select pg_temp.login('treasurer@oceanagardens.test');
update invoices set vat_cents = vat_cents + 1 where id = current_setting('test.inv')::uuid;
select pg_temp.check((select status from invoices where id = current_setting('test.inv')::uuid) = 'paid', 'a paid invoice stays paid');
select pg_temp.check((select count(*) from invoice_approvals where invoice_id = current_setting('test.inv')::uuid) >= 1, 'a paid invoice keeps its approvals');
rollback;

-- ---------------------------------------------------------------- disputes
begin;
select pg_temp.login('treasurer@oceanagardens.test');
update invoices set status = 'disputed', dispute_reason = 'Pump seal was replaced under warranty last year.' where invoice_number = 'RR-1215';
select pg_temp.check((select dispute_reason from invoices where invoice_number = 'RR-1215') like 'Pump seal%', 'treasurer can dispute an invoice with a reason');
select pg_temp.check((select new_data ->> 'dispute_reason' from audit_log where table_name = 'invoices' and action = 'update'
                      and new_data ->> 'invoice_number' = 'RR-1215' order by id desc limit 1) like 'Pump seal%', 'the dispute reason is in the audit log');
update invoices set status = 'received', dispute_reason = null where invoice_number = 'RR-1215';
select pg_temp.check((select status from invoices where invoice_number = 'RR-1215') = 'received', 'a dispute can be reopened');
do $$ begin
  update invoices set dispute_reason = repeat('x', 1001) where invoice_number = 'RR-1215';
  raise exception 'FAIL: overlong dispute reason accepted';
exception when check_violation then null;
end $$;
select pg_temp.check(true, 'dispute reasons are limited to 1000 characters');
rollback;

-- Disputed invoices cannot be paid without the approvals.
begin;
select pg_temp.login('treasurer@oceanagardens.test');
do $$ begin
  update invoices set status = 'paid' where invoice_number = 'LM-EXTRA-77';
  raise exception 'FAIL: unapproved disputed invoice was paid';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'an unapproved invoice cannot be marked paid');
rollback;

-- ---------------------------------------------------------------- residents cannot write finance tables
begin;
select pg_temp.login('owner1@oceanagardens.test');
do $$ begin
  update invoices set status = 'paid' where invoice_number = 'RR-1215';
  if found then raise exception 'FAIL: owner changed an invoice'; end if;
end $$;
select pg_temp.check(true, 'an owner cannot change an invoice');
do $$ begin
  insert into suppliers (community_id, name, service_type) values ('0cea0a00-0000-4000-8000-000000000001', 'Fake supplier', 'Other');
  raise exception 'FAIL: owner added a supplier';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'an owner cannot add a supplier');
do $$ begin
  insert into audit_log (community_id, table_name, action) values ('0cea0a00-0000-4000-8000-000000000001', 'invoices', 'update');
  raise exception 'FAIL: audit log written directly';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'nobody can write the audit log directly');
rollback;

begin;
select pg_temp.login('treasurer@oceanagardens.test');
do $$ begin
  delete from audit_log where community_id = '0cea0a00-0000-4000-8000-000000000001';
  if found then raise exception 'FAIL: treasurer deleted audit rows'; end if;
end $$;
select pg_temp.check((select count(*) from audit_log) > 0, 'the audit log cannot be deleted by finance users');
insert into suppliers (community_id, name, service_type, phone) values ('0cea0a00-0000-4000-8000-000000000001', 'Test Fontanería', 'Plumbing', '+34 600 000 000');
select pg_temp.check((select actor = auth.uid() from audit_log where table_name = 'suppliers' and new_data ->> 'name' = 'Test Fontanería'),
  'a new supplier is audited with the person who added it');
select pg_temp.check((select count(*) from audit_log_actors('0cea0a00-0000-4000-8000-000000000001') where actor = auth.uid()) = 1,
  'finance users see who appears in their audit log');
rollback;

-- ---------------------------------------------------------------- invoice attachments
begin;
insert into storage.objects (bucket_id, name) values
  ('finance', '0cea0a00-0000-4000-8000-000000000001/invoices/00000000-0000-4000-8000-000000000000-test.pdf'),
  ('finance', '0cea0a00-0000-4000-8000-000000000001/contracts/00000000-0000-4000-8000-000000000000-test.pdf');
set local storage.allow_delete_query = 'true';
select pg_temp.login('tenant1@oceanagardens.test');
do $$ begin
  delete from storage.objects where bucket_id = 'finance';
  if found then raise exception 'FAIL: tenant deleted finance files'; end if;
end $$;
select pg_temp.check(true, 'residents cannot delete finance files');
rollback;

begin;
insert into storage.objects (bucket_id, name) values
  ('finance', '0cea0a00-0000-4000-8000-000000000001/invoices/00000000-0000-4000-8000-000000000000-test.pdf'),
  ('finance', '0cea0a00-0000-4000-8000-000000000001/contracts/00000000-0000-4000-8000-000000000000-test.pdf');
set local storage.allow_delete_query = 'true';
select pg_temp.login('admin@demoheights.test');
do $$ begin
  delete from storage.objects where bucket_id = 'finance' and name like '0cea0a00-%';
  if found then raise exception 'FAIL: another community deleted Oceana finance files'; end if;
end $$;
select pg_temp.check(true, 'another community cannot delete Oceana finance files');
rollback;

-- (finance_ops adds its own delete policy for contracts/ and quotes/; "statements/" is covered by neither.)
begin;
insert into storage.objects (bucket_id, name) values
  ('finance', '0cea0a00-0000-4000-8000-000000000001/invoices/00000000-0000-4000-8000-000000000000-test.pdf'),
  ('finance', '0cea0a00-0000-4000-8000-000000000001/statements/00000000-0000-4000-8000-000000000000-test.pdf');
set local storage.allow_delete_query = 'true';
select pg_temp.login('treasurer@oceanagardens.test');
delete from storage.objects where bucket_id = 'finance' and name like '%-test.pdf';
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'finance' and name like '%/invoices/%-test.pdf') = 0,
  'finance users can delete invoice attachments');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'finance' and name like '%/statements/%-test.pdf') = 1,
  'but not files in other finance folders');
rollback;

\echo 'finance core tests passed'
