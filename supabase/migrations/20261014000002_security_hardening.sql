-- Security and privacy hardening after the pre-deploy audit.

-- ===========================================================================
-- 1. References between community-owned rows never cross communities.
--    (Before: an admin of one community could point an ownership, tenancy, fee
--    or payment row at another community's flat and gain access through it.)
-- ===========================================================================
create or replace function public.ensure_same_community()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  i int := 0;
  ref text;
  ref_community uuid;
begin
  -- Arguments come in pairs: <column>, <referenced table>.
  while i < tg_nargs loop
    ref := to_jsonb(new) ->> tg_argv[i];
    if ref is not null then
      execute format('select community_id from public.%I where id = $1', tg_argv[i + 1]) into ref_community using ref::uuid;
      if ref_community is distinct from new.community_id then
        raise exception '% must belong to the same community', tg_argv[i] using errcode = '42501';
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('units', 'building_id, buildings'),
    ('unit_ownerships', 'unit_id, units'),
    ('tenancies', 'unit_id, units'),
    ('contracts', 'category_id, expense_categories, supplier_id, suppliers'),
    ('invoices', 'category_id, expense_categories, contract_id, contracts, supplier_id, suppliers'),
    ('invoice_approvals', 'invoice_id, invoices'),
    ('budget_lines', 'budget_id, budgets, category_id, expense_categories'),
    ('quotes', 'supplier_id, suppliers'),
    ('ledger_entries', 'invoice_id, invoices'),
    ('fee_schedules', 'budget_id, budgets'),
    ('fee_charges', 'levy_id, levies, schedule_id, fee_schedules, unit_id, units'),
    ('fee_payments', 'unit_id, units'),
    ('payment_allocations', 'charge_id, fee_charges, payment_id, fee_payments'),
    ('fee_reminders', 'unit_id, units'),
    ('complaints', 'category_id, complaint_categories, target_supplier_id, suppliers, target_unit_id, units'),
    ('complaint_updates', 'complaint_id, complaints'),
    ('document_translations', 'document_id, documents'),
    ('meetings', 'agenda_document_id, documents'),
    ('meeting_rsvps', 'meeting_id, meetings'),
    ('meeting_minutes', 'document_id, documents, meeting_id, meetings'),
    ('action_items', 'meeting_id, meetings'),
    ('meeting_topics', 'meeting_id, meetings'),
    ('topic_votes', 'topic_id, meeting_topics'),
    ('assistant_messages', 'conversation_id, assistant_conversations')
  ) as t(tbl, args)
  loop
    execute format(
      'create trigger same_community before insert or update on public.%I for each row execute function public.ensure_same_community(%s)',
      r.tbl, (select string_agg(quote_literal(trim(x)), ', ') from unnest(string_to_array(r.args, ',')) x));
  end loop;
end $$;

-- ===========================================================================
-- 2. Profiles: people can change their name and phone, never their email or flags.
--    The email always mirrors the confirmed sign-in address (invites match on it).
-- ===========================================================================
revoke update on public.profiles from authenticated, anon;
grant update (full_name, phone) on public.profiles to authenticated;

create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_change
after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function public.sync_profile_email();

update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is distinct from u.email;

-- ===========================================================================
-- 3. Invitations. Nobody is added to a community without accepting:
--    the office invites, the person signs in and accepts (or declines).
-- ===========================================================================
create table public.community_invitations (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  email text not null,
  full_name text,
  role public.app_role not null,
  unit_id uuid references public.units on delete cascade,
  tenancy_type public.tenancy_type,
  start_date date,
  end_date date,
  invited_by uuid references public.profiles on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (role not in ('owner', 'tenant') or unit_id is not null)
);
create index on public.community_invitations (profile_id, status);
create index on public.community_invitations (community_id, status);
create trigger same_community before insert or update on public.community_invitations
for each row execute function public.ensure_same_community('unit_id', 'units');

alter table public.community_invitations enable row level security;
create policy "admins manage invitations" on public.community_invitations for all
  using (public.is_admin(community_id)) with check (public.is_admin(community_id));
create policy "invitee reads own invitations" on public.community_invitations for select
  using (profile_id = auth.uid());

