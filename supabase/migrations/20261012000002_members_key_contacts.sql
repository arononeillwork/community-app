-- Members per block + key contacts (president, concierge, administrator, block representatives…).
--
-- Who sees what:
--   * Residents see the members of their own block(s) only. Contact details follow each person's
--     visibility preference: 'all' and 'block' are shared with the block, 'unit' only with the people
--     of their own flat (landlord ↔ tenant), 'admins' with nobody but the administrators.
--   * Administrators see every block and everyone's contact details, so they can reach people quickly
--     (a leak, a lift problem, a flat that needs to be accessed).
--   * Key contacts are community-wide, or scoped to one block (e.g. "Block A representative").

-- New people share their details with their block unless they choose otherwise.
alter table public.contact_preferences alter column visibility set default 'block';

-- ---------------------------------------------------------------------------
-- Block helpers
-- ---------------------------------------------------------------------------
-- Buildings where the current user owns a flat or is an active tenant.
create or replace function public.my_buildings(c uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct u.building_id) filter (where u.building_id is not null), '{}')
  from public.units u
  where u.community_id = c
    and (
      exists (select 1 from public.unit_ownerships o
              where o.unit_id = u.id and o.owner_id = auth.uid()
                and (o.end_date is null or o.end_date >= current_date))
      or exists (select 1 from public.tenancies t
                 where t.unit_id = u.id and t.tenant_id = auth.uid() and t.status = 'active')
    )
$$;

create or replace function public.in_building(b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.buildings bl
    where bl.id = b and b = any (public.my_buildings(bl.community_id))
  )
$$;

-- ---------------------------------------------------------------------------
-- Key contacts
-- ---------------------------------------------------------------------------
create type public.contact_group as enum ('committee', 'management', 'staff', 'services', 'emergency');

create table public.key_contacts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  building_id uuid references public.buildings on delete cascade,   -- null = whole community
  role_title text not null check (length(trim(role_title)) between 2 and 80),
  contact_group public.contact_group not null default 'staff',
  profile_id uuid references public.profiles on delete set null,    -- set when the role is held by a member
  name text,
  organisation text,
  phone text,
  whatsapp text,
  email text,
  hours text,
  notes text,
  visibility public.visibility not null default 'all',
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  check (coalesce(phone, whatsapp, email) is not null)
);
create index on public.key_contacts (community_id, sort);

-- A block-scoped contact must belong to a block of the same community.
create or replace function public.key_contact_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.building_id is not null and not exists (
    select 1 from public.buildings b where b.id = new.building_id and b.community_id = new.community_id
  ) then
    raise exception 'That block does not belong to this community';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger key_contact_before_write before insert or update on public.key_contacts
for each row execute function public.key_contact_before_write();

alter table public.key_contacts enable row level security;

create policy "members read key contacts" on public.key_contacts for select using (
  public.can_see(community_id, visibility)
  and (building_id is null or public.is_admin(community_id) or public.in_building(building_id))
);
create policy "admins manage key contacts" on public.key_contacts for all
  using (public.is_admin(community_id)) with check (public.is_admin(community_id));

-- ---------------------------------------------------------------------------
-- Members by block
-- ---------------------------------------------------------------------------
-- One row per person per flat (an owner of two flats appears twice). Residents get their own
-- block(s) only; administrators get every block and every contact detail.
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
      or coalesce(cp.visibility, 'block') = 'all'
      or (coalesce(cp.visibility, 'block') = 'block' and b.id = any (v.blocks))
      or (coalesce(cp.visibility, 'block') in ('unit', 'block') and u.id = any (v.my_units))
      as shared
  ) s
  where public.is_member(c)
    and (v.admin or b.id = any (v.blocks))
  order by b.sort, b.name, u.floor nulls last, u.label, oc.relation, p.full_name
$$;

-- Every block with its size, so residents can see the shape of the community without seeing
-- other blocks' names. is_mine marks the blocks the viewer can open.
create or replace function public.block_summary(c uuid)
returns table (building_id uuid, building_name text, building_sort int, units int, people int, is_mine boolean)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.sort,
    (select count(*) from public.units u where u.building_id = b.id)::int,
    (select count(distinct x.pid) from (
       select o.owner_id as pid from public.unit_ownerships o join public.units u on u.id = o.unit_id
       where u.building_id = b.id and (o.end_date is null or o.end_date >= current_date)
       union
       select t.tenant_id from public.tenancies t join public.units u on u.id = t.unit_id
       where u.building_id = b.id and t.status = 'active'
     ) x)::int,
    b.id = any (public.my_buildings(c)) or public.is_admin(c)
  from public.buildings b
  where b.community_id = c and public.is_member(c)
  order by b.sort, b.name
$$;

-- ---------------------------------------------------------------------------
-- directory(): same shape as before, now block-aware.
-- ---------------------------------------------------------------------------
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
      or 'admin' = any (pe.roles)            -- administrators are always reachable by residents
      or coalesce(cp.visibility, 'block') = 'all'
      or (coalesce(cp.visibility, 'block') = 'block' and coalesce(pu.blocks, '{}') && me.my_blocks)
      or (coalesce(cp.visibility, 'block') in ('unit', 'block') and (
            mo.is_my_owner
            or exists (select 1 from public.tenancies t where t.tenant_id = pe.id and t.status = 'active' and public.owns_unit(t.unit_id))
         )) as allowed
  ) a
  where public.is_member(c)
  order by pe.full_name
$$;
