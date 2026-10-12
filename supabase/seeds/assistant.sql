-- Ask (community assistant) sample data for Oceana Gardens, loaded after seed.sql.
-- Twelve questions the office is asked every season, answered once so the assistant can answer
-- them for everyone. Safe to run twice: an entry is skipped if the same question already exists.

do $$
declare
  oc constant uuid := '0cea0a00-0000-4000-8000-000000000001';
  office uuid;
begin
  if not exists (select 1 from public.communities where id = oc) then
    return;
  end if;
  select id into office from public.profiles where email = 'admin@oceanagardens.test';

  insert into public.faq_entries (community_id, question, answer, created_by, created_at)
  select oc, f.question, f.answer, office, now() - make_interval(days => f.days_ago)
  from (values
    ('How do I get a garage remote?',
     E'Order one from the community office in Block A, ground floor (Monday to Friday, 09:00 – 14:00). A remote costs €45 and is programmed while you wait. Bring proof that you own or rent a flat.\nIf a remote is lost or stolen, tell the office straight away so it can be switched off.',
     120),
    ('Can I bring guests to the pool?',
     E'Yes, up to four guests per flat at a time, and you need to stay with them. Guests follow the same pool rules: shower first, no glass, and children under 12 with an adult.\nHoliday-let guests count as residents while they are staying.',
     110),
    ('What do I need to do when moving in or out?',
     E'Tell the office at least three days before so the service lift in your block can be reserved and protected with blankets.\nRemoval vans can park at the front gate on weekdays 09:00 – 19:00 and on Saturdays 10:00 – 14:00.\nNew residents should register with the office to get keys, a garage remote and access to this app.',
     100),
    ('What are the quiet hours?',
     E'Quiet hours are 23:00 – 08:00 every day, plus 15:00 – 17:00 during the summer siesta (June to September).\nDrilling and other noisy work is allowed on weekdays 09:00 – 14:00 and 17:00 – 20:00, and on Saturdays 10:00 – 14:00. Never on Sundays or public holidays.',
     95),
    ('Can the concierge take in my parcels?',
     E'Yes. The concierge at the main gate accepts parcels every day 08:00 – 22:00 and keeps them for up to seven days.\nUse this delivery address: Oceana Gardens, Conserjería, Avenida del Mar 12, 29670 San Pedro de Alcántara, plus your flat number. Food deliveries and very large items cannot be stored.',
     90),
    ('I am locked out of my flat. Can someone let me in?',
     E'If you have left a spare key with the office, the concierge can open your door after checking your ID (every day 08:00 – 22:00). To leave a spare key, bring it to the office in a sealed envelope with your flat number.\nOutside those hours, call a locksmith. The concierge desk keeps a list of local ones.',
     80),
    ('When are the community fees due?',
     E'Community fees are charged every quarter and are due on 1 January, 1 April, 1 July and 1 October.\nMost owners pay by direct debit (domiciliación bancaria). If you pay by bank transfer, put your flat number as the reference. Owners can see their statement under My flat.\nTenants do not pay community fees: they are the owner''s responsibility.',
     75),
    ('Are pets allowed?',
     E'Yes, dogs and cats are welcome. Dogs must be on a lead in all shared areas, are not allowed in the pool area, and you need to clean up after them straight away.\nDogs classed as potentially dangerous (PPP) need the town hall licence and insurance. Please give a copy to the office.',
     70),
    ('Can I have a barbecue on my terrace?',
     E'Charcoal and gas barbecues are not allowed on balconies, terraces or the roof terraces because of the fire risk and smoke. Electric grills are fine on ground-floor terraces.\nA proposal to allow gas barbecues on the roof terraces with a booking system is open for the next meeting. You can vote for it under Meetings.',
     60),
    ('Can I put up a satellite dish?',
     E'Not on the façade or on balcony railings. A dish can go on the roof, on the community''s mounting rail, fitted by an installer the office has approved. Ask the office first; roof access costs a one-off €60.\nThe shared aerial already carries Spanish channels and the main British, German, Dutch and Scandinavian ones.',
     50),
    ('Can I rent my flat to holiday guests?',
     E'Yes, if the flat has a tourist licence (a VFT number from the Junta de Andalucía) and you register your guests with the office before they arrive.\nGuests must follow the house rules, and the owner is responsible for any damage or noise complaints. Add guests in the app under My flat, then Add tenant, and choose Holiday let.',
     40),
    ('The intercom in my flat is not working. Who fixes it?',
     E'The entrance panels and the wiring in the shared areas belong to the community: report the fault with Report a problem or tell the concierge.\nThe handset inside your flat belongs to the owner. The community''s maintenance company, Reparaciones Rápidas, can replace it at the owner''s cost.',
     30)
  ) as f(question, answer, days_ago)
  where not exists (
    select 1 from public.faq_entries e where e.community_id = oc and e.question = f.question
  );
end $$;
