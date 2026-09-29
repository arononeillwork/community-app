-- Integration fixes collected from the feature builds (see docs/PLAN.md "Build status").
-- Never edit earlier migrations; every change below is additive or a create-or-replace.

-- ---------------------------------------------------------------------------
-- 1. Profiles: the "update own profile" policy queried profiles inside its own
--    WITH CHECK, which Postgres rejects with 42P17 (infinite recursion). Use the
--    security-definer helper instead, which reads the stored value without RLS.
-- ---------------------------------------------------------------------------
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and is_platform_admin = public.is_platform_admin());

-- Signed-in users may only change their own name and phone number. Email is managed
-- by auth; is_platform_admin and whatsapp_verified by the platform (service role).
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- Treasurers need owner names for fee statements (v_unit_balance.owner_names), invoice
-- approvers and the audit log. Admins could already read these profiles.
-- (security definer: memberships RLS would otherwise hide other people's memberships from a treasurer)
create or replace function public.finance_can_read_profile(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.profile_id = p and public.is_finance(m.community_id))
$$;
create policy "finance read community profiles" on public.profiles for select using (public.finance_can_read_profile(id));

-- ---------------------------------------------------------------------------
-- 2. Meeting topics: show the proposer's name to every member of the community
--    (profiles RLS hides other people's rows from non-admins).
-- ---------------------------------------------------------------------------
create or replace function public.member_name(p uuid, c uuid)
returns text language sql stable security definer set search_path = '' as $$
  select pr.full_name from public.profiles pr
  where pr.id = p and public.is_member(c)
    and exists (select 1 from public.memberships m where m.profile_id = p and m.community_id = c)
$$;

create or replace view public.v_meeting_topics with (security_invoker = true) as
select t.*, public.member_name(t.proposed_by, t.community_id) as proposed_by_name,
  m.title as meeting_title, m.starts_at as meeting_starts_at,
  (select count(*) from public.topic_votes v where v.topic_id = t.id)::int as votes,
  exists (select 1 from public.topic_votes v where v.topic_id = t.id and v.profile_id = auth.uid()) as voted_by_me
from public.meeting_topics t
left join public.meetings m on m.id = t.meeting_id;

-- ---------------------------------------------------------------------------
-- 3. Meetings: updated_at, so calendar files can carry LAST-MODIFIED.
-- ---------------------------------------------------------------------------
alter table public.meetings add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger meetings_set_updated_at
before update on public.meetings for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Tenancies
-- ---------------------------------------------------------------------------
-- Owners may not re-open an ended tenancy (that would bypass tenant_requires_approval).
create or replace function public.tenancy_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status = 'active' and not public.is_admin(new.community_id) then
    raise exception 'Only an administrator can approve a tenancy';
  end if;
  if old.status = 'ended' and new.status <> 'ended' and auth.uid() is not null and not public.is_admin(new.community_id) then
    raise exception 'Only an administrator can reopen an ended tenancy';
  end if;
  if new.unit_id <> old.unit_id or new.tenant_id <> old.tenant_id or new.community_id <> old.community_id then
    raise exception 'Unit, tenant and community cannot be changed on a tenancy';
  end if;
  return new;
end $$;

-- Names of a flat's tenants (including pending and ended tenancies) for its owner or an admin.
-- directory() only lists active members.
create or replace function public.unit_tenant_names(u uuid)
returns table (tenancy_id uuid, tenant_id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select t.id, t.tenant_id, p.full_name
  from public.tenancies t
  join public.profiles p on p.id = t.tenant_id
  where t.unit_id = u
    and (public.owns_unit(u) or public.is_admin(t.community_id))
$$;
revoke execute on function public.unit_tenant_names(uuid) from public, anon;
grant execute on function public.unit_tenant_names(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Owner fees
-- ---------------------------------------------------------------------------
-- Skip charges that are already fully covered (including 0-cent charges, which would
-- otherwise break payment_allocations' amount_cents > 0 check and reject the payment).
create or replace function public.allocate_fee_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  remaining bigint := new.amount_cents;
  ch record;
  take bigint;
begin
  for ch in
    select id, amount_cents - paid_cents as open
    from public.fee_charges
    where unit_id = new.unit_id and status <> 'paid' and amount_cents > paid_cents
    order by due_date, created_at
    for update
  loop
    exit when remaining <= 0;
    take := least(remaining, ch.open);
    insert into public.payment_allocations (payment_id, charge_id, community_id, amount_cents)
    values (new.id, ch.id, new.community_id, take);
    update public.fee_charges
      set paid_cents = paid_cents + take,
          status = case when paid_cents + take >= amount_cents then 'paid'::public.charge_status
                        else 'partial'::public.charge_status end
      where id = ch.id;
    remaining := remaining - take;
  end loop;
  update public.fee_payments set unallocated_cents = remaining where id = new.id;
  return null;
end $$;

-- Use a flat's unallocated credit (overpayments) against its open charges, oldest first.
-- Called after new charges are created; finance roles may also call it directly.
create or replace function public.apply_unit_credit(p_unit uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_community uuid;
  pay record;
  ch record;
  remaining bigint;
  take bigint;
  applied bigint := 0;
begin
  select community_id into v_community from public.units where id = p_unit;
  if v_community is null then return 0; end if;
  if auth.uid() is not null and not public.is_finance(v_community) then raise exception 'Not allowed'; end if;

  for pay in
    select id, unallocated_cents from public.fee_payments
    where unit_id = p_unit and unallocated_cents > 0
    order by paid_on, created_at
    for update
  loop
    remaining := pay.unallocated_cents;
    for ch in
      select id, amount_cents - paid_cents as open
      from public.fee_charges
      where unit_id = p_unit and status <> 'paid' and amount_cents > paid_cents
      order by due_date, created_at
      for update
    loop
      exit when remaining <= 0;
      take := least(remaining, ch.open);
      insert into public.payment_allocations (payment_id, charge_id, community_id, amount_cents)
      values (pay.id, ch.id, v_community, take)
      on conflict (payment_id, charge_id) do update set amount_cents = public.payment_allocations.amount_cents + excluded.amount_cents;
      update public.fee_charges
        set paid_cents = paid_cents + take,
            status = case when paid_cents + take >= amount_cents then 'paid'::public.charge_status
                          else 'partial'::public.charge_status end
        where id = ch.id;
      remaining := remaining - take;
      applied := applied + take;
    end loop;
    if remaining <> pay.unallocated_cents then
      update public.fee_payments set unallocated_cents = remaining where id = pay.id;
    end if;
  end loop;
  return applied;
end $$;
revoke execute on function public.apply_unit_credit(uuid) from public, anon;
grant execute on function public.apply_unit_credit(uuid) to authenticated;

-- Same as before, but skips 0-cent charges and applies existing credit afterwards.
create or replace function public.generate_fee_charges(p_schedule uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  s public.fee_schedules;
  periods int;
  total_coef numeric;
  i int;
  v_label text;
  due date;
  n int := 0;
  added int;
begin
  select * into s from public.fee_schedules where id = p_schedule;
  if s.id is null then raise exception 'Unknown schedule'; end if;
  if auth.uid() is not null and not public.is_finance(s.community_id) then raise exception 'Not allowed'; end if;

  periods := case s.frequency when 'monthly' then 12 when 'quarterly' then 4 else 1 end;
  select nullif(sum(coefficient), 0) into total_coef from public.units where community_id = s.community_id;

  for i in 1..periods loop
    due := make_date(s.year, 1 + (i - 1) * (12 / periods), 1);
    v_label := case s.frequency
      when 'monthly' then to_char(due, 'YYYY Mon')
      when 'quarterly' then s.year || ' Q' || i
      else s.year::text end;
    insert into public.fee_charges (community_id, unit_id, schedule_id, period_label, due_date, amount_cents)
    select s.community_id, x.unit_id, s.id, v_label, due, x.amount
    from (
      select u.id as unit_id,
        case when s.method = 'fixed' then s.fixed_amount_cents
             else round(s.annual_total_cents * u.coefficient / total_coef / periods)::bigint end as amount
      from public.units u
      where u.community_id = s.community_id
        and not exists (select 1 from public.fee_charges fc where fc.schedule_id = s.id and fc.unit_id = u.id and fc.period_label = v_label)
    ) x
    where x.amount > 0;
    get diagnostics added = row_count;
    n := n + added;
  end loop;

  perform public.apply_unit_credit(p.unit_id)
  from (select distinct unit_id from public.fee_payments where community_id = s.community_id and unallocated_cents > 0) p;
  return n;
end $$;

create or replace function public.allocate_levy(p_levy uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  l public.levies;
  total_coef numeric;
  n int;
begin
  select * into l from public.levies where id = p_levy;
  if l.id is null then raise exception 'Unknown levy'; end if;
  if auth.uid() is not null and not public.is_finance(l.community_id) then raise exception 'Not allowed'; end if;
  select nullif(sum(coefficient), 0) into total_coef from public.units where community_id = l.community_id;
  insert into public.fee_charges (community_id, unit_id, levy_id, period_label, due_date, amount_cents)
  select l.community_id, x.unit_id, l.id, l.title, l.due_date, x.amount
  from (
    select u.id as unit_id, round(l.total_cents * u.coefficient / total_coef)::bigint as amount
    from public.units u where u.community_id = l.community_id
      and not exists (select 1 from public.fee_charges fc where fc.levy_id = l.id and fc.unit_id = u.id)
  ) x
  where x.amount > 0;
  get diagnostics n = row_count;

  perform public.apply_unit_credit(p.unit_id)
  from (select distinct unit_id from public.fee_payments where community_id = l.community_id and unallocated_cents > 0) p;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Quotes: choose one quote for a job in a single transaction.
-- ---------------------------------------------------------------------------
create or replace function public.choose_quote(p_quote uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes;
begin
  select * into q from public.quotes where id = p_quote;
  if q.id is null or not public.is_finance(q.community_id) then
    raise exception 'Not allowed';
  end if;
  update public.quotes set chosen = (id = q.id)
  where community_id = q.community_id and job_title = q.job_title and chosen is distinct from (id = q.id);
end $$;
revoke execute on function public.choose_quote(uuid) from public, anon;
grant execute on function public.choose_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Storage
-- ---------------------------------------------------------------------------
-- Document files follow the document row's visibility (admins keep access so uploads work).
drop policy if exists "documents member read" on storage.objects;
create policy "documents read by visibility" on storage.objects for select using (
  bucket_id = 'documents' and (
    public.is_admin(public.path_community(name))
    or exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name and public.can_see(d.community_id, d.visibility)
    )
  )
);

-- Let the people who upload files also clean them up (failed saves, replaced files).
create policy "documents admin delete" on storage.objects for delete
  using (bucket_id = 'documents' and public.is_admin(public.path_community(name)));
create policy "finance delete" on storage.objects for delete
  using (bucket_id = 'finance' and public.is_finance(public.path_community(name)));
create policy "branding admin delete" on storage.objects for delete
  using (bucket_id = 'branding' and public.is_admin(public.path_community(name)));
