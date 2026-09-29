-- Community modules: building info, bins, local places, complaints, documents, meetings,
-- notifications, AI assistant tables, storage buckets.

create type public.complaint_target as enum ('unit', 'owner', 'common_area', 'supplier');
create type public.complaint_status as enum ('new', 'acknowledged', 'in_progress', 'resolved', 'closed');
create type public.priority as enum ('low', 'normal', 'high', 'urgent');
create type public.meeting_type as enum ('agm', 'extraordinary', 'committee', 'informal');
create type public.meeting_status as enum ('scheduled', 'postponed', 'cancelled', 'held');
create type public.rsvp as enum ('attending', 'online', 'not_attending');
create type public.report_kind as enum ('incident', 'complaint');
create type public.topic_status as enum ('open', 'on_agenda', 'discussed', 'declined');

-- ---------------------------------------------------------------------------
-- Building info + bins
-- ---------------------------------------------------------------------------
create table public.info_pages (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  title text not null,
  body text not null,
  category text not null default 'general',   -- rules, facilities, parking, emergency, general
  icon text not null default 'info',
  sort int not null default 0,
  visibility public.visibility not null default 'all',
  updated_at timestamptz not null default now()
);

create table public.bin_schedules (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  bin_type text not null,                     -- General waste, Recycling (packaging), Paper, Glass, Organic
  color text not null,                        -- display colour name, e.g. "yellow"
  color_hex text not null default '#64748b',
  weekdays int[] not null,                    -- 0 = Sunday … 6 = Saturday
  put_out_time text,                          -- "After 20:00 the evening before"
  location text,
  notes text,
  sort int not null default 0
);

