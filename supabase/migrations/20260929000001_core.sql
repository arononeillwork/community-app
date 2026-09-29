-- Core: communities (white-label), profiles, roles, buildings/units, ownership, tenancies, preferences.
-- Every community-owned table carries community_id and is protected by RLS.

create extension if not exists vector with schema extensions;

create type public.app_role as enum ('tenant', 'owner', 'admin', 'treasurer');
create type public.membership_status as enum ('pending', 'active', 'ended');
create type public.tenancy_type as enum ('long_term', 'short_term', 'family', 'holiday_let', 'other');
create type public.tenancy_status as enum ('pending', 'active', 'ended');
create type public.visibility as enum ('all', 'owners', 'admins');
create type public.contact_visibility as enum ('admins', 'unit', 'all');
create type public.contact_method as enum ('phone', 'whatsapp', 'email', 'letter');

-- ---------------------------------------------------------------------------
-- Communities + white-label
-- ---------------------------------------------------------------------------
create table public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  custom_domain text unique,
  status text not null default 'active' check (status in ('active', 'suspended')),
  default_language text not null default 'en',
  enabled_languages text[] not null default '{en,es}',
  timezone text not null default 'Europe/Madrid',
  currency text not null default 'EUR',
  -- tenant_requires_approval, invoice_approval_threshold_cents, features {...}
  settings jsonb not null default '{"tenant_requires_approval": false, "invoice_approval_threshold_cents": 100000, "features": {"ai": true, "whatsapp": false, "meetings": true}}',
  created_at timestamptz not null default now()
);

create table public.community_branding (
  community_id uuid primary key references public.communities on delete cascade,
  logo_url text,
  hero_image_url text,
  favicon_url text,
  primary_color text not null default '#0f766e' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  accent_color text not null default '#f59e0b' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at timestamptz not null default now()
);

create table public.community_public_info (
  community_id uuid primary key references public.communities on delete cascade,
  tagline jsonb not null default '{}',          -- {"en": "...", "es": "..."}
  welcome jsonb not null default '{}',          -- {"en": "...", "es": "..."}
  address text,
  lat double precision,
  lng double precision,
  office_hours jsonb not null default '[]',     -- [{"label": "Mon–Fri", "hours": "09:00–14:00"}]
  emergency_contacts jsonb not null default '[]', -- [{"label": "Emergency", "phone": "112"}]
  public_notices jsonb not null default '[]',   -- [{"title": "...", "body": "...", "date": "2026-10-01"}]
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- People + roles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  whatsapp_verified boolean not null default false,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- A person can hold several roles in a community (e.g. owner + admin).
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  role public.app_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (community_id, profile_id, role)
);
create index on public.memberships (profile_id);

create table public.user_preferences (
  profile_id uuid primary key references public.profiles on delete cascade,
  font_scale int not null default 100 check (font_scale in (100, 125, 150, 175, 200)),
  high_contrast boolean not null default false,
  theme text not null default 'light' check (theme in ('light', 'dark', 'system')),
  reduce_motion boolean not null default false,
  dyslexia_font boolean not null default false,
  language text not null default 'en',
  speech_rate numeric(3,2) not null default 1.00 check (speech_rate between 0.5 and 1.5),
  voice_enabled boolean not null default true,
  simple_mode boolean not null default true,
  notify_channel text not null default 'email' check (notify_channel in ('push', 'email', 'whatsapp')),
  updated_at timestamptz not null default now()
);

create table public.contact_preferences (
  profile_id uuid not null references public.profiles on delete cascade,
  community_id uuid not null references public.communities on delete cascade,
  preferred_method public.contact_method not null default 'email',
  best_times text,
  visibility public.contact_visibility not null default 'unit',
  primary key (profile_id, community_id)
);

-- ---------------------------------------------------------------------------
-- Buildings, units, ownership, tenancies
-- ---------------------------------------------------------------------------
create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  name text not null,
  sort int not null default 0
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  building_id uuid references public.buildings on delete set null,
  label text not null,
  floor int,
  bedrooms int,
  coefficient numeric(7,4) not null default 0, -- participation share in %, sums to ~100 per community
  unique (community_id, label)
);

create table public.unit_ownerships (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  unit_id uuid not null references public.units on delete cascade,
  owner_id uuid not null references public.profiles on delete cascade,
  start_date date not null default current_date,
  end_date date
);
create index on public.unit_ownerships (owner_id);
create index on public.unit_ownerships (unit_id);

