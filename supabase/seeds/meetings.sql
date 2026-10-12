-- Meetings sample data for Oceana Gardens (runs after supabase/seed.sql).
-- Adds the extraordinary meeting that approved the Block C roof levy, a summer get-together,
-- an upcoming coffee morning, RSVPs from residents, and one declined topic.
-- Times are wall-clock times in the community's time zone. Safe to run twice.
do $$
declare
  oc constant uuid := '0cea0a00-0000-4000-8000-000000000001';
  tz text;
  admin_id uuid;
  egm uuid;
  drinks uuid;
  coffee uuid;
  committee uuid;
  agm uuid;
begin
  if exists (select 1 from public.meetings where community_id = oc and title = 'Extraordinary meeting – Block C roof') then
    return;
  end if;

  select timezone into tz from public.communities where id = oc;
  select id into admin_id from auth.users where email = 'admin@oceanagardens.test';

  -- -------------------------------------------------------------------------
  -- Past: the extraordinary meeting that approved the roof works and levy
  -- -------------------------------------------------------------------------
  insert into public.meetings (community_id, title, meeting_type, starts_at, duration_minutes, location, meeting_url, agenda, status, created_by)
  values (oc, 'Extraordinary meeting – Block C roof', 'extraordinary',
    ((current_date - 75)::timestamp + time '18:30') at time zone tz, 90,
    'Community room, Block A', 'https://zoom.us/j/5550192837',
    E'1. Condition of the Block C roof (surveyor''s report)\n2. Comparison of the three quotes\n3. Approval of the works\n4. Levy to pay for the works\n5. Timetable and access to Block C flats',
    'held', admin_id)
  returning id into egm;

  insert into public.meeting_minutes (community_id, meeting_id, summary, decisions, recording_url)
  values (oc, egm,
    'Owners reviewed the surveyor''s report on the Block C roof, which confirmed water is getting in above the top-floor flats. Three quotes were compared and the works were approved. The cost will be covered by a one-off levy, split by each flat''s participation share, payable within 30 days of the statement.',
    '{"Waterproofing of the Block C roof approved","Impermeabilizaciones Costa chosen as contractor","One-off levy of €4,000 split by participation share","Works to start after the summer season"}',
    'https://zoom.us/rec/share/oceana-gardens-egm-roof');

  insert into public.action_items (community_id, meeting_id, title, owner_name, due_date, status, created_at) values
    (oc, egm, 'Sign the contract with the roofing company', 'Administrator', current_date - 55, 'done', now() - interval '75 days'),
    (oc, egm, 'Send levy statements to all owners', 'Treasurer', current_date - 45, 'done', now() - interval '75 days'),
    (oc, egm, 'Agree work dates with Block C top-floor residents', 'Block C representative', current_date + 10, 'open', now() - interval '75 days');

  -- A topic raised and declined at that meeting.
  insert into public.meeting_topics (community_id, title, description, proposed_by, status, meeting_id, admin_note, created_at)
  values (oc, 'Allow barbecues on the roof terraces', 'Gas barbecues only, with a booking system.',
    (select id from auth.users where email = 'owner6@oceanagardens.test'), 'declined', egm,
    'Not allowed under the building insurance policy.', now() - interval '95 days');

  -- -------------------------------------------------------------------------
  -- Past: an informal summer get-together (no minutes)
  -- -------------------------------------------------------------------------
  insert into public.meetings (community_id, title, meeting_type, starts_at, duration_minutes, location, agenda, status, created_by)
  values (oc, 'End of summer drinks by the pool', 'informal',
    ((current_date - 40)::timestamp + time '19:30') at time zone tz, 120,
    'Pool terrace', E'Welcome to new neighbours\nThank you to the garden and pool teams',
    'held', admin_id)
  returning id into drinks;

  -- -------------------------------------------------------------------------
  -- Upcoming: a coffee morning
  -- -------------------------------------------------------------------------
  insert into public.meetings (community_id, title, meeting_type, starts_at, duration_minutes, location, agenda, created_by)
  values (oc, 'Coffee morning for new residents', 'informal',
    ((current_date + 5)::timestamp + time '10:30') at time zone tz, 90,
    'Community room, Block A',
    E'Meet your neighbours and the concierge\nHow the bins, pool and parking work\nQuestions about the app',
    admin_id)
  returning id into coffee;

  -- Past meetings were not announced through the app, so remove the "New meeting" alerts the trigger made.
  delete from public.notifications where community_id = oc and link in ('/meetings/' || egm, '/meetings/' || drinks);

  -- -------------------------------------------------------------------------
  -- RSVPs for the upcoming meetings
  -- -------------------------------------------------------------------------
  select id into committee from public.meetings where community_id = oc and title = 'Committee meeting – roof works' limit 1;
  select id into agm from public.meetings where community_id = oc and meeting_type = 'agm' and status = 'scheduled' order by starts_at limit 1;

  insert into public.meeting_rsvps (meeting_id, profile_id, community_id, response, updated_at)
  select r.meeting_id, u.id, oc, r.response::public.rsvp, now() - (r.days_ago || ' days')::interval
  from (values
    (committee, 'owner1@oceanagardens.test', 'online', 3),
    (committee, 'treasurer@oceanagardens.test', 'online', 2),
    (committee, 'owner7@oceanagardens.test', 'online', 2),
    (committee, 'owner3@oceanagardens.test', 'not_attending', 1),
    (agm, 'owner1@oceanagardens.test', 'attending', 6),
    (agm, 'treasurer@oceanagardens.test', 'attending', 6),
    (agm, 'owner2@oceanagardens.test', 'attending', 5),
    (agm, 'owner3@oceanagardens.test', 'online', 5),
    (agm, 'owner5@oceanagardens.test', 'attending', 4),
    (agm, 'owner7@oceanagardens.test', 'attending', 4),
    (agm, 'owner8@oceanagardens.test', 'not_attending', 3),
    (agm, 'owner9@oceanagardens.test', 'online', 3),
    (agm, 'owner10@oceanagardens.test', 'online', 2),
    (agm, 'owner12@oceanagardens.test', 'attending', 2),
    (agm, 'owner15@oceanagardens.test', 'attending', 1),
    (agm, 'owner18@oceanagardens.test', 'not_attending', 1),
    (coffee, 'owner17@oceanagardens.test', 'attending', 1),
    (coffee, 'owner15@oceanagardens.test', 'attending', 1),
    (coffee, 'owner11@oceanagardens.test', 'attending', 1),
    (coffee, 'owner6@oceanagardens.test', 'attending', 0),
    (coffee, 'tenant5@oceanagardens.test', 'attending', 0),
    (coffee, 'tenant4@oceanagardens.test', 'not_attending', 0)
  ) as r(meeting_id, email, response, days_ago)
  join auth.users u on u.email = r.email
  where r.meeting_id is not null
  on conflict (meeting_id, profile_id) do nothing;
end $$;

-- Tidy-ups that run every time (idempotent).
do $$
declare
  oc constant uuid := '0cea0a00-0000-4000-8000-000000000001';
  tz text;
begin
  select timezone into tz from public.communities where id = oc;

  -- seed.sql creates last year's AGM at now() - 200 days, so it shows a random start time such as 21:41.
  -- The minutes document says it started at 18:00, so keep the date and set that time.
  update public.meetings
  set starts_at = ((starts_at at time zone tz)::date + time '18:00') at time zone tz
  where community_id = oc and meeting_type = 'agm' and status = 'held'
    and (starts_at at time zone tz)::time <> time '18:00';

  -- Meetings recorded after they took place were never announced, so drop their "New meeting" notices.
  delete from public.notifications n
  using public.meetings m
  where m.community_id = oc and n.community_id = oc and n.kind = 'meeting'
    and n.link = '/meetings/' || m.id
    and m.starts_at + make_interval(mins => m.duration_minutes) < m.created_at;
end $$;
