-- Local development seed: Oceana Gardens (sample community) + a tiny "Demo Heights" community
-- used to prove data isolation. All test accounts use the password: Password123!

-- Helper: create a confirmed email/password auth user (profile + preferences come from trigger).
create or replace function pg_temp.seed_user(p_email text, p_name text, p_phone text default null)
returns uuid language plpgsql as $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', p_email,
    extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_name), now(), now(),
    '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now());
  update public.profiles set phone = p_phone where id = uid;
  return uid;
end $$;

do $$
declare
  oc uuid := '0cea0a00-0000-4000-8000-000000000001';
  dm uuid := 'de300000-0000-4000-8000-000000000002';
  platform_id uuid; admin_id uuid; treasurer_id uuid; demo_admin uuid;
  owners uuid[] := '{}';
  tenants uuid[] := '{}';
  owner_names text[] := array['James Whitfield','Ingrid Larsen','Hans Becker','Sophie Martin','Willem de Vries',
    'Carmen Ruiz','Eleanor Hughes','Lars Nilsson','Margaret O''Brien','Klaus Richter','Anne Dubois','Pieter Janssen',
    'Isabel Moreno','Robert Clarke','Birgitta Holm','Jean-Luc Bernard','Dorothy Evans','Erik Andersen','Francisco Gil'];
  tenant_names text[] := array['Lucía Fernández','Thomas Wright','Greta Schulz','Oliver Bennett','Astrid Berg',
    'Daniel Navarro','Chloé Laurent','Henrik Dahl'];
  b_ids uuid[] := '{}';
  bid uuid;
  u_ids uuid[] := '{}';
  uid uuid;
  i int; f int; l int; idx int := 0;
  all_owners uuid[];
  cat record;
  cats jsonb := '{}';
  sup jsonb := '{}';
  con jsonb := '{}';
  s_id uuid; c_id uuid; inv_id uuid;
  m date; amt bigint; st public.invoice_status; issue date; n int;
  v_budget uuid; sched_id uuid; annual bigint;
  ch record;
  cc jsonb := '{}';
  mtg uuid;