-- What the signed-in person has been invited to in community c (flat labels included, even before joining).
create or replace function public.my_invitations(c uuid)
returns table (id uuid, community_name text, role public.app_role, unit_label text, building_name text,
               tenancy_type public.tenancy_type, start_date date, end_date date, invited_by_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, cm.name, i.role, u.label, b.name, i.tenancy_type, i.start_date, i.end_date, p.full_name, i.created_at
  from public.community_invitations i
  join public.communities cm on cm.id = i.community_id
  left join public.units u on u.id = i.unit_id
  left join public.buildings b on b.id = u.building_id
  left join public.profiles p on p.id = i.invited_by
  where i.community_id = c and i.profile_id = auth.uid() and i.status = 'pending'
  order by i.created_at
$$;

create or replace function public.accept_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  inv public.community_invitations;
begin
  select * into inv from public.community_invitations
  where id = p_id and profile_id = auth.uid() and status = 'pending' for update;
  if inv.id is null then
    raise exception 'This invitation is no longer open' using errcode = '42501';
  end if;
  -- Trusted insert: lets the tenancy trigger accept a tenant the office invited.
  perform set_config('app.trusted_tenancy', 'on', true);
  if inv.role = 'tenant' then
    insert into public.tenancies (community_id, unit_id, tenant_id, added_by, tenancy_type, start_date, end_date, status)
    values (inv.community_id, inv.unit_id, inv.profile_id, inv.invited_by, coalesce(inv.tenancy_type, 'long_term'),
            coalesce(inv.start_date, current_date), inv.end_date, 'active');
  else
    insert into public.memberships (community_id, profile_id, role, status)
    values (inv.community_id, inv.profile_id, inv.role, 'active')
    on conflict (community_id, profile_id, role) do update set status = 'active';
    if inv.role = 'owner' and not exists (
      select 1 from public.unit_ownerships o where o.unit_id = inv.unit_id and o.owner_id = inv.profile_id
        and (o.end_date is null or o.end_date >= current_date)
    ) then
      insert into public.unit_ownerships (community_id, unit_id, owner_id, start_date)
      values (inv.community_id, inv.unit_id, inv.profile_id, coalesce(inv.start_date, current_date));
    end if;
  end if;
  perform set_config('app.trusted_tenancy', 'off', true);
  update public.community_invitations set status = 'accepted', responded_at = now() where id = inv.id;
end $$;

create or replace function public.decline_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.community_invitations set status = 'declined', responded_at = now()
  where id = p_id and profile_id = auth.uid() and status = 'pending';
end $$;

revoke execute on function public.my_invitations(uuid), public.accept_invitation(uuid), public.decline_invitation(uuid) from public, anon;
grant execute on function public.my_invitations(uuid), public.accept_invitation(uuid), public.decline_invitation(uuid) to authenticated;

-- ===========================================================================
-- 4. Tenancies. Owners add brand-new tenants (invited by email). Someone who already
--    belongs to the community needs the office's approval; someone from another
--    community can only be invited by the office. Only the office approves or
--    reactivates; owners can end a tenancy or change its end date.
-- ===========================================================================
alter table public.tenancies add column if not exists invited_name text;

create or replace function public.tenancy_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  needs_approval boolean;
begin
  if new.community_id <> (select community_id from public.units where id = new.unit_id) then
    raise exception 'Unit does not belong to this community';
  end if;
  if auth.uid() is not null and not public.is_admin(new.community_id)
     and coalesce(current_setting('app.trusted_tenancy', true), 'off') <> 'on' then
    new.added_by := auth.uid();
    if exists (select 1 from public.memberships m where m.profile_id = new.tenant_id and m.community_id = new.community_id) then
      new.status := 'pending';                      -- an existing resident: the office confirms it
    elsif exists (select 1 from public.memberships m where m.profile_id = new.tenant_id) then
      raise exception 'This person can only be added by the office' using errcode = '42501';
    else
      select coalesce((settings ->> 'tenant_requires_approval')::boolean, false)
        into needs_approval from public.communities where id = new.community_id;
      new.status := case when needs_approval then 'pending' else 'active' end;
    end if;
  else
    new.added_by := coalesce(new.added_by, auth.uid());
  end if;
  if new.end_date is not null and new.end_date < current_date then
    new.status := 'ended';
  end if;
  -- Short stays share their details with the office only, unless they choose otherwise later.
  if new.tenancy_type in ('holiday_let', 'short_term') then
    insert into public.contact_preferences (profile_id, community_id, visibility)
    values (new.tenant_id, new.community_id, 'admins') on conflict do nothing;
  end if;
  return new;
end $$;

create or replace function public.tenancy_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.unit_id <> old.unit_id or new.tenant_id <> old.tenant_id or new.community_id <> old.community_id then
    raise exception 'Unit, tenant and community cannot be changed on a tenancy';
  end if;
  if auth.uid() is not null and not public.is_admin(new.community_id) then
    if new.status is distinct from old.status and new.status <> 'ended' then
      raise exception 'Only the office can approve or reactivate a tenancy' using errcode = '42501';
    end if;
    if old.status = 'ended' and (new.end_date is distinct from old.end_date) then
      raise exception 'An ended tenancy can only be changed by the office' using errcode = '42501';
    end if;
    if new.tenancy_type is distinct from old.tenancy_type or new.start_date is distinct from old.start_date
       or new.added_by is distinct from old.added_by then
      raise exception 'Only the end date of a tenancy can be changed' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Owners see their tenants' names and details only once the tenancy is active.
create or replace function public.unit_tenants(c uuid)
returns table (tenancy_id uuid, unit_id uuid, tenant_id uuid, full_name text, email text, phone text,
               preferred_method public.contact_method, shared boolean)
language sql stable security definer set search_path = '' as $$
  select t.id, t.unit_id, t.tenant_id,
    case when s.known then p.full_name else coalesce(nullif(t.invited_name, ''), 'New tenant') end,
    case when s.shared then p.email end,
    case when s.shared then p.phone end,
    case when s.known then cp.preferred_method end,
    s.shared
  from public.tenancies t
  join public.profiles p on p.id = t.tenant_id
  left join public.contact_preferences cp on cp.profile_id = t.tenant_id and cp.community_id = c
  cross join lateral (
    select public.is_admin(c) or t.tenant_id = auth.uid() or t.status in ('active', 'ended') as known,
           public.is_admin(c) or t.tenant_id = auth.uid()
             or (t.status = 'active' and coalesce(cp.visibility, 'block') <> 'admins') as shared
  ) s
  where t.community_id = c and public.is_member(c)
    and (public.owns_unit(t.unit_id) or public.is_admin(c))
  order by t.unit_id, t.start_date desc
$$;

-- ===========================================================================
-- 5. Reports. The thread is between the reporter and the office. The owner of the
--    flat a report is about is told about it and can send the office a private note,
--    but never sees who reported it or the reporter's messages.
-- ===========================================================================
alter table public.complaint_updates add column if not exists internal boolean not null default false;

create or replace function public.can_see_complaint(cp public.complaints)
returns boolean language sql stable security definer set search_path = '' as $$
  select cp.reporter_id = auth.uid() or public.is_admin(cp.community_id)
$$;

drop policy "read updates on visible complaints" on public.complaint_updates;
create policy "read updates on visible complaints" on public.complaint_updates for select using (
  exists (select 1 from public.complaints c where c.id = complaint_id and public.can_see_complaint(c))
  and (not internal or public.is_admin(community_id))
);
drop policy "comment on visible complaints" on public.complaint_updates;
create policy "comment on visible complaints" on public.complaint_updates for insert with check (
  author_id = auth.uid()
  and exists (select 1 from public.complaints c where c.id = complaint_id and public.can_see_complaint(c))
  and (new_status is null or public.is_admin(community_id))
  and (not internal or public.is_admin(community_id))
);

-- The person filing a report is always the signed-in user (the office may file on someone's behalf).
create or replace function public.complaint_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.is_admin(new.community_id) then
      new.reporter_id := auth.uid();
      new.status := 'new';
    else
      new.reporter_id := coalesce(new.reporter_id, auth.uid());
    end if;
  elsif new.status is distinct from old.status and auth.uid() is not null and not public.is_admin(new.community_id) then
    raise exception 'Only an administrator can change complaint status';
  end if;
  if new.status in ('resolved', 'closed') and new.resolved_at is null then
    new.resolved_at := now();
  end if;
  return new;
end $$;

-- Reports about flats the caller owns (never the reporter's identity).
create or replace function public.flat_reports(c uuid)
returns table (id uuid, kind public.report_kind, title text, description text, status public.complaint_status,
               priority public.priority, category text, unit_id uuid, unit_label text, location text,
               created_at timestamptz, resolved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select cp.id, cp.kind, cp.title, cp.description, cp.status, cp.priority, cc.name, u.id, u.label, cp.location,
         cp.created_at, cp.resolved_at
  from public.complaints cp
  join public.units u on u.id = cp.target_unit_id
  left join public.complaint_categories cc on cc.id = cp.category_id
  where cp.community_id = c and public.is_member(c) and public.owns_unit(cp.target_unit_id)
    and cp.reporter_id is distinct from auth.uid()
  order by cp.created_at desc
$$;

-- The caller's own private notes to the office on a report about their flat.
create or replace function public.flat_report_notes(p_complaint uuid)
returns table (id uuid, body text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select cu.id, cu.body, cu.created_at
  from public.complaint_updates cu
  join public.complaints cp on cp.id = cu.complaint_id
  where cu.complaint_id = p_complaint and cu.author_id = auth.uid() and cu.internal
    and cp.target_unit_id is not null and public.owns_unit(cp.target_unit_id)
  order by cu.created_at
$$;

create or replace function public.add_owner_note(p_complaint uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cp public.complaints;
  new_id uuid;
begin
  select * into cp from public.complaints where id = p_complaint;
  if cp.id is null or cp.target_unit_id is null or not public.owns_unit(cp.target_unit_id) or not public.is_member(cp.community_id) then
    raise exception 'You can only add a note to a report about your own flat' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'Please write a note of up to 2000 characters';
  end if;
  insert into public.complaint_updates (complaint_id, community_id, author_id, body, internal)
  values (cp.id, cp.community_id, auth.uid(), trim(p_body), true)
  returning id into new_id;
  return new_id;
end $$;

revoke execute on function public.flat_reports(uuid), public.flat_report_notes(uuid), public.add_owner_note(uuid, text) from public, anon;
grant execute on function public.flat_reports(uuid), public.flat_report_notes(uuid), public.add_owner_note(uuid, text) to authenticated;

-- New reports alert the office, and the owners of the flat they are about.
create or replace function public.notify_new_complaint()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  insert into public.notifications (community_id, profile_id, kind, title, body, link)
  select distinct new.community_id, m.profile_id, 'complaint',
    case when new.priority in ('urgent', 'high') then 'Urgent report: ' else 'New report: ' end || new.title,
    left(new.description, 160), '/report/' || new.id
  from public.memberships m
  where m.community_id = new.community_id and m.role = 'admin' and m.status = 'active'
    and m.profile_id is distinct from new.reporter_id;
  if new.target_unit_id is not null then
    insert into public.notifications (community_id, profile_id, kind, title, body, link)
    select distinct new.community_id, o.owner_id, 'complaint',
      'A report about your flat ' || u.label || ': ' || new.title,
      'The office has it. You can add a note for the office on the report.', '/report/' || new.id
    from public.unit_ownerships o
    join public.units u on u.id = o.unit_id
    join public.memberships m on m.profile_id = o.owner_id and m.community_id = new.community_id and m.status = 'active'
    where o.unit_id = new.target_unit_id and (o.end_date is null or o.end_date >= current_date)
      and o.owner_id is distinct from new.reporter_id;
  end if;
  return new;
end $$;

-- Replies from the office alert the reporter; anything else (the reporter adding
-- information, an owner's note) alerts the office.
create or replace function public.notify_complaint_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c public.complaints;
begin
  if auth.uid() is null then
    return new;
  end if;
  select * into c from public.complaints where id = new.complaint_id;
  if c.id is null then
    return new;
  end if;
  if public.is_admin(c.community_id) and not new.internal then
    if c.reporter_id is not null and c.reporter_id is distinct from new.author_id then
      insert into public.notifications (community_id, profile_id, kind, title, body, link)
      values (c.community_id, c.reporter_id, 'complaint_update', 'Update on your report: ' || c.title,
              left(new.body, 160), '/report/' || c.id);
    end if;
  elsif not public.is_admin(c.community_id) then
    insert into public.notifications (community_id, profile_id, kind, title, body, link)
    select distinct c.community_id, m.profile_id, 'complaint_update',
      case when new.internal then 'Note from the flat owner: ' else 'New information on: ' end || c.title,
      left(new.body, 160), '/report/' || c.id
    from public.memberships m
    where m.community_id = c.community_id and m.role = 'admin' and m.status = 'active'
      and m.profile_id is distinct from new.author_id;
  end if;
  return new;
end $$;

-- ===========================================================================
-- 6. directory() is for the office and the treasurer only. Residents use
--    block_directory(), which keeps them inside their own block.
-- ===========================================================================
create or replace function public.directory(c uuid)
returns table (
  profile_id uuid, full_name text, roles public.app_role[], units text[],
  email text, phone text, preferred_method public.contact_method, best_times text, is_my_owner boolean
) language sql stable security definer set search_path = '' as $$
  with me as (
    select
      coalesce((select array_agg(t.unit_id) from public.tenancies t
                where t.tenant_id = auth.uid() and t.status = 'active' and t.community_id = c), '{}') as my_units,
      public.my_buildings(c) as my_blocks
  ),
  people as (
    select p.id, p.full_name, p.email, p.phone, array_agg(distinct m.role) as roles
    from public.profiles p
    join public.memberships m on m.profile_id = p.id and m.community_id = c and m.status = 'active'
    group by p.id
  ),
  person_units as (
    select x.pid, array_agg(distinct u.label order by u.label) as labels,
           array_agg(distinct u.building_id) filter (where u.building_id is not null) as blocks
    from (
      select o.owner_id as pid, o.unit_id from public.unit_ownerships o
        where o.community_id = c and (o.end_date is null or o.end_date >= current_date)
      union
      select t.tenant_id, t.unit_id from public.tenancies t where t.community_id = c and t.status = 'active'
    ) x join public.units u on u.id = x.unit_id
    group by x.pid
  )
  select pe.id, pe.full_name, pe.roles, pu.labels,
    case when allowed then pe.email end,
    case when allowed then pe.phone end,
    cp.preferred_method, case when allowed then cp.best_times end,
    is_my_owner
  from people pe
  left join person_units pu on pu.pid = pe.id
  left join public.contact_preferences cp on cp.profile_id = pe.id and cp.community_id = c
  cross join me
  cross join lateral (
    select exists (
      select 1 from public.unit_ownerships o
      where o.owner_id = pe.id and o.unit_id = any (me.my_units)
        and (o.end_date is null or o.end_date >= current_date)
    ) as is_my_owner
  ) mo
  cross join lateral (
    select
      pe.id = auth.uid()
      or public.is_admin(c)
      or 'admin' = any (pe.roles)
      or coalesce(cp.visibility, 'block') = 'all'
      or (coalesce(cp.visibility, 'block') = 'block' and coalesce(pu.blocks, '{}') && me.my_blocks)
      or (coalesce(cp.visibility, 'block') in ('unit', 'block') and (
            mo.is_my_owner
            or exists (select 1 from public.tenancies t where t.tenant_id = pe.id and t.status = 'active' and public.owns_unit(t.unit_id))
         )) as allowed
  ) a
  where public.is_finance(c)
  order by pe.full_name
$$;

-- ===========================================================================
-- 7. Holiday-let and short-term guests get the limited profile from the plan:
--    building information, bins, local area, the assistant; no member list, no documents.
-- ===========================================================================
create or replace function public.is_limited_guest(c uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (settings ->> 'limit_short_stay_guests')::boolean from public.communities where id = c), true)
    and not public.has_role(c, '{owner,admin,treasurer}')
    and exists (select 1 from public.tenancies t
                where t.tenant_id = auth.uid() and t.community_id = c and t.status = 'active')
    and not exists (select 1 from public.tenancies t
                    where t.tenant_id = auth.uid() and t.community_id = c and t.status = 'active'
                      and t.tenancy_type not in ('holiday_let', 'short_term'))
$$;

create or replace function public.block_directory(c uuid)
returns table (
  building_id uuid, building_name text, building_sort int,
  unit_id uuid, unit_label text, floor int,
  profile_id uuid, full_name text, relation text, tenancy_type public.tenancy_type,
  roles public.app_role[],
  email text, phone text, preferred_method public.contact_method, best_times text,
  shared boolean, is_me boolean
) language sql stable security definer set search_path = '' as $$
  with viewer as (
    select
      public.is_admin(c) as admin,
      public.is_limited_guest(c) as guest,
      public.my_buildings(c) as blocks,
      coalesce((
        select array_agg(x.unit_id) from (
          select o.unit_id from public.unit_ownerships o
          where o.owner_id = auth.uid() and o.community_id = c and (o.end_date is null or o.end_date >= current_date)
          union
          select t.unit_id from public.tenancies t
          where t.tenant_id = auth.uid() and t.community_id = c and t.status = 'active'
        ) x
      ), '{}') as my_units
  ),
  occupants as (
    select o.unit_id, o.owner_id as pid, 'owner'::text as relation, null::public.tenancy_type as ttype
    from public.unit_ownerships o
    where o.community_id = c and (o.end_date is null or o.end_date >= current_date)
    union all
    select t.unit_id, t.tenant_id, 'tenant', t.tenancy_type
    from public.tenancies t
    where t.community_id = c and t.status = 'active'
  )
  select
    b.id, b.name, b.sort, u.id, u.label, u.floor,
    p.id, p.full_name, oc.relation, oc.ttype,
    (select array_agg(distinct m.role) from public.memberships m
      where m.profile_id = p.id and m.community_id = c and m.status = 'active'),
    case when s.shared then p.email end,
    case when s.shared then p.phone end,
    cp.preferred_method,
    case when s.shared then cp.best_times end,
    s.shared,
    p.id = auth.uid()
  from occupants oc
  join public.units u on u.id = oc.unit_id
  join public.buildings b on b.id = u.building_id
  join public.profiles p on p.id = oc.pid
  left join public.contact_preferences cp on cp.profile_id = p.id and cp.community_id = c
  cross join viewer v
  cross join lateral (
    select
      v.admin
      or p.id = auth.uid()
      or (coalesce(cp.visibility, 'block') in ('all', 'block') and b.id = any (v.blocks))
      or (coalesce(cp.visibility, 'block') in ('unit', 'block', 'all') and u.id = any (v.my_units))
      as shared
  ) s
  where public.is_member(c)
    and (v.admin or (b.id = any (v.blocks) and (not v.guest or u.id = any (v.my_units))))
  order by b.sort, b.name, u.floor nulls last, u.label, oc.relation, p.full_name
$$;

drop policy "read documents by visibility" on public.documents;
create policy "read documents by visibility" on public.documents for select
  using (public.can_see(community_id, visibility) and not public.is_limited_guest(community_id));

create or replace function public.can_read_document_file(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  with f as (select public.path_community(p_name) as c)
  select case
    when f.c is null then false
    when public.is_admin(f.c) then true
    when public.is_limited_guest(f.c) then false
    else exists (
      select 1 from public.documents d
      where d.storage_path = p_name and d.community_id = f.c and public.can_see(d.community_id, d.visibility)
    )
  end
  from f
$$;

-- ===========================================================================
-- 8. Finance controls enforced by the database, not just the screens.
-- ===========================================================================
create or replace function public.invoice_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- New invoices always start awaiting approval; approval and payment go through approve_invoice / updates.
  if auth.uid() is not null then
    new.status := 'received';
    new.paid_date := null;
  end if;
  return new;
end $$;
create trigger invoice_before_insert before insert on public.invoices
for each row execute function public.invoice_before_insert();

create or replace function public.budget_status_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'approved' and new.status is distinct from old.status
     and auth.uid() is not null and not public.is_admin(new.community_id) then
    raise exception 'Only an administrator can reopen an approved budget' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger budget_status_guard before update on public.budgets
for each row execute function public.budget_status_guard();

-- ===========================================================================
-- 9. Meeting topics show the proposer's full name only inside their block.
-- ===========================================================================
create or replace function public.topic_proposer_name(t uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when public.is_admin(mt.community_id) or mt.proposed_by = auth.uid() or exists (
      select 1 from public.units u
      where u.community_id = mt.community_id and u.building_id = any (public.my_buildings(mt.community_id))
        and (exists (select 1 from public.unit_ownerships o where o.unit_id = u.id and o.owner_id = mt.proposed_by
                     and (o.end_date is null or o.end_date >= current_date))
          or exists (select 1 from public.tenancies tn where tn.unit_id = u.id and tn.tenant_id = mt.proposed_by and tn.status = 'active'))
    ) then p.full_name
    else split_part(p.full_name, ' ', 1)
      || coalesce(' ' || left(nullif(split_part(p.full_name, ' ', 2), ''), 1) || '.', '')
  end
  from public.meeting_topics mt
  join public.profiles p on p.id = mt.proposed_by
  where mt.id = t and public.is_member(mt.community_id)
$$;

-- ===========================================================================
-- 10. Meeting alerts skip the person who made the change.
-- ===========================================================================
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
  where m.community_id = new.community_id and m.status = 'active'
    and m.profile_id is distinct from auth.uid();
  return new;
end $$;

-- ===========================================================================
-- 11. Storage: size and type limits enforced by the storage service itself.
-- ===========================================================================
update storage.buckets set file_size_limit = 20971520,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain']
where id = 'documents';
update storage.buckets set file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'complaints';
update storage.buckets set file_size_limit = 20971520,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'finance';
update storage.buckets set file_size_limit = 2097152,
  allowed_mime_types = array['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']
where id = 'branding';