-- ---------------------------------------------------------------------------
-- Local knowledge
-- ---------------------------------------------------------------------------
create table public.local_places (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  name text not null,
  place_type text not null,                   -- restaurant, cafe, walk, route, beach, shop, pharmacy, health, sight, transport
  description text,
  address text,
  lat double precision,
  lng double precision,
  phone text,
  website text,
  distance_km numeric(5,1),
  price_level int check (price_level between 1 and 4),
  step_free boolean,
  accessibility_notes text,
  route_url text,
  recommended_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Complaints
-- ---------------------------------------------------------------------------
create table public.complaint_categories (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  name text not null,
  icon text not null default 'alert-circle',
  sort int not null default 0,
  unique (community_id, name)
);

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  reporter_id uuid references public.profiles on delete set null,
  kind public.report_kind not null default 'complaint',   -- incident = something broken/dangerous; complaint = about a person/service
  category_id uuid references public.complaint_categories on delete set null,
  target_type public.complaint_target not null default 'common_area',
  target_unit_id uuid references public.units on delete set null,
  target_owner_id uuid references public.profiles on delete set null,
  target_supplier_id uuid references public.suppliers on delete set null,
  location text,
  title text not null,
  description text not null,
  photo_paths text[] not null default '{}',
  status public.complaint_status not null default 'new',
  priority public.priority not null default 'normal',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index on public.complaints (community_id, created_at desc);

create table public.complaint_updates (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  complaint_id uuid not null references public.complaints on delete cascade,
  author_id uuid references public.profiles on delete set null,
  body text not null,
  new_status public.complaint_status,
  created_at timestamptz not null default now()
);

-- Complaints are private to the reporter and admins; owners also see ones about their unit/themselves.
create or replace function public.can_see_complaint(cp public.complaints)
returns boolean language sql stable security definer set search_path = '' as $$
  select cp.reporter_id = auth.uid()
      or public.is_admin(cp.community_id)
      or cp.target_owner_id = auth.uid()
      or (cp.target_unit_id is not null and public.owns_unit(cp.target_unit_id))
$$;

create or replace function public.complaint_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.reporter_id := coalesce(new.reporter_id, auth.uid());
    if not public.is_admin(new.community_id) then
      new.status := 'new';
    end if;
  elsif new.status is distinct from old.status and not public.is_admin(new.community_id) then
    raise exception 'Only an administrator can change complaint status';
  end if;
  if new.status in ('resolved', 'closed') and new.resolved_at is null then
    new.resolved_at := now();
  end if;
  return new;
end $$;

create trigger complaint_before_write
before insert or update on public.complaints
for each row execute function public.complaint_before_write();

create view public.v_complaint_tallies with (security_invoker = true) as
select c.community_id,
  date_trunc('month', c.created_at)::date as month,
  c.kind,
  coalesce(cc.name, 'Other') as category_name,
  c.target_type,
  coalesce(u.label, s.name, p.full_name, c.location, 'Common area') as target_name,
  c.status,
  count(*) as complaint_count
from public.complaints c
left join public.complaint_categories cc on cc.id = c.category_id
left join public.units u on u.id = c.target_unit_id
left join public.suppliers s on s.id = c.target_supplier_id
left join public.profiles p on p.id = c.target_owner_id
group by 1, 2, 3, 4, 5, 6, 7;

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  folder text not null default 'General',
  title text not null,
  description text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  visibility public.visibility not null default 'all',
  original_language text not null default 'en',
  extracted_text text,
  uploaded_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create table public.document_translations (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  document_id uuid not null references public.documents on delete cascade,
  language text not null,
  translated_text text,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  created_at timestamptz not null default now(),
  unique (document_id, language)
);

-- ---------------------------------------------------------------------------
-- Meetings (announce + track; hosted externally)
-- ---------------------------------------------------------------------------
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  title text not null,
  meeting_type public.meeting_type not null default 'informal',
  starts_at timestamptz not null,
  duration_minutes int not null default 60,
  location text,
  meeting_url text,                          -- Zoom / Teams / Meet link
  agenda text,
  agenda_document_id uuid references public.documents on delete set null,
  status public.meeting_status not null default 'scheduled',
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create table public.meeting_rsvps (
  meeting_id uuid not null references public.meetings on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  community_id uuid not null references public.communities on delete cascade,
  response public.rsvp not null,
  updated_at timestamptz not null default now(),
  primary key (meeting_id, profile_id)
);

create table public.meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  meeting_id uuid not null references public.meetings on delete cascade,
  document_id uuid references public.documents on delete set null,
  recording_url text,
  summary text,
  decisions text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.action_items (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  meeting_id uuid references public.meetings on delete set null,
  title text not null,
  owner_name text,
  due_date date,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);

-- Suggested topics for future meetings, upvoted by members (one vote per member per topic).
create table public.meeting_topics (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  title text not null check (length(title) between 3 and 200),
  description text,
  proposed_by uuid references public.profiles on delete set null default auth.uid(),
  status public.topic_status not null default 'open',
  meeting_id uuid references public.meetings on delete set null,
  admin_note text,
  created_at timestamptz not null default now()
);

create table public.topic_votes (
  topic_id uuid not null references public.meeting_topics on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade default auth.uid(),
  community_id uuid not null references public.communities on delete cascade,
  created_at timestamptz not null default now(),
  primary key (topic_id, profile_id)
);

create view public.v_meeting_topics with (security_invoker = true) as
select t.*, p.full_name as proposed_by_name, m.title as meeting_title, m.starts_at as meeting_starts_at,
  (select count(*) from public.topic_votes v where v.topic_id = t.id)::int as votes,
  exists (select 1 from public.topic_votes v where v.topic_id = t.id and v.profile_id = auth.uid()) as voted_by_me
from public.meeting_topics t
left join public.profiles p on p.id = t.proposed_by
left join public.meetings m on m.id = t.meeting_id;

-- Members may only change the text of their own open topics; status/meeting are admin-only.
create or replace function public.topic_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(new.community_id) and (new.status is distinct from old.status
      or new.meeting_id is distinct from old.meeting_id or new.admin_note is distinct from old.admin_note
      or new.proposed_by is distinct from old.proposed_by) then
    raise exception 'Only an administrator can change the status of a topic';
  end if;
  return new;
end $$;
create trigger topic_before_update before update on public.meeting_topics
for each row execute function public.topic_before_update();

-- ---------------------------------------------------------------------------
-- In-app notifications (+ outbound queue for email/WhatsApp/push workers)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  kind text not null,                        -- meeting, meeting_update, complaint, fee_reminder, contract_due
  title text not null,
  body text,
  link text,
  channel text not null default 'in_app',
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (profile_id, created_at desc);

-- New/changed meetings notify every active member.
create or replace function public.notify_meeting()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  kind text;
  title text;
begin
  if tg_op = 'INSERT' then
    kind := 'meeting'; title := 'New meeting: ' || new.title;
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

create trigger notify_meeting
after insert or update on public.meetings
for each row execute function public.notify_meeting();

-- ---------------------------------------------------------------------------
-- AI assistant
-- ---------------------------------------------------------------------------
create table public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  source_type text not null,                 -- document, info_page, bin_schedule, local_place, meeting_minutes, faq, contract
  source_id uuid,
  title text,
  content text not null,
  language text not null default 'en',
  visibility public.visibility not null default 'all',
  embedding extensions.vector(1024),
  updated_at timestamptz not null default now()
);
create index on public.kb_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index on public.kb_chunks (community_id, source_type);

