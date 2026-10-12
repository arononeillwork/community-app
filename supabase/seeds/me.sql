-- "Me" area sample data (notifications, where the money goes). Runs after seed.sql.
--   1. Notifications with a realistic mix of kinds and ages, some already read, so the
--      bell and /notifications show Today / Earlier this week / Older.
--   2. Last year's budget and January–August invoices, so "Where the money goes" can
--      show last year as a full year (seed.sql only covers the last 14 months).
-- Everything is looked up by natural keys and guarded, so a second run adds nothing.

do $$
declare
  oc uuid := '0cea0a00-0000-4000-8000-000000000001';
  admin_id uuid := (select id from public.profiles where email = 'admin@oceanagardens.test');
  treasurer_id uuid := (select id from public.profiles where email = 'treasurer@oceanagardens.test');
  committee uuid := (select id from public.meetings where community_id = oc and meeting_type = 'committee' order by starts_at limit 1);
  levy record;
begin
  if admin_id is null then
    raise notice 'me.sql: Oceana Gardens sample data not found, skipping';
    return;
  end if;

  if exists (select 1 from public.notifications where community_id = oc and kind = 'notice' and title = 'Pool closed on Monday morning') then
    raise notice 'me.sql: notifications already present, skipping';
  else
    -- Fee reminders, matching the reminders the treasurer sent (seed.sql fee_reminders).
    insert into public.notifications (community_id, profile_id, kind, title, body, link, channel, sent_at, created_at)
    select oc, o.owner_id, 'fee_reminder', 'Community fees overdue for flat ' || b.label,
      '€' || to_char(b.overdue_cents / 100.0, 'FM999,990.00') || ' has been due since '
        || to_char(b.oldest_unpaid_due, 'FMDD FMMonth') || '. Please pay by bank transfer, or call the treasurer if this is not right.',
      '/my-units', r.channel, r.sent_at, r.sent_at
    from public.fee_reminders r
    join public.v_unit_balance b on b.unit_id = r.unit_id
    join public.unit_ownerships o on o.unit_id = r.unit_id and (o.end_date is null or o.end_date >= current_date)
    where r.community_id = oc and b.overdue_cents > 0;

    -- Extraordinary levy: each owner gets their share per flat.
    for levy in select * from public.levies where community_id = oc loop
      insert into public.notifications (community_id, profile_id, kind, title, body, link, created_at, read_at)
      select oc, o.owner_id, 'levy', levy.title || ': your share for ' || u.label,
        '€' || to_char(fc.amount_cents / 100.0, 'FM999,990.00') || ', due on ' || to_char(levy.due_date, 'FMDD FMMonth YYYY') || '.',
        '/my-units', now() - interval '9 days 3 hours',
        case when hashtext(o.owner_id::text) % 3 = 0 then null else now() - interval '8 days' end
      from public.fee_charges fc
      join public.units u on u.id = fc.unit_id
      join public.unit_ownerships o on o.unit_id = fc.unit_id and (o.end_date is null or o.end_date >= current_date)
      where fc.levy_id = levy.id;
    end loop;

    -- Replies on reports: the reporter hears when the office has seen or resolved it.
    insert into public.notifications (community_id, profile_id, kind, title, body, link, created_at, read_at)
    select oc, c.reporter_id, 'complaint_update',
      case c.status when 'resolved' then 'Resolved: ' when 'closed' then 'Closed: ' when 'in_progress' then 'Being worked on: ' else 'Seen by the office: ' end || c.title,
      coalesce((select u.body from public.complaint_updates u where u.complaint_id = c.id order by u.created_at desc limit 1),
        case c.status when 'resolved' then 'The office has marked your report as resolved.' when 'closed' then 'The office has closed your report.'
                      else 'The office has your report and will reply here.' end),
      '/report/' || c.id,
      least(now() - interval '2 hours', c.created_at + case when c.status in ('resolved', 'closed') then interval '6 days' else interval '20 hours' end),
      case when c.status in ('resolved', 'closed') then c.created_at + interval '7 days' end
    from public.complaints c
    where c.community_id = oc and c.status <> 'new' and c.reporter_id is not null;

    -- New reports reach the administrators.
    insert into public.notifications (community_id, profile_id, kind, title, body, link, created_at, read_at)
    select oc, m.profile_id, 'complaint', 'New report: ' || c.title, left(c.description, 140), '/report/' || c.id, c.created_at,
      case when c.created_at < now() - interval '5 days' then c.created_at + interval '1 hour' end
    from public.complaints c
    join public.memberships m on m.community_id = oc and m.role = 'admin' and m.status = 'active'
    where c.community_id = oc and c.created_at > now() - interval '30 days';

    -- Contract notice deadlines coming up (finance roles).
    insert into public.notifications (community_id, profile_id, kind, title, body, link, created_at, read_at)
    select oc, m.profile_id, 'contract_due', 'Notice deadline soon: ' || k.title,
      'Give ' || k.supplier_name || ' notice by ' || to_char(k.notice_deadline, 'FMDD FMMonth YYYY') || ' if the contract should not continue.',
      '/finance/contracts', now() - (1 + k.days_to_notice % 4) * interval '1 day' - interval '3 hours',
      case when m.role = 'treasurer' then now() - interval '1 day' end
    from public.v_contract_key_dates k
    join public.memberships m on m.community_id = oc and m.role in ('admin', 'treasurer') and m.status = 'active'
    where k.community_id = oc and k.status = 'active' and k.days_to_notice between 0 and 30;

    -- Landlords: tenant added, and a holiday let about to end.
    insert into public.notifications (community_id, profile_id, kind, title, body, link, created_at, read_at)
    select oc, t.added_by, 'tenancy', 'Tenant added to flat ' || u.label,
      p.full_name || ' can now use the app.', '/my-units',
      t.start_date + interval '9 hours', t.start_date + interval '1 day'
    from public.tenancies t join public.units u on u.id = t.unit_id join public.profiles p on p.id = t.tenant_id
    where t.community_id = oc and t.added_by is not null and t.status = 'active';

    insert into public.notifications (community_id, profile_id, kind, title, body, link, created_at)
    select oc, t.added_by, 'tenancy', 'Holiday let in ' || u.label || ' ends on ' || to_char(t.end_date, 'FMDD FMMonth'),
      p.full_name || '''s access ends automatically that day. You can change the date in My flat.', '/my-units',
      now() - interval '3 days 2 hours'
    from public.tenancies t join public.units u on u.id = t.unit_id join public.profiles p on p.id = t.tenant_id
    where t.community_id = oc and t.status = 'active' and t.tenancy_type in ('holiday_let', 'short_term')
      and t.end_date between current_date and current_date + 30 and t.added_by is not null;

    -- Everyone: a meeting change and a building notice.
    if committee is not null then
      insert into public.notifications (community_id, profile_id, kind, title, body, link, created_at, read_at)
      select oc, m.profile_id, 'meeting_update', 'Updated: Committee meeting – roof works',
        'Now online only. The Zoom link is on the meeting page.', '/meetings/' || committee,
        now() - interval '2 days 5 hours',
        case when hashtext(m.profile_id::text) % 2 = 0 then now() - interval '2 days' end
      from (select distinct profile_id from public.memberships where community_id = oc and status = 'active') m;
    end if;

    insert into public.notifications (community_id, profile_id, kind, title, body, link, created_at, read_at)
    select oc, m.profile_id, 'notice', 'Pool closed on Monday morning',
      'The pool is being cleaned and reopens at 13:00.', '/info',
      now() - interval '8 days 6 hours', now() - interval '8 days'
    from (select distinct profile_id from public.memberships where community_id = oc and status = 'active') m;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Last year's budget and invoices (January–August; seed.sql already has the last 14 months).
-- ---------------------------------------------------------------------------
do $$
declare
  oc uuid := '0cea0a00-0000-4000-8000-000000000001';
  ly int := extract(year from current_date)::int - 1;
  admin_id uuid := (select id from public.profiles where email = 'admin@oceanagardens.test');
  treasurer_id uuid := (select id from public.profiles where email = 'treasurer@oceanagardens.test');
  v_budget uuid;
  r record;
  mo int;
  m date;
  amt bigint;
  inv_id uuid;
  sup_id uuid;
begin
  if admin_id is null then return; end if;

  if not exists (select 1 from public.budgets where community_id = oc and year = ly) then
    insert into public.budgets (community_id, year, name, status, approved_at)
    values (oc, ly, 'Budget ' || ly, 'approved', make_date(ly - 1, 11, 20))
    returning id into v_budget;
    insert into public.budget_lines (community_id, budget_id, category_id, amount_cents)
    select oc, v_budget, ec.id, t.a
    from (values ('Gardening', 1220000), ('Pool', 450000), ('Lift', 545000), ('Cleaning', 2000000), ('Concierge', 4140000),
                 ('Insurance', 465000), ('Administration', 645000), ('Utilities', 880000), ('Repairs & maintenance', 780000)) as t(k, a)
    join public.expense_categories ec on ec.community_id = oc and ec.name = t.k;
  end if;

  -- Monthly service invoices at last year's prices (about 3 % lower), skipped where a month already has one.
  for r in select * from (values
      ('Jardines del Sol S.L.', 'GAR', 'Gardening', 82450),
      ('AquaClear Piscinas', 'POO', 'Pool', 60140),
      ('LimpiaMax Servicios', 'CLE', 'Cleaning', 135800),
      ('Conserjería Integral', 'CON', 'Concierge', 281300),
      ('Administración de Fincas Marbella', 'ADM', 'Administration', 43650),
      ('Iberluz Energía', 'UTI', 'Utilities', 0)) as t(supplier, prefix, category, amount)
  loop
    sup_id := (select id from public.suppliers where community_id = oc and name = r.supplier);
    continue when sup_id is null;
    for mo in 1..8 loop
      m := make_date(ly, mo, 1);
      continue when r.prefix = 'POO' and mo not between 5 and 10;
      continue when exists (select 1 from public.invoices i where i.supplier_id = sup_id
                            and date_trunc('month', i.issue_date) = m);
      amt := case when r.prefix = 'UTI'
                  then round((58000 + case when mo between 6 and 9 then 34000 else 0 end + (mo * 1700 % 8000)))::bigint
                  else r.amount end;
      insert into public.invoices (community_id, supplier_id, contract_id, category_id, invoice_number, issue_date, due_date,
        net_cents, vat_cents, status, paid_date, created_by)
      values (oc, sup_id,
        (select c.id from public.contracts c where c.supplier_id = sup_id and c.start_date <= m + 2 order by c.start_date limit 1),
        (select id from public.expense_categories where community_id = oc and name = r.category),
        r.prefix || '-' || to_char(m, 'YYYYMM'), m + 2, m + 32, amt, round(amt * 0.21)::bigint, 'paid', m + 27, treasurer_id)
      on conflict (community_id, supplier_id, invoice_number) do nothing
      returning id into inv_id;
      if inv_id is not null then
        insert into public.invoice_approvals (community_id, invoice_id, approver_id, approved_at)
        values (oc, inv_id, treasurer_id, m + 7);
        if amt * 1.21 > 100000 then
          insert into public.invoice_approvals (community_id, invoice_id, approver_id, approved_at)
          values (oc, inv_id, admin_id, m + 8);
        end if;
      end if;
      inv_id := null;
    end loop;
  end loop;

  -- Quarterly lift maintenance (Q1–Q3), the yearly insurance premium and a few repairs.
  for r in select * from (values
      ('Elevadores Costa S.A.', 'LIFT-' || ly || 'Q1', 'Lift', make_date(ly, 1, 6), 111500, 23415, null::text),
      ('Elevadores Costa S.A.', 'LIFT-' || ly || 'Q2', 'Lift', make_date(ly, 4, 6), 111500, 23415, null),
      ('Elevadores Costa S.A.', 'LIFT-' || ly || 'Q3', 'Lift', make_date(ly, 7, 6), 111500, 23415, null),
      ('Seguros Mediterráneo', 'POL-' || ly || '-0038', 'Insurance', make_date(ly, 3, 11), 465000, 0, 'Annual premium'),
      ('Reparaciones Rápidas', 'RR-0981', 'Repairs & maintenance', make_date(ly, 2, 17), 390000, 81900, 'Garden wall rebuilt after the February storm'),
      ('Reparaciones Rápidas', 'RR-1004', 'Repairs & maintenance', make_date(ly, 4, 23), 245000, 51450, 'Pool pump replaced'),
      ('Reparaciones Rápidas', 'RR-1032', 'Repairs & maintenance', make_date(ly, 6, 9), 68000, 14280, 'Block A intercom repaired'),
      ('Reparaciones Rápidas', 'RR-1058', 'Repairs & maintenance', make_date(ly, 8, 4), 42000, 8820, 'Garage door spring replaced')) as t(supplier, num, category, issued, net, vat, note)
  loop
    sup_id := (select id from public.suppliers where community_id = oc and name = r.supplier);
    continue when sup_id is null;
    insert into public.invoices (community_id, supplier_id, contract_id, category_id, invoice_number, issue_date, due_date,
      net_cents, vat_cents, status, paid_date, notes, created_by)
    values (oc, sup_id,
      (select c.id from public.contracts c where c.supplier_id = sup_id and c.start_date <= r.issued order by c.start_date limit 1),
      (select id from public.expense_categories where community_id = oc and name = r.category),
      r.num, r.issued, r.issued + 30, r.net, r.vat, 'paid', r.issued + 21, r.note, treasurer_id)
    on conflict (community_id, supplier_id, invoice_number) do nothing
    returning id into inv_id;
    if inv_id is not null then
      insert into public.invoice_approvals (community_id, invoice_id, approver_id, approved_at)
      values (oc, inv_id, treasurer_id, r.issued + 4);
      if r.net + r.vat > 100000 then
        insert into public.invoice_approvals (community_id, invoice_id, approver_id, approved_at)
        values (oc, inv_id, admin_id, r.issued + 5);
      end if;
    end if;
    inv_id := null;
  end loop;
end $$;
