-- Meetings: access tests for meetings, RSVPs, minutes, action items, topics and votes. Run with:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -q -f supabase/tests/rls_meetings_test.sql
-- Each check raises an exception on failure; the script stops at the first failure. Everything runs
-- inside begin/rollback, so the sample data is left as it was.
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

-- Fixed points in the sample data (looked up as postgres before switching role).
create temp table fx as
select
  (select id from public.meetings where title = 'Committee meeting – roof works') as upcoming,
  (select id from public.meetings where status = 'held' and meeting_type = 'agm' limit 1) as held,
  (select id from public.meeting_topics where title = 'Solar panels on the roofs') as open_topic,
  (select id from public.meeting_topics where status = 'on_agenda' limit 1) as agenda_topic,
  (select id from auth.users where email = 'owner4@oceanagardens.test') as owner4;
grant select on fx to authenticated, anon;

-- ---------------------------------------------------------------- anonymous
begin;
set local role anon;
select pg_temp.check((select count(*) from meetings) = 0, 'anon cannot read meetings');
select pg_temp.check((select count(*) from v_meeting_topics) = 0, 'anon cannot read topics');
select pg_temp.check((select count(*) from meeting_rsvps) = 0, 'anon cannot read RSVPs');
rollback;

-- ---------------------------------------------------------------- tenant: reading
begin;
select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select count(*) from meetings) = (select count(*) from meetings where community_id = '0cea0a00-0000-4000-8000-000000000001') and (select count(*) from meetings) > 0,
  'tenant reads only their community''s meetings');
select pg_temp.check((select count(*) from meeting_minutes) > 0, 'tenant reads minutes');
select pg_temp.check((select count(*) from action_items) > 0, 'tenant reads action items');
select pg_temp.check((select count(*) from v_meeting_topics where proposed_by_name is null) = 0,
  'tenant sees who proposed each topic');
select pg_temp.check((select count(*) from profiles where id = (select owner4 from fx)) = 0,
  'tenant still cannot read other people''s profiles');
select pg_temp.check(public.topic_proposer_name((select open_topic from fx)) = 'Hans Becker', 'topic_proposer_name returns the proposer to members');
rollback;

-- ---------------------------------------------------------------- tenant: writing
begin;
select pg_temp.login('tenant1@oceanagardens.test');
do $$ begin
  insert into meetings (community_id, title, starts_at) values ('0cea0a00-0000-4000-8000-000000000001', 'Tenant meeting', now() + interval '3 days');
  raise exception 'FAIL: tenant created a meeting';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'tenant cannot create a meeting');
update meetings set status = 'cancelled' where id = (select upcoming from fx);
select pg_temp.check((select status from meetings where id = (select upcoming from fx)) = 'scheduled', 'tenant cannot cancel a meeting');
do $$ begin
  insert into meeting_minutes (community_id, meeting_id, summary) values ('0cea0a00-0000-4000-8000-000000000001', (select upcoming from fx), 'Fake minutes');
  raise exception 'FAIL: tenant added minutes';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'tenant cannot add minutes');
do $$ begin
  insert into action_items (community_id, meeting_id, title) values ('0cea0a00-0000-4000-8000-000000000001', (select held from fx), 'Fake action');
  raise exception 'FAIL: tenant added an action item';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'tenant cannot add action items');
rollback;

-- ---------------------------------------------------------------- RSVPs
begin;
select pg_temp.login('tenant1@oceanagardens.test');
insert into meeting_rsvps (meeting_id, profile_id, community_id, response)
values ((select upcoming from fx), auth.uid(), '0cea0a00-0000-4000-8000-000000000001', 'online');
select pg_temp.check((select response from meeting_rsvps where meeting_id = (select upcoming from fx) and profile_id = auth.uid()) = 'online', 'tenant can RSVP to an upcoming meeting');
update meeting_rsvps set response = 'attending' where meeting_id = (select upcoming from fx) and profile_id = auth.uid();
select pg_temp.check((select response from meeting_rsvps where meeting_id = (select upcoming from fx) and profile_id = auth.uid()) = 'attending', 'tenant can change their RSVP');
do $$ begin
  insert into meeting_rsvps (meeting_id, profile_id, community_id, response)
  values ((select upcoming from fx), (select owner4 from fx), '0cea0a00-0000-4000-8000-000000000001', 'not_attending');
  raise exception 'FAIL: tenant replied for someone else';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'tenant cannot RSVP for someone else');