create or replace function public.match_kb_chunks(c uuid, query_embedding extensions.vector(1024), match_count int default 6)
returns table (id uuid, source_type text, source_id uuid, title text, content text, similarity float)
language sql stable security invoker set search_path = '' as $$
  select k.id, k.source_type, k.source_id, k.title, k.content,
         1 - (k.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.kb_chunks k
  where k.community_id = c and k.embedding is not null
  order by k.embedding operator(extensions.<=>) query_embedding
  limit match_count
$$;

create table public.faq_entries (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  question text not null,
  answer text not null,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create table public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  channel text not null default 'chat' check (channel in ('chat', 'voice', 'whatsapp')),
  created_at timestamptz not null default now()
);

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  conversation_id uuid not null references public.assistant_conversations on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  unanswered boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.pending_actions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  action_type text not null,                 -- create_complaint
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'expired')),
  created_at timestamptz not null default now()
);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  community_id uuid not null references public.communities on delete cascade,
  profile_id uuid references public.profiles on delete set null,
  kind text not null,                        -- llm, stt, tts, embedding, whatsapp
  model text,
  input_tokens int, output_tokens int, audio_seconds int, characters int,
  cost_cents numeric(10,4) not null default 0,
  created_at timestamptz not null default now()
);

create table public.whatsapp_links (
  profile_id uuid primary key references public.profiles on delete cascade,
  phone_e164 text not null unique,
  verified_at timestamptz,
  code text,
  code_expires_at timestamptz
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['info_pages','bin_schedules','local_places','complaint_categories','complaints',
    'complaint_updates','documents','document_translations','meetings','meeting_rsvps','meeting_minutes',
    'action_items','notifications','kb_chunks','faq_entries','assistant_conversations','assistant_messages',
    'pending_actions','ai_usage','whatsapp_links','meeting_topics','topic_votes']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  -- Member-readable, admin-managed content.
  foreach t in array array['bin_schedules','local_places','complaint_categories','meetings','meeting_minutes',
    'action_items','faq_entries']
  loop
    execute format('create policy "members read %1$s" on public.%1$I for select using (public.is_member(community_id))', t);
    execute format('create policy "admins manage %1$s" on public.%1$I for all
                    using (public.is_admin(community_id)) with check (public.is_admin(community_id))', t);
  end loop;
end $$;

create policy "read info by visibility" on public.info_pages for select using (public.can_see(community_id, visibility));
create policy "admins manage info pages" on public.info_pages for all
  using (public.is_admin(community_id)) with check (public.is_admin(community_id));

create policy "members suggest places" on public.local_places for insert
  with check (public.is_member(community_id) and recommended_by = auth.uid());

create policy "read visible complaints" on public.complaints for select using (public.can_see_complaint(complaints));
create policy "members report complaints" on public.complaints for insert with check (public.is_member(community_id));
create policy "admins update complaints" on public.complaints for update
  using (public.is_admin(community_id)) with check (public.is_admin(community_id));

create policy "read updates on visible complaints" on public.complaint_updates for select using (
  exists (select 1 from public.complaints c where c.id = complaint_id and public.can_see_complaint(c))
);
create policy "comment on visible complaints" on public.complaint_updates for insert with check (
  author_id = auth.uid()
  and exists (select 1 from public.complaints c where c.id = complaint_id and public.can_see_complaint(c))
  and (new_status is null or public.is_admin(community_id))
);

create policy "read documents by visibility" on public.documents for select using (public.can_see(community_id, visibility));
create policy "admins manage documents" on public.documents for all
  using (public.is_admin(community_id)) with check (public.is_admin(community_id));
create policy "read translations of visible docs" on public.document_translations for select using (
  exists (select 1 from public.documents d where d.id = document_id and public.can_see(d.community_id, d.visibility))
);

create policy "members read rsvps" on public.meeting_rsvps for select using (public.is_member(community_id));
create policy "own rsvp" on public.meeting_rsvps for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid() and public.is_member(community_id));

create policy "members read topics" on public.meeting_topics for select using (public.is_member(community_id));
create policy "members propose topics" on public.meeting_topics for insert
  with check (public.is_member(community_id) and proposed_by = auth.uid() and status = 'open' and meeting_id is null);
create policy "edit own open topics or admin" on public.meeting_topics for update
  using ((proposed_by = auth.uid() and status = 'open') or public.is_admin(community_id))
  with check (public.is_member(community_id));
create policy "delete own open topics or admin" on public.meeting_topics for delete
  using ((proposed_by = auth.uid() and status = 'open') or public.is_admin(community_id));

create policy "members read votes" on public.topic_votes for select using (public.is_member(community_id));
create policy "members vote once" on public.topic_votes for insert with check (
  profile_id = auth.uid() and public.is_member(community_id)
  and exists (select 1 from public.meeting_topics t where t.id = topic_id and t.community_id = topic_votes.community_id and t.status = 'open')
);
create policy "members remove own vote" on public.topic_votes for delete using (profile_id = auth.uid());

create policy "own notifications" on public.notifications for select using (profile_id = auth.uid());
create policy "mark own notifications read" on public.notifications for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "read kb by visibility" on public.kb_chunks for select using (public.can_see(community_id, visibility));
create policy "admins manage kb" on public.kb_chunks for all
  using (public.is_admin(community_id)) with check (public.is_admin(community_id));

create policy "own conversations" on public.assistant_conversations for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid() and public.is_member(community_id));
create policy "admins read conversations" on public.assistant_conversations for select using (public.is_admin(community_id));
create policy "own messages" on public.assistant_messages for all using (
  exists (select 1 from public.assistant_conversations c where c.id = conversation_id and c.profile_id = auth.uid())
) with check (
  exists (select 1 from public.assistant_conversations c where c.id = conversation_id and c.profile_id = auth.uid())
);
create policy "admins read unanswered" on public.assistant_messages for select using (public.is_admin(community_id) and unanswered);

