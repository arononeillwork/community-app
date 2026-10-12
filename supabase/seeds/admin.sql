-- Administration sample data (Oceana Gardens), loaded after seed.sql.
--   * A landlord-added winter let waiting for the administrator's approval.
--   * A few questions residents asked the assistant that it could not answer yet, so the
--     administrator's "Questions the assistant couldn't answer" list has something to work with.
-- Safe to run twice: everything is looked up by natural keys and skipped if it already exists.

do $$
declare
  oc constant uuid := '0cea0a00-0000-4000-8000-000000000001';
  new_tenant uuid;
  landlord uuid;
  flat uuid;
  q record;
  asker uuid;
  conv uuid;
begin
  if not exists (select 1 from public.communities where id = oc) then
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- Pending tenancy: Lars Nilsson (owner of C-2B) has added a winter tenant.
  -- -------------------------------------------------------------------------
  select id into new_tenant from auth.users where email = 'sofia.lindqvist@oceanagardens.test';
  if new_tenant is null then
    new_tenant := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', new_tenant, 'authenticated', 'authenticated',
      'sofia.lindqvist@oceanagardens.test', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"full_name": "Sofia Lindqvist"}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), new_tenant, new_tenant::text,
      jsonb_build_object('sub', new_tenant::text, 'email', 'sofia.lindqvist@oceanagardens.test', 'email_verified', true),
      'email', now(), now(), now());
    update public.profiles set phone = '+46 70 412 33 81' where id = new_tenant;
  end if;

  select u.id, o.owner_id into flat, landlord
  from public.units u
  join public.unit_ownerships o on o.unit_id = u.id and (o.end_date is null or o.end_date >= current_date)
  where u.community_id = oc and u.label = 'C-2B'
  limit 1;

  if flat is not null and not exists (select 1 from public.tenancies where tenant_id = new_tenant and unit_id = flat) then
    insert into public.tenancies (community_id, unit_id, tenant_id, added_by, tenancy_type, start_date, end_date, status, note)
    values (oc, flat, new_tenant, landlord, 'short_term', current_date + 7, current_date + 130, 'pending',
      'Winter let from November to February. Sofia is a retired teacher from Uppsala.');
    insert into public.contact_preferences (profile_id, community_id, preferred_method, best_times, visibility)
    values (new_tenant, oc, 'whatsapp', 'Mornings', 'block')
    on conflict (profile_id, community_id) do nothing;
  end if;

  -- -------------------------------------------------------------------------
  -- Questions the assistant could not answer (the resident's question carries unanswered = true).
  -- -------------------------------------------------------------------------
  for q in select * from (values
      ('owner4@oceanagardens.test', 'chat', 'Can I put an air-conditioning unit on my terrace, or do I need permission from the community first?', 3),
      ('tenant1@oceanagardens.test', 'whatsapp', '¿Hay alguna plaza de garaje libre que se pueda alquilar por meses?', 6),
      ('owner9@oceanagardens.test', 'voice', 'When will the scaffolding for the Block C roof works go up?', 1),
      ('tenant5@oceanagardens.test', 'chat', 'Is there a key safe, or somewhere I can leave a spare key for my cleaner?', 9),
      ('owner10@oceanagardens.test', 'chat', 'Gibt es einen abschließbaren Fahrradraum in der Garage?', 12))
    as t(email, channel, question, days_ago)
  loop
    select p.id into asker from public.profiles p where p.email = q.email;
    continue when asker is null;
    continue when exists (select 1 from public.assistant_messages m where m.community_id = oc and m.content = q.question);

    insert into public.assistant_conversations (community_id, profile_id, channel, created_at)
    values (oc, asker, q.channel, now() - make_interval(days => q.days_ago, hours => 2))
    returning id into conv;
    insert into public.assistant_messages (community_id, conversation_id, role, content, unanswered, created_at) values
      (oc, conv, 'user', q.question, true, now() - make_interval(days => q.days_ago, hours => 2)),
      (oc, conv, 'assistant',
       case when q.question like '¿%' then 'Todavía no tengo esa información. He pasado su pregunta a la oficina y le responderán pronto.'
            when q.question like 'Gibt%' then 'Dazu habe ich leider noch keine Information. Ich habe Ihre Frage an das Büro weitergeleitet.'
            else 'I don''t have that information yet, so I''ve passed your question to the office. They will get back to you.' end,
       false, now() - make_interval(days => q.days_ago, hours => 2) + interval '4 seconds');
  end loop;
end $$;