begin
  -- -------------------------------------------------------------------------
  -- Communities + branding
  -- -------------------------------------------------------------------------
  insert into public.communities (id, slug, name, default_language, enabled_languages, timezone, currency, settings)
  values
    (oc, 'oceana-gardens', 'Oceana Gardens', 'en', '{en,es,de,nl,sv,fr}', 'Europe/Madrid', 'EUR',
     '{"tenant_requires_approval": false, "invoice_approval_threshold_cents": 100000, "features": {"ai": true, "whatsapp": false, "meetings": true}}'),
    (dm, 'demo-heights', 'Demo Heights', 'en', '{en}', 'Europe/London', 'EUR', default);

  insert into public.community_branding (community_id, logo_url, primary_color, accent_color) values
    (oc, '/communities/oceana-gardens/logo.svg', '#0f766e', '#d97706'),
    (dm, null, '#4338ca', '#db2777');

  insert into public.community_public_info (community_id, tagline, welcome, address, lat, lng, office_hours, emergency_contacts, public_notices)
  values (oc,
    '{"en": "Your community, all in one place", "es": "Tu comunidad, todo en un solo lugar"}',
    '{"en": "Welcome to Oceana Gardens. Here you can find bin days, community documents, meetings, local tips and how to reach the office — or simply ask the assistant.", "es": "Bienvenido a Oceana Gardens. Aquí encontrará los días de recogida, documentos de la comunidad, reuniones, recomendaciones locales y cómo contactar con la oficina."}',
    'Avenida del Mar 12, 29670 San Pedro de Alcántara, Málaga', 36.4843, -4.9906,
    '[{"label": "Office (Mon–Fri)", "hours": "09:00 – 14:00"}, {"label": "Concierge", "hours": "Every day 08:00 – 22:00"}, {"label": "Pool", "hours": "May–Oct, 10:00 – 20:00"}]',
    '[{"label": "Emergencies (police, fire, ambulance)", "phone": "112"}, {"label": "Concierge desk", "phone": "+34 600 100 200"}, {"label": "Community office", "phone": "+34 952 000 111"}, {"label": "Lift emergency line", "phone": "+34 900 123 456"}, {"label": "Local police", "phone": "092"}]',
    '[{"title": "Pool closed for cleaning", "body": "The pool will be closed on Monday morning until 13:00.", "date": "2026-10-05"}, {"title": "Annual General Meeting", "body": "The AGM will be held in the community room. Details are in the Meetings section.", "date": "2026-11-13"}]'),
    (dm, '{"en": "Demo community"}', '{"en": "This is a second community used to test that data stays separate."}',
     '1 Demo Street, London', null, null, '[]', '[{"label": "Emergency", "phone": "999"}]', '[]');

  -- -------------------------------------------------------------------------
  -- People
  -- -------------------------------------------------------------------------
  platform_id := pg_temp.seed_user('platform@communityapp.test', 'Platform Admin');
  update public.profiles set is_platform_admin = true where id = platform_id;

  admin_id := pg_temp.seed_user('admin@oceanagardens.test', 'María López', '+34 600 100 201');
  treasurer_id := pg_temp.seed_user('treasurer@oceanagardens.test', 'Peter Johansson', '+34 600 100 202');
  insert into public.memberships (community_id, profile_id, role) values
    (oc, admin_id, 'admin'), (oc, treasurer_id, 'treasurer'), (oc, treasurer_id, 'owner');

  for i in 1..array_length(owner_names, 1) loop
    uid := pg_temp.seed_user('owner' || i || '@oceanagardens.test', owner_names[i], '+34 611 000 ' || lpad(i::text, 3, '0'));
    owners := owners || uid;
    insert into public.memberships (community_id, profile_id, role) values (oc, uid, 'owner');
    insert into public.contact_preferences (profile_id, community_id, preferred_method, best_times, visibility)
    values (uid, oc,
      (array['email','whatsapp','phone','email'])[1 + i % 4]::public.contact_method,
      (array['Weekdays 9:00–18:00','Mornings only','Any time','Evenings after 18:00'])[1 + i % 4],
      (array['block','block','unit','admins'])[1 + i % 4]::public.contact_visibility);
  end loop;
  insert into public.contact_preferences (profile_id, community_id, preferred_method, best_times, visibility)
  values (treasurer_id, oc, 'email', 'Weekdays', 'block'), (admin_id, oc, 'phone', 'Office hours 09:00–14:00', 'block');

  for i in 1..array_length(tenant_names, 1) loop
    tenants := tenants || pg_temp.seed_user('tenant' || i || '@oceanagardens.test', tenant_names[i], '+34 622 000 ' || lpad(i::text, 3, '0'));
  end loop;

  demo_admin := pg_temp.seed_user('admin@demoheights.test', 'Dana Demo');
  insert into public.memberships (community_id, profile_id, role) values (dm, demo_admin, 'admin');

  -- -------------------------------------------------------------------------
  -- Buildings + units (3 blocks × 4 floors × 3 doors = 36 units)
  -- -------------------------------------------------------------------------
  for i in 1..3 loop
    insert into public.buildings (community_id, name, sort) values (oc, 'Block ' || chr(64 + i), i) returning id into bid;
    b_ids := b_ids || bid;
    for f in 1..4 loop
      for l in 1..3 loop
        insert into public.units (community_id, building_id, label, floor, bedrooms, coefficient)
        values (oc, bid, chr(64 + i) || '-' || f || chr(64 + l), f, case when f = 4 then 3 else 2 end,
                case when f = 4 then 1.4 else 1.0 end)
        returning id into uid;
        u_ids := u_ids || uid;
      end loop;
    end loop;
  end loop;
  -- Normalise coefficients so they sum to 100 %.
  update public.units set coefficient = round(coefficient * 100 / (select sum(coefficient) from public.units where community_id = oc), 4)
  where community_id = oc;

  -- Ownership: treasurer + 19 owners spread over 36 units (most own one, some two).
  all_owners := array[treasurer_id] || owners;
  for idx in 1..array_length(u_ids, 1) loop
    insert into public.unit_ownerships (community_id, unit_id, owner_id, start_date)
    values (oc, u_ids[idx], all_owners[1 + (idx - 1) % array_length(all_owners, 1)], date '2015-01-01' + (idx * 97));
  end loop;

  -- Tenancies (units 21..28 are rented out). One is landlord-added long-term, one a holiday let ending soon.
  for i in 1..array_length(tenants, 1) loop
    insert into public.tenancies (community_id, unit_id, tenant_id, added_by, tenancy_type, start_date, end_date, note)
    values (oc, u_ids[20 + i], tenants[i],
      (select owner_id from public.unit_ownerships where unit_id = u_ids[20 + i] limit 1),
      case when i = 7 then 'holiday_let'::public.tenancy_type when i = 8 then 'family' else 'long_term' end,
      current_date - (i * 60),
      case when i = 7 then current_date + 10 when i <= 3 then current_date + 300 else null end,
      case when i = 1 then 'Added by landlord – long-term let' when i = 7 then 'Holiday let, two weeks' end);
    insert into public.contact_preferences (profile_id, community_id, preferred_method, visibility)
    values (tenants[i], oc, 'whatsapp', 'block');
  end loop;

  -- -------------------------------------------------------------------------
  -- Building info + bins + local places
  -- -------------------------------------------------------------------------
  insert into public.info_pages (community_id, title, body, category, icon, sort) values
    (oc, 'House rules', E'• Quiet hours are 23:00 – 08:00 (15:00 – 17:00 siesta in summer).\n• No barbecues on balconies.\n• Dogs must be on a lead in all shared areas.\n• Do not hang washing over balcony railings.\n• Please keep the entrance doors closed.', 'rules', 'scroll-text', 1),
    (oc, 'Swimming pool', E'Open May to October, 10:00 – 20:00.\n• Shower before swimming.\n• No glass in the pool area.\n• Children under 12 must be with an adult.\n• There is no lifeguard.', 'facilities', 'waves', 2),
    (oc, 'Parking and garage', E'Each flat has one numbered space in the underground garage. Visitor parking is at the front gate (maximum 48 hours). The garage door remote can be ordered from the office (€45).', 'parking', 'car', 3),
    (oc, 'Office and concierge', E'The community office is in Block A, ground floor. Open Monday to Friday 09:00 – 14:00.\nThe concierge is at the main gate every day 08:00 – 22:00 and can accept parcels.', 'general', 'building', 4),
    (oc, 'In an emergency', E'Call 112 for police, fire or ambulance.\nWater leak: turn off the stopcock under your kitchen sink, then call the concierge.\nStuck in the lift: press the alarm button — the lift company answers 24 hours a day.', 'emergency', 'siren', 0),
    (oc, 'Moving in or out', E'Please tell the office at least 3 days before. The service lift in each block can be reserved and protected with blankets. Large furniture must not be left by the bins — call the council collection on 010.', 'general', 'truck', 5);

  insert into public.bin_schedules (community_id, bin_type, color, color_hex, weekdays, put_out_time, location, notes, sort) values
    (oc, 'General waste', 'grey', '#6b7280', '{0,1,2,3,4,5,6}', 'After 20:00', 'Bin area by the main gate', 'Tie bags closed. Collected every night.', 1),
    (oc, 'Plastic, cans and cartons', 'yellow', '#eab308', '{1,3,5}', 'Any time', 'Bin area by the main gate', 'Rinse containers. No bags inside the yellow bin if possible.', 2),
    (oc, 'Paper and cardboard', 'blue', '#2563eb', '{2,6}', 'Any time', 'Bin area by the main gate', 'Flatten boxes.', 3),
    (oc, 'Glass', 'green', '#16a34a', '{4}', '09:00 – 21:00 (noise)', 'Green igloo on Avenida del Mar', 'Bottles and jars only, no lids.', 4),
    (oc, 'Organic (food waste)', 'brown', '#92400e', '{1,2,3,4,5,6}', 'After 20:00', 'Bin area by the main gate', 'Food scraps and garden cuttings.', 5);

  insert into public.local_places (community_id, name, place_type, description, address, distance_km, price_level, step_free, accessibility_notes, phone, website) values
    (oc, 'Seafront promenade walk', 'walk', 'Flat 5 km walk along the paseo marítimo towards Puerto Banús. Benches and cafés every few hundred metres.', 'Start at the end of Avenida del Mar', 0.4, null, true, 'Completely flat, paved, public toilets at the beach clubs.', null, null),
    (oc, 'River walk (Guadaiza)', 'walk', 'Shady riverside path up from the beach. About 45 minutes return.', 'Paseo del Río Guadaiza', 0.9, null, true, 'Mostly flat, some gravel sections.', null, null),
    (oc, 'Botanical park loop', 'route', 'Gentle loop through the park in the town centre with fountains and a children''s area.', 'Town centre', 1.5, null, true, 'Paved paths, benches, accessible toilets.', null, null),
    (oc, 'Chiringuito La Ola', 'restaurant', 'Beach restaurant known for grilled sardines and paella. Book at weekends.', 'Beach, 5 minutes'' walk', 0.5, 2, true, 'Ramp access from the promenade.', '+34 952 111 222', null),
    (oc, 'Café Plaza', 'cafe', 'Friendly café on the church square with good coffee and churros in the morning.', 'Plaza de la Iglesia', 1.2, 1, true, 'Step-free terrace.', '+34 952 333 444', null),
    (oc, 'Trattoria Il Porto', 'restaurant', 'Family-run Italian with a quiet terrace. Early dinner menu from 19:00.', 'Calle Marqués del Duero', 1.3, 2, false, 'One step at the entrance, staff happy to help.', '+34 952 555 666', null),
    (oc, 'Weekly market', 'shop', 'Thursday morning street market: fruit, vegetables, clothes and household goods.', 'Recinto ferial', 1.8, 1, true, 'Busy after 11:00 — go early.', null, null),
    (oc, 'Farmacia del Mar', 'pharmacy', 'Nearest pharmacy. English and German spoken.', 'Avenida del Mar 40', 0.3, null, true, null, '+34 952 777 888', null),
    (oc, 'Health centre (Centro de Salud)', 'health', 'Public GP surgery. Book appointments by phone or app.', 'Calle Lagasca', 1.6, null, true, 'Lift and accessible toilets.', '+34 951 000 000', null),
    (oc, 'Bus stop – line 01 to Marbella', 'transport', 'Every 20 minutes. Buses are low-floor.', 'Avenida del Mar / Calle Palmeras', 0.2, null, true, 'Shelter with seating.', null, null),
    (oc, 'Supermarket', 'shop', 'Large supermarket with home delivery (orders over €50).', 'Avenida de la Constitución', 0.7, 1, true, 'Trolleys with seats available.', null, null),
    (oc, 'Old town and church', 'sight', 'Pretty old square with a 17th-century church and small shops.', 'Town centre', 1.2, null, true, 'Cobbled in places.', null, null);

  -- -------------------------------------------------------------------------
  -- Finance: categories, suppliers, contracts
  -- -------------------------------------------------------------------------
  for cat in select * from (values
      ('Gardening', '#16a34a', 1), ('Pool', '#0891b2', 2), ('Lift', '#7c3aed', 3), ('Cleaning', '#0d9488', 4),
      ('Concierge', '#2563eb', 5), ('Insurance', '#9333ea', 6), ('Administration', '#64748b', 7),
      ('Utilities', '#d97706', 8), ('Repairs & maintenance', '#dc2626', 9)) as t(name, color, sort)
  loop
    insert into public.expense_categories (community_id, name, color, sort) values (oc, cat.name, cat.color, cat.sort) returning id into uid;
    cats := cats || jsonb_build_object(cat.name, uid);
  end loop;

  for cat in select * from (values
      ('gardening', 'Jardines del Sol S.L.', 'Gardening', 'B29000001', 'Antonio Pérez', 'info@jardinesdelsol.test', '+34 952 100 001'),
      ('pool', 'AquaClear Piscinas', 'Pool maintenance', 'B29000002', 'Laura Gómez', 'service@aquaclear.test', '+34 952 100 002'),
      ('lift', 'Elevadores Costa S.A.', 'Lift maintenance', 'A29000003', 'Service desk', 'avisos@elevadorescosta.test', '+34 900 123 456'),
      ('cleaning', 'LimpiaMax Servicios', 'Cleaning', 'B29000004', 'Rosa Martín', 'rosa@limpiamax.test', '+34 952 100 004'),
      ('concierge', 'Conserjería Integral', 'Concierge', 'B29000005', 'Miguel Torres', 'miguel@conserjeria.test', '+34 600 100 200'),
      ('insurance', 'Seguros Mediterráneo', 'Building insurance', 'A29000006', 'Policy team', 'polizas@segurosmed.test', '+34 952 100 006'),
      ('admin', 'Administración de Fincas Marbella', 'Property administration', 'B29000007', 'Elena Castro', 'elena@fincasmarbella.test', '+34 952 000 111'),
      ('utilities', 'Iberluz Energía', 'Electricity (common areas)', 'A29000008', 'Customer service', 'clientes@iberluz.test', '+34 900 000 008'),
      ('repairs', 'Reparaciones Rápidas', 'General repairs', 'B29000009', 'Jorge Ramos', 'jorge@reparaciones.test', '+34 611 222 333'))
    as t(k, name, service, tax, contact, email, phone)
  loop
    insert into public.suppliers (community_id, name, service_type, tax_id, contact_name, email, phone, iban)
    values (oc, cat.name, cat.service, cat.tax, cat.contact, cat.email, cat.phone, 'ES91 2100 0418 4502 0005 13' || right(cat.tax, 2))
    returning id into uid;
    sup := sup || jsonb_build_object(cat.k, uid);
  end loop;

  -- key, title, category, start offset (days ago), end offset (days from now, null = rolling), notice days, auto-renew, freq, amount (cents), vat
  for cat in select * from (values
      ('gardening', 'Garden maintenance', 'Gardening', 670, 75, 60, false, 'monthly', 85000, 21.0),
      ('pool', 'Pool cleaning and chemicals', 'Pool', 400, 200, 30, false, 'monthly', 62000, 21.0),
      ('lift', 'Lift maintenance (3 lifts)', 'Lift', 700, 400, 90, true, 'quarterly', 115000, 21.0),
      ('cleaning', 'Common area cleaning', 'Cleaning', 330, 40, 30, false, 'monthly', 140000, 21.0),
      ('concierge', 'Concierge service 08:00–22:00', 'Concierge', 800, 300, 90, true, 'monthly', 290000, 21.0),
      ('insurance', 'Building insurance policy', 'Insurance', 215, 150, 60, true, 'yearly', 480000, 0.0),
      ('admin', 'Community administration', 'Administration', 1500, null, 90, true, 'monthly', 45000, 21.0))
    as t(k, title, category, start_ago, end_in, notice, renew, freq, amount, vat)
  loop
    insert into public.contracts (community_id, supplier_id, category_id, title, start_date, end_date, notice_period_days,
      auto_renew, billing_frequency, amount_cents, vat_rate, price_review_clause)
    values (oc, (sup ->> cat.k)::uuid, (cats ->> cat.category)::uuid, cat.title, current_date - cat.start_ago,
      case when cat.end_in is null then null else current_date + cat.end_in end, cat.notice, cat.renew,
      cat.freq::public.billing_frequency, cat.amount, cat.vat,
      case when cat.renew then 'Price reviewed yearly in line with CPI (IPC)' end)
    returning id into uid;
    con := con || jsonb_build_object(cat.k, uid);
  end loop;

  -- -------------------------------------------------------------------------
  -- Invoices for the last 14 months
  -- -------------------------------------------------------------------------
  for n in 0..13 loop
    m := (date_trunc('month', current_date) - make_interval(months => n))::date;
    for cat in select * from (values
        ('gardening', 'Gardening', 85000, 21.0), ('pool', 'Pool', 62000, 21.0), ('cleaning', 'Cleaning', 140000, 21.0),
        ('concierge', 'Concierge', 290000, 21.0), ('admin', 'Administration', 45000, 21.0),
        ('utilities', 'Utilities', 0, 21.0)) as t(k, category, amount, vat)
    loop
      -- Pool only invoiced May–October; utilities vary by season.
      continue when cat.k = 'pool' and extract(month from m) not between 5 and 10;
      amt := case when cat.k = 'utilities'
                  then 60000 + (case when extract(month from m) between 6 and 9 then 35000 else 0 end) + (n * 1300 % 9000)
                  else cat.amount end;
      issue := m + 2;
      st := case when current_date - issue > 45 then 'paid' when current_date - issue > 12 then 'approved' else 'received' end;
      insert into public.invoices (community_id, supplier_id, contract_id, category_id, invoice_number, issue_date, due_date,
        net_cents, vat_cents, status, paid_date, created_by)
      values (oc, (sup ->> cat.k)::uuid, (con ->> cat.k)::uuid, (cats ->> cat.category)::uuid,
        upper(left(cat.k, 3)) || '-' || to_char(m, 'YYYYMM'), issue, issue + 30,
        amt, round(amt * cat.vat / 100)::bigint, st,
        case when st = 'paid' then issue + 25 end, treasurer_id)
      returning id into inv_id;
      if st in ('paid', 'approved') then
        insert into public.invoice_approvals (community_id, invoice_id, approver_id, approved_at) values (oc, inv_id, treasurer_id, issue + 5);
        if amt * (1 + cat.vat / 100) > 100000 then
          insert into public.invoice_approvals (community_id, invoice_id, approver_id, approved_at) values (oc, inv_id, admin_id, issue + 6);
        end if;
      end if;
    end loop;

    -- Quarterly lift invoices
    if extract(month from m) in (1, 4, 7, 10) then
      issue := m + 5;
      st := case when current_date - issue > 45 then 'paid' when current_date - issue > 12 then 'approved' else 'received' end;
      insert into public.invoices (community_id, supplier_id, contract_id, category_id, invoice_number, issue_date, due_date,
        net_cents, vat_cents, status, paid_date, created_by)
      values (oc, (sup ->> 'lift')::uuid, (con ->> 'lift')::uuid, (cats ->> 'Lift')::uuid,
        'LIFT-' || to_char(m, 'YYYY') || 'Q' || extract(quarter from m), issue, issue + 30, 115000, 24150, st,
        case when st = 'paid' then issue + 20 end, treasurer_id)
      returning id into inv_id;
      if st <> 'received' then
        insert into public.invoice_approvals (community_id, invoice_id, approver_id) values (oc, inv_id, treasurer_id), (oc, inv_id, admin_id);
      end if;
    end if;
  end loop;

  -- Yearly insurance (paid), ad-hoc repairs, one disputed, one large awaiting a 2nd approval, one overdue.
  insert into public.invoices (community_id, supplier_id, contract_id, category_id, invoice_number, issue_date, due_date, net_cents, vat_cents, status, paid_date, notes, created_by)
  values (oc, (sup ->> 'insurance')::uuid, (con ->> 'insurance')::uuid, (cats ->> 'Insurance')::uuid, 'POL-2026-0042', current_date - 215, current_date - 185, 480000, 0, 'paid', current_date - 190, 'Annual premium', treasurer_id)
  returning id into inv_id;
  insert into public.invoice_approvals (community_id, invoice_id, approver_id) values (oc, inv_id, treasurer_id), (oc, inv_id, admin_id);

  insert into public.invoices (community_id, supplier_id, category_id, invoice_number, issue_date, due_date, net_cents, vat_cents, status, paid_date, notes, created_by)
  values (oc, (sup ->> 'repairs')::uuid, (cats ->> 'Repairs & maintenance')::uuid, 'RR-1187', current_date - 160, current_date - 130, 185000, 38850, 'paid', current_date - 140, 'Garage gate motor replaced', treasurer_id)
  returning id into inv_id;
  insert into public.invoice_approvals (community_id, invoice_id, approver_id) values (oc, inv_id, treasurer_id), (oc, inv_id, admin_id);

  insert into public.invoices (community_id, supplier_id, category_id, invoice_number, issue_date, due_date, net_cents, vat_cents, status, paid_date, notes, created_by)
  values (oc, (sup ->> 'repairs')::uuid, (cats ->> 'Repairs & maintenance')::uuid, 'RR-1203', current_date - 95, current_date - 65, 42000, 8820, 'paid', current_date - 70, 'Block B entrance light fittings', treasurer_id)
  returning id into inv_id;
  insert into public.invoice_approvals (community_id, invoice_id, approver_id) values (oc, inv_id, treasurer_id);

  insert into public.invoices (community_id, supplier_id, category_id, invoice_number, issue_date, due_date, net_cents, vat_cents, status, notes, created_by)
  values (oc, (sup ->> 'repairs')::uuid, (cats ->> 'Repairs & maintenance')::uuid, 'RR-1229', current_date - 20, current_date + 10, 324000, 68040, 'received', 'Roof waterproofing Block C – needs two approvals', treasurer_id)
  returning id into inv_id;
  insert into public.invoice_approvals (community_id, invoice_id, approver_id) values (oc, inv_id, treasurer_id);

  insert into public.invoices (community_id, supplier_id, category_id, invoice_number, issue_date, due_date, net_cents, vat_cents, status, notes, created_by)
  values (oc, (sup ->> 'cleaning')::uuid, (cats ->> 'Cleaning')::uuid, 'LM-EXTRA-77', current_date - 50, current_date - 20, 38000, 7980, 'disputed', 'Extra cleaning charged but not agreed', treasurer_id);

  insert into public.invoices (community_id, supplier_id, category_id, invoice_number, issue_date, due_date, net_cents, vat_cents, status, notes, created_by)
  values (oc, (sup ->> 'repairs')::uuid, (cats ->> 'Repairs & maintenance')::uuid, 'RR-1215', current_date - 48, current_date - 18, 27500, 5775, 'received', 'Pool pump seal – overdue', treasurer_id);

  -- Quotes for the roof works
  insert into public.quotes (community_id, job_title, supplier_id, supplier_name, amount_cents, valid_until, chosen, notes) values
    (oc, 'Roof waterproofing Block C', (sup ->> 'repairs')::uuid, 'Reparaciones Rápidas', 392040, current_date + 30, true, 'Includes 10-year guarantee'),
    (oc, 'Roof waterproofing Block C', null, 'Cubiertas Andalucía', 451000, current_date + 20, false, null),
    (oc, 'Roof waterproofing Block C', null, 'Impermeabilizaciones Sur', 418500, current_date + 15, false, 'Guarantee 5 years');

  -- -------------------------------------------------------------------------
  -- Budget + owner fees for the current year
  -- -------------------------------------------------------------------------
  insert into public.budgets (community_id, year, name, status, approved_at)
  values (oc, extract(year from current_date)::int, 'Budget ' || extract(year from current_date), 'approved', make_date(extract(year from current_date)::int - 1, 11, 20))
  returning id into v_budget;
  insert into public.budget_lines (community_id, budget_id, category_id, amount_cents)
  select oc, v_budget, (cats ->> k)::uuid, a from (values
    ('Gardening', 1250000), ('Pool', 460000), ('Lift', 560000), ('Cleaning', 2000000), ('Concierge', 4150000),
    ('Insurance', 480000), ('Administration', 660000), ('Utilities', 900000), ('Repairs & maintenance', 800000)) as t(k, a);
  select sum(amount_cents) into annual from public.budget_lines where budget_id = v_budget;

  insert into public.fee_schedules (community_id, year, budget_id, frequency, method, annual_total_cents)
  values (oc, extract(year from current_date)::int, v_budget, 'quarterly', 'coefficient', annual)
  returning id into sched_id;
  perform public.generate_fee_charges(sched_id);

  -- Extraordinary levy for the roof works
  insert into public.levies (community_id, title, description, total_cents, due_date)
  values (oc, 'Roof works levy', 'Waterproofing of the Block C roof, approved at the extraordinary meeting.', 400000, current_date + 30)
  returning id into uid;
  perform public.allocate_levy(uid);

  -- Payments: everyone pays charges that are due, except a few units in arrears.
  for ch in
    select fc.* , row_number() over (partition by fc.unit_id order by fc.due_date) as rn,
           array_position(u_ids, fc.unit_id) as unit_no
    from public.fee_charges fc
    where fc.community_id = oc and fc.schedule_id is not null and fc.due_date <= current_date
    order by fc.due_date
  loop
    continue when ch.unit_no in (5, 17) and ch.due_date > current_date - 100;   -- last quarter(s) unpaid
    continue when ch.unit_no = 30 and ch.due_date > current_date - 190;         -- two quarters unpaid
    insert into public.fee_payments (community_id, unit_id, paid_on, amount_cents, method, reference, recorded_by)
    values (oc, ch.unit_id, ch.due_date + (ch.unit_no % 12),
      case when ch.unit_no = 11 and ch.due_date > current_date - 100 then ch.amount_cents / 2 else ch.amount_cents end,
      case when ch.unit_no % 3 = 0 then 'direct_debit' else 'bank_transfer' end::public.payment_method,
      'CUOTA ' || ch.period_label, treasurer_id);
  end loop;
  insert into public.fee_reminders (community_id, unit_id, channel, sent_at, note) values
    (oc, u_ids[30], 'email', now() - interval '20 days', 'Second reminder'),
    (oc, u_ids[5], 'whatsapp', now() - interval '5 days', 'First reminder');

  -- Bank ledger (opening balance + a few entries)
  insert into public.ledger_entries (community_id, entry_date, description, amount_cents, reference) values
    (oc, make_date(extract(year from current_date)::int, 1, 1), 'Opening balance – reserve fund', 3850000, 'OPENING'),
    (oc, current_date - 30, 'Bank charges', -1850, 'COMISION');

  -- -------------------------------------------------------------------------
  -- Complaints
  -- -------------------------------------------------------------------------
  for cat in select * from (values ('Noise', 'volume-2', 1), ('Maintenance', 'wrench', 2), ('Cleanliness', 'sparkles', 3),
      ('Parking', 'car', 4), ('Pets', 'dog', 5), ('Safety', 'shield-alert', 6), ('Other', 'circle-help', 7)) as t(name, icon, sort)
  loop
    insert into public.complaint_categories (community_id, name, icon, sort) values (oc, cat.name, cat.icon, cat.sort) returning id into uid;
    cc := cc || jsonb_build_object(cat.name, uid);
  end loop;

  insert into public.complaints (community_id, reporter_id, category_id, target_type, target_unit_id, target_owner_id, target_supplier_id, location, title, description, status, priority, created_at)
  values
    (oc, owners[2], (cc ->> 'Noise')::uuid, 'unit', u_ids[7], null, null, null, 'Loud music late at night', 'Music until 2am on Friday and Saturday from the flat above.', 'acknowledged', 'normal', now() - interval '6 days'),
    (oc, owners[5], (cc ->> 'Noise')::uuid, 'unit', u_ids[7], null, null, null, 'Party noise again', 'Second weekend in a row with a party on the terrace.', 'new', 'normal', now() - interval '2 days'),
    (oc, tenants[1], (cc ->> 'Noise')::uuid, 'unit', u_ids[28], null, null, null, 'Holiday guests noisy by the pool', 'Guests shouting in the pool area after 23:00.', 'resolved', 'low', now() - interval '40 days'),
    (oc, owners[8], (cc ->> 'Maintenance')::uuid, 'common_area', null, null, null, 'Block B lift', 'Lift out of order', 'The Block B lift has stopped between floors twice this week.', 'in_progress', 'high', now() - interval '3 days'),
    (oc, owners[3], (cc ->> 'Maintenance')::uuid, 'common_area', null, null, null, 'Garage', 'Garage light not working', 'Two lights near spaces 20–24 are out. It is very dark.', 'resolved', 'normal', now() - interval '75 days'),
    (oc, owners[12], (cc ->> 'Maintenance')::uuid, 'supplier', null, null, (sup ->> 'pool')::uuid, 'Pool', 'Pool water cloudy', 'The water has been cloudy for three days.', 'resolved', 'normal', now() - interval '120 days'),
    (oc, owners[6], (cc ->> 'Cleanliness')::uuid, 'supplier', null, null, (sup ->> 'cleaning')::uuid, 'Block A stairs', 'Stairs not cleaned', 'The Block A stairs have not been mopped this week.', 'acknowledged', 'normal', now() - interval '9 days'),
    (oc, owners[9], (cc ->> 'Cleanliness')::uuid, 'supplier', null, null, (sup ->> 'cleaning')::uuid, 'Entrance hall', 'Entrance hall dirty', 'Sand and leaves in the entrance for days.', 'resolved', 'low', now() - interval '65 days'),
    (oc, owners[14], (cc ->> 'Cleanliness')::uuid, 'common_area', null, null, null, 'Bin area', 'Bins overflowing', 'Rubbish left next to the bins, attracting cats.', 'new', 'normal', now() - interval '1 day'),
    (oc, owners[1], (cc ->> 'Parking')::uuid, 'owner', null, owners[10], null, 'Garage space 14', 'Car parked in my space', 'A silver car from another flat keeps parking in my space.', 'in_progress', 'normal', now() - interval '12 days'),
    (oc, owners[4], (cc ->> 'Parking')::uuid, 'common_area', null, null, null, 'Visitor parking', 'Van left for weeks', 'A white van has been in visitor parking for three weeks.', 'resolved', 'low', now() - interval '150 days'),
    (oc, owners[11], (cc ->> 'Pets')::uuid, 'unit', u_ids[15], null, null, null, 'Dog barking all day', 'The dog barks for hours when the owners are out.', 'acknowledged', 'normal', now() - interval '20 days'),
    (oc, tenants[2], (cc ->> 'Pets')::uuid, 'common_area', null, null, null, 'Garden', 'Dog mess in the garden', 'Please remind owners to pick up after their dogs.', 'resolved', 'low', now() - interval '100 days'),
    (oc, owners[7], (cc ->> 'Safety')::uuid, 'common_area', null, null, null, 'Main gate', 'Main gate not closing', 'The pedestrian gate stays open, anyone can walk in.', 'resolved', 'urgent', now() - interval '160 days'),
    (oc, owners[13], (cc ->> 'Safety')::uuid, 'common_area', null, null, null, 'Pool area', 'Broken tile by the pool', 'Sharp broken tile near the steps into the pool.', 'new', 'high', now() - interval '4 hours'),
    (oc, owners[15], (cc ->> 'Maintenance')::uuid, 'supplier', null, null, (sup ->> 'gardening')::uuid, 'Front garden', 'Sprinklers flooding the path', 'The sprinklers wet the path every morning at 9am.', 'resolved', 'low', now() - interval '200 days'),
    (oc, owners[16], (cc ->> 'Noise')::uuid, 'unit', u_ids[7], null, null, null, 'Noise complaint', 'Loud furniture moving late at night.', 'closed', 'low', now() - interval '230 days'),
    (oc, owners[17], (cc ->> 'Other')::uuid, 'common_area', null, null, null, null, 'Wi-Fi in community room', 'Could we get Wi-Fi in the community room for meetings?', 'new', 'low', now() - interval '8 days');

  insert into public.complaint_updates (community_id, complaint_id, author_id, body, new_status)
  select oc, c.id, admin_id, 'Thank you — we have contacted the lift company and an engineer is booked for tomorrow morning.', 'in_progress'
  from public.complaints c where c.title = 'Lift out of order';

  -- -------------------------------------------------------------------------
  -- Documents (metadata; files can be uploaded later)
  -- -------------------------------------------------------------------------
  insert into public.documents (community_id, folder, title, description, visibility, original_language, extracted_text, uploaded_by) values
    (oc, 'Rules', 'Community statutes (Estatutos)', 'The legal statutes of the community of owners.', 'all', 'es', 'Estatutos de la Comunidad de Propietarios Oceana Gardens…', admin_id),
    (oc, 'Rules', 'House rules 2026', 'Everyday rules for all residents.', 'all', 'en', 'Quiet hours are 23:00 to 08:00…', admin_id),
    (oc, 'Meetings', 'Minutes – Annual General Meeting 2026', 'Approved minutes of the last AGM.', 'all', 'en', 'Present: 24 owners in person, 6 by proxy…', admin_id),
    (oc, 'Finance', 'Budget ' || extract(year from current_date), 'Approved annual budget.', 'all', 'en', null, treasurer_id),
    (oc, 'Finance', 'Insurance policy summary', 'Cover, excess and claims contact.', 'owners', 'es', null, treasurer_id),
    (oc, 'Contracts', 'Concierge service contract', 'Signed contract with Conserjería Integral.', 'admins', 'es', null, admin_id);

  -- -------------------------------------------------------------------------
  -- Meetings (announce + track; notifications created by trigger)
  -- -------------------------------------------------------------------------
  insert into public.meetings (community_id, title, meeting_type, starts_at, duration_minutes, location, meeting_url, agenda, status, created_by)
  values (oc, 'Annual General Meeting ' || (extract(year from current_date) - 1), 'agm', now() - interval '200 days', 120,
    'Community room, Block A', null, E'1. Approval of accounts\n2. Budget for the new year\n3. Election of president\n4. Pool opening hours\n5. Any other business', 'held', admin_id)
  returning id into mtg;
  insert into public.meeting_minutes (community_id, meeting_id, document_id, summary, decisions)
  values (oc, mtg, (select id from public.documents where title like 'Minutes%' and community_id = oc),
    'The accounts were approved. The new budget was approved with a 3% increase. María López continues as administrator and Peter Johansson was elected treasurer. Pool hours were extended to 20:00.',
    '{"Accounts approved","Budget approved (+3%)","Peter Johansson elected treasurer","Pool open until 20:00"}');
  insert into public.action_items (community_id, meeting_id, title, owner_name, due_date, status) values
    (oc, mtg, 'Get three quotes for the Block C roof', 'Administrator', current_date - 120, 'done'),
    (oc, mtg, 'Install extra lighting in the garage', 'Administrator', current_date - 60, 'done'),
    (oc, mtg, 'Review concierge contract before renewal', 'Treasurer', current_date + 30, 'open');

  insert into public.meetings (community_id, title, meeting_type, starts_at, duration_minutes, location, meeting_url, agenda, created_by)
  values
    (oc, 'Committee meeting – roof works', 'committee', date_trunc('day', now()) + interval '12 days 18 hours', 60,
     null, 'https://zoom.us/j/1234567890', E'1. Roof quotes\n2. Levy timetable\n3. Garden contract renewal', admin_id),
    (oc, 'Annual General Meeting ' || extract(year from current_date), 'agm', date_trunc('day', now()) + interval '45 days 17 hours', 120,
     'Community room, Block A', 'https://teams.microsoft.com/l/meetup-join/sample', E'1. Approval of accounts\n2. Budget for next year\n3. Roof works update\n4. Election of committee\n5. Any other business', admin_id);

  update public.complaints set kind = 'incident'
  where community_id = oc and category_id in ((cc ->> 'Maintenance')::uuid, (cc ->> 'Safety')::uuid)
     or (community_id = oc and title in ('Bins overflowing'));

  -- Suggested topics for future meetings, with upvotes
  insert into public.meeting_topics (community_id, title, description, proposed_by, status, meeting_id, created_at) values
    (oc, 'Solar panels on the roofs', 'Could we get quotes for solar panels to reduce the common-area electricity bill?', owners[3], 'open', null, now() - interval '30 days'),
    (oc, 'Wi-Fi in the community room', 'Useful for meetings and for residents who work from home.', owners[17], 'open', null, now() - interval '8 days'),
    (oc, 'Electric car chargers in the garage', 'Several owners are thinking about electric cars.', owners[9], 'open', null, now() - interval '21 days'),
    (oc, 'Extend pool season to November', 'The weather is often good in early November.', owners[12], 'open', null, now() - interval '14 days'),
    (oc, 'Stricter rules for holiday lets', 'Noise and pool-rule problems with short-term guests.', owners[2], 'open', null, now() - interval '5 days'),
    (oc, 'Review the garden contract before it renews', 'Contract ends soon — are we happy with the service?', treasurer_id, 'on_agenda',
      (select id from public.meetings where community_id = oc and meeting_type = 'committee' limit 1), now() - interval '25 days'),
    (oc, 'Replace the entrance intercom', 'The Block A intercom is hard to hear for older residents.', owners[15], 'discussed',
      (select id from public.meetings where community_id = oc and status = 'held' limit 1), now() - interval '220 days');

  -- Votes: a spread of members upvote each open topic (one vote each).
  insert into public.topic_votes (topic_id, profile_id, community_id)
  select t.id, p.pid, oc
  from public.meeting_topics t
  cross join lateral (
    select pid from unnest(all_owners || tenants) with ordinality as x(pid, ord)
    where x.ord % (case t.title when 'Solar panels on the roofs' then 2 when 'Electric car chargers in the garage' then 3
                                when 'Stricter rules for holiday lets' then 2 when 'Wi-Fi in the community room' then 5 else 4 end) = 0
  ) p
  where t.community_id = oc;

  -- -------------------------------------------------------------------------
  -- Key contacts: committee, management, on-site staff, services, emergencies, block representatives
  -- -------------------------------------------------------------------------
  insert into public.key_contacts (community_id, building_id, role_title, contact_group, profile_id, name, organisation, phone, whatsapp, email, hours, notes, sort) values
    (oc, null, 'President', 'committee', owners[1], 'James Whitfield', null, '+34 611 000 001', '+34 611 000 001', 'president@oceanagardens.test', 'Evenings and weekends', 'Chairs the committee and the AGM. Contact for decisions about the community.', 1),
    (oc, null, 'Vice-president', 'committee', owners[2], 'Ingrid Larsen', null, '+34 611 000 002', null, 'ingrid.larsen@oceanagardens.test', 'Weekdays', 'Stands in for the president.', 2),
    (oc, null, 'Secretary', 'committee', owners[7], 'Eleanor Hughes', null, '+34 611 000 007', null, 'secretary@oceanagardens.test', 'Weekdays 10:00 – 18:00', 'Meeting notices, agendas and minutes.', 3),
    (oc, null, 'Treasurer', 'committee', treasurer_id, 'Peter Johansson', null, '+34 600 100 202', null, 'treasurer@oceanagardens.test', 'Weekdays', 'Community fees, payments and the yearly budget.', 4),
    (oc, b_ids[1], 'Block A representative', 'committee', owners[3], 'Hans Becker', null, '+34 611 000 003', '+34 611 000 003', null, 'Any time before 21:00', 'Your first contact for the Block A entrance, stairs and lift.', 5),
    (oc, b_ids[2], 'Block B representative', 'committee', owners[13], 'Isabel Moreno', null, '+34 611 000 013', '+34 611 000 013', null, 'Mornings', 'Your first contact for the Block B entrance, stairs and lift.', 5),
    (oc, b_ids[3], 'Block C representative', 'committee', owners[6], 'Carmen Ruiz', null, '+34 611 000 006', null, 'carmen.ruiz@oceanagardens.test', 'Afternoons', 'Your first contact for the Block C entrance, stairs and lift.', 5),
    (oc, null, 'Property administrator', 'management', null, 'Elena Castro', 'Administración de Fincas Marbella', '+34 952 000 111', null, 'elena@fincasmarbella.test', 'Mon – Fri 09:00 – 14:00', 'Day-to-day management, insurance claims, legal and fee questions.', 10),
    (oc, null, 'Community office', 'management', admin_id, 'María López', 'Oceana Gardens office', '+34 600 100 201', null, 'admin@oceanagardens.test', 'Mon – Fri 09:00 – 14:00', 'Block A, ground floor. Keys, garage remotes, moving in or out.', 11),
    (oc, null, 'Concierge', 'staff', null, 'Miguel Torres', 'Conserjería Integral', '+34 600 100 200', '+34 600 100 200', 'miguel@conserjeria.test', 'Every day 08:00 – 22:00', 'At the main gate. Accepts parcels. First call for leaks, lifts and access problems.', 20),
    (oc, null, 'Maintenance and repairs', 'services', null, 'Jorge Ramos', 'Reparaciones Rápidas', '+34 611 222 333', '+34 611 222 333', 'jorge@reparaciones.test', 'Mon – Sat 08:00 – 18:00', 'Plumbing, electrics and small repairs in shared areas. Book through the office or concierge.', 30),
    (oc, null, 'Pool', 'services', null, 'Laura Gómez', 'AquaClear Piscinas', '+34 952 100 002', null, 'service@aquaclear.test', 'Mon – Fri 08:00 – 16:00', null, 31),
    (oc, null, 'Gardens', 'services', null, 'Antonio Pérez', 'Jardines del Sol S.L.', '+34 952 100 001', null, 'info@jardinesdelsol.test', 'Mon – Fri 07:30 – 15:30', null, 32),
    (oc, null, 'Cleaning', 'services', null, 'Rosa Martín', 'LimpiaMax Servicios', '+34 952 100 004', null, 'rosa@limpiamax.test', 'Mon – Sat 07:00 – 13:00', null, 33),
    (oc, null, 'Emergencies', 'emergency', null, null, 'Police, fire and ambulance', '112', null, null, '24 hours', null, 40),
    (oc, null, 'Lift emergency line', 'emergency', null, null, 'Elevadores Costa S.A.', '+34 900 123 456', null, 'avisos@elevadorescosta.test', '24 hours', 'If someone is stuck in a lift. Press the alarm button in the lift first.', 41),
    (oc, null, 'Local police', 'emergency', null, null, 'Policía Local', '092', null, null, '24 hours', null, 42),
    (oc, null, 'Insurance claims', 'services', null, null, 'Seguros Mediterráneo', '+34 952 100 006', null, 'polizas@segurosmed.test', 'Mon – Fri 09:00 – 18:00', 'Policy for the building and shared areas. Tell the administrator first.', 34);
  insert into public.key_contacts (community_id, role_title, contact_group, name, phone, visibility, sort) values
    (oc, 'Committee private line', 'committee', 'Committee', '+34 611 999 000', 'admins', 9);

  -- -------------------------------------------------------------------------
  -- Demo Heights: minimal data for isolation tests
  -- -------------------------------------------------------------------------
  insert into public.buildings (community_id, name) values (dm, 'Main building') returning id into bid;
  insert into public.units (community_id, building_id, label, floor, coefficient) values (dm, bid, '1', 1, 50), (dm, bid, '2', 2, 50);
  insert into public.expense_categories (community_id, name) values (dm, 'Cleaning') returning id into uid;
  insert into public.suppliers (community_id, name, service_type) values (dm, 'Demo Cleaners Ltd', 'Cleaning') returning id into s_id;
  insert into public.invoices (community_id, supplier_id, category_id, invoice_number, issue_date, net_cents, vat_cents)
  values (dm, s_id, uid, 'DEMO-001', current_date, 10000, 2000);
  insert into public.key_contacts (community_id, role_title, contact_group, name, phone) values (dm, 'Caretaker', 'staff', 'Demo Caretaker', '+44 20 0000 0000');
end $$;