create policy "own pending actions" on public.pending_actions for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "admins read usage" on public.ai_usage for select using (public.is_admin(community_id));
create policy "own whatsapp link" on public.whatsapp_links for select using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: path convention "<community_id>/<...>"
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('branding', 'branding', true),
  ('documents', 'documents', false),
  ('finance', 'finance', false),
  ('complaints', 'complaints', false)
on conflict (id) do nothing;

create or replace function public.path_community(p text)
returns uuid language sql immutable as $$
  select case when split_part(p, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(p, '/', 1)::uuid end
$$;

create policy "branding public read" on storage.objects for select using (bucket_id = 'branding');
create policy "branding admin write" on storage.objects for insert with check (bucket_id = 'branding' and public.is_admin(public.path_community(name)));
create policy "documents member read" on storage.objects for select using (bucket_id = 'documents' and public.is_member(public.path_community(name)));
create policy "documents admin write" on storage.objects for insert with check (bucket_id = 'documents' and public.is_admin(public.path_community(name)));
create policy "finance read" on storage.objects for select using (bucket_id = 'finance' and public.is_finance(public.path_community(name)));
create policy "finance write" on storage.objects for insert with check (bucket_id = 'finance' and public.is_finance(public.path_community(name)));
create policy "complaints read" on storage.objects for select using (bucket_id = 'complaints' and (owner = auth.uid() or public.is_admin(public.path_community(name))));
create policy "complaints write" on storage.objects for insert with check (bucket_id = 'complaints' and public.is_member(public.path_community(name)));

-- ---------------------------------------------------------------------------
-- Scheduled jobs (pg_cron): tenancy expiry daily at 02:10 UTC
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
select cron.schedule('expire-tenancies', '10 2 * * *', 'select public.expire_tenancies()');