do $$ begin
  insert into meeting_rsvps (meeting_id, profile_id, community_id, response)
  values ((select held from fx), auth.uid(), '0cea0a00-0000-4000-8000-000000000001', 'attending');
  raise exception 'FAIL: RSVP to a held meeting';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'no RSVP to a meeting that has been held');
rollback;

begin;
select pg_temp.login('tenant1@oceanagardens.test');
do $$ begin
  insert into meeting_rsvps (meeting_id, profile_id, community_id, response)
  values ((select upcoming from fx), auth.uid(), 'de300000-0000-4000-8000-000000000002', 'attending');
  raise exception 'FAIL: RSVP filed under another community';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'RSVP cannot be filed under another community');
rollback;

begin;
-- RSVP closes once a meeting is cancelled.
update meetings set status = 'cancelled' where id = (select upcoming from fx);
select pg_temp.login('tenant1@oceanagardens.test');
do $$ begin
  insert into meeting_rsvps (meeting_id, profile_id, community_id, response)
  values ((select upcoming from fx), auth.uid(), '0cea0a00-0000-4000-8000-000000000001', 'attending');
  raise exception 'FAIL: RSVP to a cancelled meeting';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'no RSVP to a cancelled meeting');
rollback;

-- ---------------------------------------------------------------- topics and votes
begin;
delete from topic_votes where topic_id = (select agenda_topic from fx) and profile_id = (select owner4 from fx);
select pg_temp.login('owner4@oceanagardens.test');
insert into meeting_topics (community_id, title, proposed_by) values ('0cea0a00-0000-4000-8000-000000000001', 'Test topic', auth.uid());
select pg_temp.check((select status from meeting_topics where title = 'Test topic') = 'open', 'member can propose a topic');
do $$ begin
  insert into meeting_topics (community_id, title, proposed_by, status) values ('0cea0a00-0000-4000-8000-000000000001', 'Sneaky topic', auth.uid(), 'on_agenda');
  raise exception 'FAIL: member proposed a topic straight onto the agenda';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'member cannot propose a topic already on the agenda');
do $$ begin
  insert into topic_votes (topic_id, community_id) values ((select agenda_topic from fx), '0cea0a00-0000-4000-8000-000000000001');
  raise exception 'FAIL: vote on a topic that is no longer open';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'no votes on topics that are no longer open');
do $$ begin
  update meeting_topics set status = 'declined' where title = 'Test topic';
  raise exception 'FAIL: member changed topic status';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select pg_temp.check(true, 'member cannot change a topic''s status');
rollback;

-- ---------------------------------------------------------------- admin
begin;
select pg_temp.login('admin@oceanagardens.test');
insert into meetings (community_id, title, meeting_type, starts_at, location)
values ('0cea0a00-0000-4000-8000-000000000001', 'RLS test meeting', 'committee', now() + interval '10 days', 'Community room');
select pg_temp.check((select count(*) from notifications n join meetings m on n.link = '/meetings/' || m.id where m.title = 'RLS test meeting') = 0,
  'the admin who created a meeting is not alerted about it themselves');
select pg_temp.check((select count(*) from meeting_rsvps where meeting_id = (select upcoming from fx)) > 0, 'admin reads RSVPs');
select pg_temp.check((select count(*) from profiles p join meeting_rsvps r on r.profile_id = p.id where r.meeting_id = (select upcoming from fx)) > 0,
  'admin can see who replied');
