-- Meetings: small access fixes found while building the meetings pages.
--
-- 1. Suggested topics show who proposed them. Residents cannot read other people's profiles
--    (profiles are private outside the block directory), so v_meeting_topics returned a blank
--    proposer for everyone but administrators. Proposing a topic is a public act inside the
--    community, so the proposer's name is exposed for topics only, and only to members of the
--    topic's community.
-- 2. RSVPs: a reply must point at a meeting of the same community, and replies can only be
--    given or changed while the meeting is still scheduled or postponed.
-- 3. Meeting notices are not sent for meetings recorded after the fact, or when a meeting is
--    marked as held.

-- ---------------------------------------------------------------------------
-- 1. Proposer names on suggested topics
-- ---------------------------------------------------------------------------
create or replace function public.topic_proposer_name(t uuid)
returns text language sql stable security definer set search_path = '' as $$
  select p.full_name
  from public.meeting_topics mt
  join public.profiles p on p.id = mt.proposed_by
  where mt.id = t and public.is_member(mt.community_id)
$$;

revoke execute on function public.topic_proposer_name(uuid) from anon;

create or replace view public.v_meeting_topics with (security_invoker = true) as
select t.*, public.topic_proposer_name(t.id) as proposed_by_name, m.title as meeting_title, m.starts_at as meeting_starts_at,
  (select count(*) from public.topic_votes v where v.topic_id = t.id)::int as votes,
  exists (select 1 from public.topic_votes v where v.topic_id = t.id and v.profile_id = auth.uid()) as voted_by_me
from public.meeting_topics t
left join public.meetings m on m.id = t.meeting_id;

-- ---------------------------------------------------------------------------
-- 2. RSVPs belong to a meeting of the same community that is still going ahead
-- ---------------------------------------------------------------------------
drop policy if exists "own rsvp" on public.meeting_rsvps;

create policy "own rsvp" on public.meeting_rsvps for all
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and public.is_member(community_id)
    and exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and m.community_id = meeting_rsvps.community_id
        and m.status in ('scheduled', 'postponed')
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Meeting notices only when there is something to act on
-- ---------------------------------------------------------------------------
-- The original trigger sent "New meeting: …" for meetings recorded after the fact (status held or
-- cancelled on insert, e.g. last year's AGM) and "Updated: …" when an administrator marked a meeting
-- as held after adding the minutes. Residents cannot do anything with either, so both are skipped.
-- Everything else is unchanged: new upcoming meetings, and changes of date, place, link or status
-- (including cancellations) still notify every active member.
create or replace function public.notify_meeting()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  kind text;
  title text;
begin
  if tg_op = 'INSERT' then
    if new.status in ('held', 'cancelled') then
      return new;
    end if;
    kind := 'meeting'; title := 'New meeting: ' || new.title;
  elsif new.status = 'held' then
    return new;
  elsif new.status is distinct from old.status or new.starts_at is distinct from old.starts_at
        or new.meeting_url is distinct from old.meeting_url or new.location is distinct from old.location then
    kind := 'meeting_update';
    title := case when new.status = 'cancelled' then 'Cancelled: ' else 'Updated: ' end || new.title;
  else
    return new;
  end if;
  insert into public.notifications (community_id, profile_id, kind, title, body, link)
  select distinct new.community_id, m.profile_id, kind, title,
    to_char(new.starts_at at time zone c.timezone, 'Dy DD Mon YYYY, HH24:MI') || coalesce(' · ' || new.location, ''),
    '/meetings/' || new.id
  from public.memberships m join public.communities c on c.id = m.community_id
  where m.community_id = new.community_id and m.status = 'active';
  return new;
end $$;
