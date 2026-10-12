-- Cross-section fixes found while integrating the app sections.

-- ---------------------------------------------------------------------------
-- 1. Reports: trusted inserts (seed data, service-role imports) keep their status.
--    Before, every seeded complaint was forced to 'new', so resolved and closed
--    reports never existed and the open-report counts were inflated.
-- ---------------------------------------------------------------------------
create or replace function public.complaint_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.reporter_id := coalesce(new.reporter_id, auth.uid());
    if auth.uid() is not null and not public.is_admin(new.community_id) then
      new.status := 'new';
    end if;
  elsif new.status is distinct from old.status and auth.uid() is not null and not public.is_admin(new.community_id) then
    raise exception 'Only an administrator can change complaint status';
  end if;
  if new.status in ('resolved', 'closed') and new.resolved_at is null then
    new.resolved_at := now();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Notifications for reports. New reports alert the administrators; a reply from
--    the office alerts the person who reported it; new information from the
--    reporter alerts the administrators. Seeding (no signed-in user) is skipped.
-- ---------------------------------------------------------------------------
create or replace function public.notify_new_complaint()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  insert into public.notifications (community_id, profile_id, kind, title, body, link)
  select distinct new.community_id, m.profile_id, 'complaint',
    case when new.priority in ('urgent', 'high') then 'Urgent report: ' else 'New report: ' end || new.title,
    left(new.description, 160),
    '/report/' || new.id
  from public.memberships m
  where m.community_id = new.community_id and m.role = 'admin' and m.status = 'active'
    and m.profile_id is distinct from new.reporter_id;
  return new;
end $$;

create trigger notify_new_complaint
after insert on public.complaints
for each row execute function public.notify_new_complaint();

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
  if new.author_id is distinct from c.reporter_id then
    -- The office replied: tell the person who reported it.
    if c.reporter_id is not null then
      insert into public.notifications (community_id, profile_id, kind, title, body, link)
      values (c.community_id, c.reporter_id, 'complaint_update', 'Update on your report: ' || c.title,
              left(new.body, 160), '/report/' || c.id);
    end if;
  else
    -- The reporter added information: tell the administrators.
    insert into public.notifications (community_id, profile_id, kind, title, body, link)
    select distinct c.community_id, m.profile_id, 'complaint_update', 'New information on: ' || c.title,
      left(new.body, 160), '/report/' || c.id
    from public.memberships m
    where m.community_id = c.community_id and m.role = 'admin' and m.status = 'active'
      and m.profile_id is distinct from new.author_id;
  end if;
  return new;
end $$;

create trigger notify_complaint_update
after insert on public.complaint_updates
for each row execute function public.notify_complaint_update();

-- ---------------------------------------------------------------------------
-- 3. Supplier spend leaves out disputed invoices, like every other finance figure.
-- ---------------------------------------------------------------------------
create or replace view public.v_supplier_spend with (security_invoker = true) as
select s.id, s.community_id, s.name, s.service_type, s.email, s.phone, s.active,
  (select count(*) from public.contracts c where c.supplier_id = s.id and c.status = 'active') as active_contracts,
  coalesce((select sum(total_cents) from public.invoices i where i.supplier_id = s.id and i.status <> 'disputed'
            and extract(year from i.issue_date) = extract(year from current_date)), 0)::bigint as spend_this_year_cents,
  coalesce((select sum(total_cents) from public.invoices i where i.supplier_id = s.id and i.status <> 'disputed'), 0)::bigint as spend_all_time_cents
from public.suppliers s;
