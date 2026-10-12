-- Finance core sample data for Oceana Gardens: a plumber called out for a leak, with an invoice that went
-- through the full approval workflow and a new one waiting for approval. The steps are done as the
-- treasurer and the administrator, so the audit log shows who did what (seed.sql rows have no actor).
-- Safe to run more than once: nothing is added if the supplier already exists.

do $$
declare
  oc uuid := '0cea0a00-0000-4000-8000-000000000001';
  treasurer uuid := (select id from auth.users where email = 'treasurer@oceanagardens.test');
  admin uuid := (select id from auth.users where email = 'admin@oceanagardens.test');
  repairs uuid := (select id from public.expense_categories where community_id = oc and name = 'Repairs & maintenance');
  plumber uuid;
  inv uuid;
  mark bigint;
begin
  if treasurer is null or admin is null or repairs is null
     or exists (select 1 from public.suppliers where community_id = oc and name = 'Fontanería Benítez') then
    return;
  end if;

  -- Act as a signed-in user so the audit trigger records the actor.
  perform set_config('request.jwt.claims', json_build_object('sub', treasurer, 'role', 'authenticated')::text, true);
  select coalesce(max(id), 0) into mark from public.audit_log;

  insert into public.suppliers (community_id, name, service_type, tax_id, contact_name, email, phone, iban, notes, created_at)
  values (oc, 'Fontanería Benítez', 'Plumbing', 'B29000010', 'Rafael Benítez', 'rafael@fontaneriabenitez.test', '+34 952 100 010',
          'ES9820383015423500084567', 'Available for emergency call-outs at weekends. Ask for Rafael.', now() - interval '41 days')
  returning id into plumber;
  update public.audit_log set at = now() - interval '41 days' where id > mark;
  select max(id) into mark from public.audit_log;

  -- Leak in the Block B riser: received, approved by the administrator, then paid by the treasurer.
  insert into public.invoices (community_id, supplier_id, category_id, invoice_number, issue_date, due_date,
                               net_cents, vat_cents, notes, created_by, created_at)
  values (oc, plumber, repairs, 'FB-2026-118', current_date - 34, current_date - 4, 64000, 13440,
          'Burst riser pipe in Block B, emergency call-out on a Sunday.', treasurer, now() - interval '33 days')
  returning id into inv;
  update public.audit_log set at = now() - interval '33 days' where id > mark;
  select max(id) into mark from public.audit_log;

  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  insert into public.invoice_approvals (community_id, invoice_id, approver_id, approved_at)
  values (oc, inv, admin, now() - interval '31 days');
  update public.invoices set status = 'approved' where id = inv;
  update public.audit_log set at = now() - interval '31 days' where id > mark;
  select max(id) into mark from public.audit_log;

  perform set_config('request.jwt.claims', json_build_object('sub', treasurer, 'role', 'authenticated')::text, true);
  update public.invoices set status = 'paid', paid_date = current_date - 12 where id = inv;
  update public.audit_log set at = now() - interval '12 days' where id > mark;
  select max(id) into mark from public.audit_log;

  -- A smaller job, waiting for approval.
  insert into public.invoices (community_id, supplier_id, category_id, invoice_number, issue_date, due_date,
                               net_cents, vat_cents, notes, created_by, created_at)
  values (oc, plumber, repairs, 'FB-2026-131', current_date - 6, current_date + 24, 18500, 3885,
          'New stopcock for the Block A garage water supply.', treasurer, now() - interval '5 days');
  update public.audit_log set at = now() - interval '5 days' where id > mark;

  perform set_config('request.jwt.claims', '', true);
end $$;
