-- "My flat" for owners: who lives in the flats I own.
--
-- Owners cannot read other people's profiles directly (RLS on profiles), and the member
-- directories only list people with an active tenancy. A landlord still needs to see the
-- name of a tenant they have just added (pending approval) and of past tenants, so this
-- function returns the tenancies of the caller's own flats with the tenant's name.
-- Phone and email follow the tenant's sharing choice: hidden when they chose
-- "only the administrators", and hidden for former (ended) tenancies, which only show the name.
-- Administrators see every tenancy and every detail.

create or replace function public.unit_tenants(c uuid)
returns table (
  tenancy_id uuid, unit_id uuid, tenant_id uuid, full_name text,
  email text, phone text, preferred_method public.contact_method, shared boolean
) language sql stable security definer set search_path = '' as $$
  select t.id, t.unit_id, t.tenant_id, p.full_name,
    case when s.shared then p.email end,
    case when s.shared then p.phone end,
    cp.preferred_method,
    s.shared
  from public.tenancies t
  join public.profiles p on p.id = t.tenant_id
  left join public.contact_preferences cp on cp.profile_id = t.tenant_id and cp.community_id = c
  cross join lateral (
    select public.is_admin(c) or t.tenant_id = auth.uid()
      or (t.status <> 'ended' and coalesce(cp.visibility, 'block') <> 'admins') as shared
  ) s
  where t.community_id = c
    and (public.owns_unit(t.unit_id) or public.is_admin(c))
  order by t.unit_id, t.start_date desc
$$;

revoke execute on function public.unit_tenants(uuid) from public, anon;
grant execute on function public.unit_tenants(uuid) to authenticated;

-- The unread count in the top bar runs on every page.
create index if not exists notifications_unread_idx on public.notifications (profile_id) where read_at is null;

-- Fix: "update own profile" compared is_platform_admin with a sub-select on profiles, which made
-- Postgres recurse into the profiles policies ("infinite recursion detected in policy"), so nobody
-- could save their own name or phone. Use the security-definer helper instead; the rule is the same
-- (people may edit their own row but never change their platform-admin flag).
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and is_platform_admin = public.is_platform_admin());