create table public.tenancies (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  unit_id uuid not null references public.units on delete cascade,
  tenant_id uuid not null references public.profiles on delete cascade,
  added_by uuid references public.profiles on delete set null,
  tenancy_type public.tenancy_type not null default 'long_term',
  start_date date not null default current_date,
  end_date date,
  status public.tenancy_status not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index on public.tenancies (tenant_id);
create index on public.tenancies (unit_id);

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.has_role(c uuid, roles public.app_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.community_id = c and m.profile_id = auth.uid()
      and m.status = 'active' and m.role = any (roles)
  ) or public.is_platform_admin()
$$;

create or replace function public.is_member(c uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role(c, '{tenant,owner,admin,treasurer}')
$$;

create or replace function public.is_admin(c uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role(c, '{admin}')
$$;

create or replace function public.is_finance(c uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role(c, '{admin,treasurer}')
$$;

create or replace function public.owns_unit(u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.unit_ownerships o
    where o.unit_id = u and o.owner_id = auth.uid()
      and (o.end_date is null or o.end_date >= current_date)
  )
$$;

create or replace function public.lives_in_unit(u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenancies t
    where t.unit_id = u and t.tenant_id = auth.uid() and t.status = 'active'
  )
$$;

-- Can the current user see content with this visibility level?
create or replace function public.can_see(c uuid, v public.visibility)
returns boolean language sql stable security definer set search_path = '' as $$
  select case v
    when 'all' then public.is_member(c)
    when 'owners' then public.has_role(c, '{owner,admin,treasurer}')
    else public.has_role(c, '{admin,treasurer}')
  end
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
-- New auth user -> profile + default preferences.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.phone)
  on conflict (id) do nothing;
  insert into public.user_preferences (profile_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_user();

-- Landlord-added tenancies: status depends on community setting; admins always activate directly.
create or replace function public.tenancy_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  needs_approval boolean;
begin
  if new.community_id <> (select community_id from public.units where id = new.unit_id) then
    raise exception 'Unit does not belong to this community';
  end if;
  new.added_by := coalesce(new.added_by, auth.uid());
  if auth.uid() is not null and not public.is_admin(new.community_id) then
    select coalesce((settings ->> 'tenant_requires_approval')::boolean, false)
      into needs_approval from public.communities where id = new.community_id;
    new.status := case when needs_approval then 'pending' else 'active' end;
  end if;
  if new.end_date is not null and new.end_date < current_date then
    new.status := 'ended';
  end if;
  return new;
end $$;

create trigger tenancy_before_insert
before insert on public.tenancies for each row execute function public.tenancy_before_insert();

-- Keep the tenant membership in sync with tenancies.
create or replace function public.sync_tenant_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  has_active boolean;
begin
  select exists (
    select 1 from public.tenancies
    where tenant_id = new.tenant_id and community_id = new.community_id and status = 'active'
  ) into has_active;

  insert into public.memberships (community_id, profile_id, role, status)
  values (new.community_id, new.tenant_id, 'tenant',
          case when has_active then 'active'::public.membership_status
               when new.status = 'pending' then 'pending'::public.membership_status
               else 'ended'::public.membership_status end)
  on conflict (community_id, profile_id, role)
  do update set status = excluded.status;
  return new;
end $$;

create trigger tenancy_sync_membership
after insert or update of status on public.tenancies
for each row execute function public.sync_tenant_membership();

-- Daily job: end tenancies whose end date has passed.
create or replace function public.expire_tenancies()
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  update public.tenancies set status = 'ended'
  where status = 'active' and end_date is not null and end_date < current_date;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.expire_tenancies() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.communities enable row level security;
alter table public.community_branding enable row level security;
alter table public.community_public_info enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.user_preferences enable row level security;
alter table public.contact_preferences enable row level security;
alter table public.buildings enable row level security;
alter table public.units enable row level security;
alter table public.unit_ownerships enable row level security;
alter table public.tenancies enable row level security;

-- Public landing pages need community, branding and public info without login.
create policy "public read active communities" on public.communities
  for select using (status = 'active' or public.is_platform_admin());
create policy "admins update community" on public.communities
  for update using (public.is_admin(id)) with check (public.is_admin(id));
create policy "platform admins manage communities" on public.communities
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "public read branding" on public.community_branding for select using (true);
create policy "admins manage branding" on public.community_branding
  for all using (public.is_admin(community_id)) with check (public.is_admin(community_id));

create policy "public read info" on public.community_public_info for select using (true);
create policy "admins manage info" on public.community_public_info
  for all using (public.is_admin(community_id)) with check (public.is_admin(community_id));

-- Profiles: yourself, or anyone in a community you administer. Everyone else goes through
-- the directory() function, which applies contact preferences.
create policy "read own profile" on public.profiles for select using (id = auth.uid());
create policy "admins read community profiles" on public.profiles for select using (
  exists (select 1 from public.memberships m where m.profile_id = profiles.id and public.is_admin(m.community_id))
);
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid() and is_platform_admin = (select p.is_platform_admin from public.profiles p where p.id = auth.uid()));

create policy "read own memberships" on public.memberships for select using (profile_id = auth.uid() or public.is_admin(community_id));
create policy "admins manage memberships" on public.memberships
  for all using (public.is_admin(community_id)) with check (public.is_admin(community_id));

create policy "own preferences" on public.user_preferences
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "own contact preferences" on public.contact_preferences
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid() and public.is_member(community_id));
create policy "admins read contact preferences" on public.contact_preferences
  for select using (public.is_admin(community_id));

create policy "members read buildings" on public.buildings for select using (public.is_member(community_id));
create policy "admins manage buildings" on public.buildings
  for all using (public.is_admin(community_id)) with check (public.is_admin(community_id));

create policy "members read units" on public.units for select using (public.is_member(community_id));
create policy "admins manage units" on public.units
  for all using (public.is_admin(community_id)) with check (public.is_admin(community_id));

create policy "members read ownerships" on public.unit_ownerships for select using (public.is_member(community_id));
create policy "admins manage ownerships" on public.unit_ownerships
  for all using (public.is_admin(community_id)) with check (public.is_admin(community_id));

create policy "read relevant tenancies" on public.tenancies for select using (
  tenant_id = auth.uid() or public.owns_unit(unit_id) or public.is_admin(community_id)
);
create policy "owners and admins add tenancies" on public.tenancies for insert with check (
  public.is_admin(community_id) or public.owns_unit(unit_id)
);
create policy "owners and admins update tenancies" on public.tenancies for update using (
  public.is_admin(community_id) or public.owns_unit(unit_id)
) with check (public.is_admin(community_id) or public.owns_unit(unit_id));

-- Owners may end/extend a tenancy but only admins may approve a pending one.
create or replace function public.tenancy_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status = 'active' and not public.is_admin(new.community_id) then
    raise exception 'Only an administrator can approve a tenancy';
  end if;
  if new.unit_id <> old.unit_id or new.tenant_id <> old.tenant_id or new.community_id <> old.community_id then
    raise exception 'Unit, tenant and community cannot be changed on a tenancy';
  end if;
  return new;
end $$;
create trigger tenancy_before_update
before update on public.tenancies for each row execute function public.tenancy_before_update();

-- ---------------------------------------------------------------------------
-- Directory: contact details filtered by each person's visibility preference.
-- ---------------------------------------------------------------------------
create or replace function public.directory(c uuid)
returns table (
  profile_id uuid, full_name text, roles public.app_role[], units text[],
  email text, phone text, preferred_method public.contact_method, best_times text, is_my_owner boolean
) language sql stable security definer set search_path = '' as $$
  with me as (
    select coalesce(array_agg(t.unit_id), '{}') as my_units
    from public.tenancies t where t.tenant_id = auth.uid() and t.status = 'active' and t.community_id = c
  ),
  people as (
    select p.id, p.full_name, p.email, p.phone,
           array_agg(distinct m.role) as roles
    from public.profiles p
    join public.memberships m on m.profile_id = p.id and m.community_id = c and m.status = 'active'
    group by p.id
  ),
  person_units as (
    select x.pid, array_agg(distinct u.label order by u.label) as labels, array_agg(distinct u.id) as ids
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
      or 'admin' = any (pe.roles)            -- admins are always reachable by residents
      or coalesce(cp.visibility, 'unit') = 'all'
      or (coalesce(cp.visibility, 'unit') = 'unit' and (
            mo.is_my_owner
            or exists (select 1 from public.tenancies t where t.tenant_id = pe.id and t.status = 'active' and public.owns_unit(t.unit_id))
         )) as allowed
  ) a
  where public.is_member(c)
  order by pe.full_name
$$;