update meeting_topics set status = 'on_agenda', meeting_id = (select id from meetings where title = 'RLS test meeting')
where id = (select open_topic from fx);
select pg_temp.check((select status from meeting_topics where id = (select open_topic from fx)) = 'on_agenda', 'admin can put a topic on the agenda');
reset role;
select pg_temp.check((select count(*) from notifications n join meetings m on n.link = '/meetings/' || m.id where m.title = 'RLS test meeting')
  = (select count(distinct profile_id) from memberships where community_id = '0cea0a00-0000-4000-8000-000000000001' and status = 'active'
       and profile_id <> (select id from profiles where email = 'admin@oceanagardens.test')),
  'a new meeting notifies every active member except the person who created it');
rollback;

-- ---------------------------------------------------------------- meeting notices
begin;
select pg_temp.login('admin@oceanagardens.test');
insert into meetings (community_id, title, meeting_type, starts_at, location, status)
values ('0cea0a00-0000-4000-8000-000000000001', 'Notice test: recorded later', 'committee', now() - interval '30 days', 'Community room', 'held');
insert into meetings (community_id, title, meeting_type, starts_at, location)
values ('0cea0a00-0000-4000-8000-000000000001', 'Notice test: upcoming', 'committee', now() + interval '10 days', 'Community room');
reset role;
select pg_temp.check((select count(*) from notifications n join meetings m on n.link = '/meetings/' || m.id where m.title = 'Notice test: recorded later') = 0,
  'a meeting recorded after it was held sends no notice');
update meetings set status = 'held' where title = 'Notice test: upcoming';
select pg_temp.check((select count(*) from notifications n join meetings m on n.link = '/meetings/' || m.id
  where m.title = 'Notice test: upcoming' and n.kind = 'meeting_update') = 0, 'marking a meeting as held sends no update notice');
update meetings set status = 'cancelled' where title = 'Notice test: upcoming';
select pg_temp.check((select count(*) from notifications n join meetings m on n.link = '/meetings/' || m.id
  where m.title = 'Notice test: upcoming' and n.title like 'Cancelled:%')
  = (select count(distinct profile_id) from memberships where community_id = '0cea0a00-0000-4000-8000-000000000001' and status = 'active'
       and profile_id <> (select id from profiles where email = 'admin@oceanagardens.test')),
  'a cancellation still notifies every active member except the person who cancelled it');
rollback;

-- ---------------------------------------------------------------- other community
begin;
select pg_temp.login('admin@demoheights.test');
select pg_temp.check((select count(*) from meetings where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0, 'other community admin sees no Oceana meetings');
select pg_temp.check((select count(*) from meeting_rsvps where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0, 'other community admin sees no Oceana RSVPs');
select pg_temp.check((select count(*) from meeting_minutes where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0, 'other community admin sees no Oceana minutes');
select pg_temp.check((select count(*) from action_items where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0, 'other community admin sees no Oceana action items');
select pg_temp.check((select count(*) from v_meeting_topics where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0, 'other community admin sees no Oceana topics');
select pg_temp.check(public.topic_proposer_name((select open_topic from fx)) is null, 'topic_proposer_name reveals nothing to outsiders');
update meetings set status = 'cancelled' where id = (select upcoming from fx);
select pg_temp.check((select status from meetings where id = (select upcoming from fx)) is null, 'other community admin cannot cancel an Oceana meeting');
do $$ begin
  insert into meeting_rsvps (meeting_id, profile_id, community_id, response)
  values ((select upcoming from fx), auth.uid(), 'de300000-0000-4000-8000-000000000002', 'attending');
  raise exception 'FAIL: outsider RSVP';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'other community admin cannot RSVP to an Oceana meeting');
rollback;

reset role;
select pg_temp.check((select status from meetings where id = (select upcoming from fx)) = 'scheduled', 'sample data unchanged');
drop table fx;
