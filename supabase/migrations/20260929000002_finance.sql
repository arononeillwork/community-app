-- Finance: suppliers, contracts, invoices (+ approval workflow), budgets, quotes, ledger,
-- owner fees (charges, levies, payments, allocation), audit log, reporting views.
-- Money is stored as integer cents.

create type public.billing_frequency as enum ('monthly', 'quarterly', 'yearly', 'one_off');
create type public.contract_status as enum ('active', 'ended', 'cancelled');
create type public.invoice_status as enum ('received', 'approved', 'paid', 'disputed');
create type public.budget_status as enum ('draft', 'approved');
create type public.charge_status as enum ('unpaid', 'partial', 'paid');
create type public.payment_method as enum ('bank_transfer', 'direct_debit', 'cash', 'card', 'other');

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  name text not null,
  color text not null default '#64748b',
  sort int not null default 0,
  unique (community_id, name)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  name text not null,
  service_type text not null,
  tax_id text,
  contact_name text,
  email text,
  phone text,
  website text,
  address text,
  iban text,                     -- finance roles only (RLS)
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  supplier_id uuid not null references public.suppliers on delete restrict,
  category_id uuid references public.expense_categories on delete set null,
  title text not null,
  start_date date not null,
  end_date date,
  notice_period_days int not null default 30 check (notice_period_days >= 0),
  auto_renew boolean not null default false,
  billing_frequency public.billing_frequency not null default 'monthly',
  amount_cents bigint not null check (amount_cents >= 0),   -- per billing period, excl. VAT
  vat_rate numeric(5,2) not null default 21.00,
  price_review_clause text,
  file_path text,
  status public.contract_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  supplier_id uuid not null references public.suppliers on delete restrict,
  contract_id uuid references public.contracts on delete set null,
  category_id uuid references public.expense_categories on delete set null,
  invoice_number text not null,
  issue_date date not null,
  due_date date,
  net_cents bigint not null check (net_cents >= 0),
  vat_cents bigint not null default 0 check (vat_cents >= 0),
  total_cents bigint generated always as (net_cents + vat_cents) stored,
  status public.invoice_status not null default 'received',
  paid_date date,
  file_path text,
  notes text,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  unique (community_id, supplier_id, invoice_number)
);
create index on public.invoices (community_id, issue_date);

create table public.invoice_approvals (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  invoice_id uuid not null references public.invoices on delete cascade,
  approver_id uuid not null references public.profiles on delete cascade,
  approved_at timestamptz not null default now(),
  unique (invoice_id, approver_id)
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  year int not null,
  name text not null,
  status public.budget_status not null default 'draft',
  approved_at date,
  unique (community_id, year)
);

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  budget_id uuid not null references public.budgets on delete cascade,
  category_id uuid not null references public.expense_categories on delete restrict,
  amount_cents bigint not null check (amount_cents >= 0),
  unique (budget_id, category_id)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  job_title text not null,
  supplier_id uuid references public.suppliers on delete set null,
  supplier_name text,
  amount_cents bigint not null,
  valid_until date,
  file_path text,
  chosen boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  entry_date date not null,
  description text not null,
  amount_cents bigint not null,         -- + money in, - money out
  reference text,
  source text not null default 'manual' check (source in ('manual', 'bank_import')),
  invoice_id uuid references public.invoices on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Owner fees
-- ---------------------------------------------------------------------------
create table public.fee_schedules (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  year int not null,
  budget_id uuid references public.budgets on delete set null,
  frequency public.billing_frequency not null default 'quarterly',
  method text not null default 'coefficient' check (method in ('coefficient', 'fixed')),
  annual_total_cents bigint,            -- used with 'coefficient'
  fixed_amount_cents bigint,            -- per unit per period with 'fixed'
  active boolean not null default true,
  unique (community_id, year)
);

create table public.levies (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  title text not null,
  description text,
  total_cents bigint not null,
  due_date date not null,
  created_at timestamptz not null default now()
);

create table public.fee_charges (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  unit_id uuid not null references public.units on delete cascade,
  schedule_id uuid references public.fee_schedules on delete cascade,
  levy_id uuid references public.levies on delete cascade,
  period_label text not null,           -- e.g. "2026 Q3" or levy title
  due_date date not null,
  amount_cents bigint not null check (amount_cents >= 0),
  paid_cents bigint not null default 0,
  status public.charge_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  check (schedule_id is not null or levy_id is not null)
);
create index on public.fee_charges (unit_id, due_date);

create table public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  unit_id uuid not null references public.units on delete cascade,
  paid_on date not null,
  amount_cents bigint not null check (amount_cents > 0),
  method public.payment_method not null default 'bank_transfer',
  reference text,
  unallocated_cents bigint not null default 0,  -- credit carried forward
  recorded_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create table public.payment_allocations (
  payment_id uuid not null references public.fee_payments on delete cascade,
  charge_id uuid not null references public.fee_charges on delete cascade,
  community_id uuid not null references public.communities on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  primary key (payment_id, charge_id)
);

create table public.fee_reminders (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  unit_id uuid not null references public.units on delete cascade,
  channel text not null default 'email',
  sent_at timestamptz not null default now(),
  note text
);

-- ---------------------------------------------------------------------------
-- Audit log (append-only; written by trigger only)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  community_id uuid,
  table_name text not null,
  record_id text,
  action text not null,
  actor uuid,
  at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);
create index on public.audit_log (community_id, at desc);

create or replace function public.write_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (community_id, table_name, record_id, action, actor, old_data, new_data)
  values (
    (rec ->> 'community_id')::uuid, tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'payment_id'),
    lower(tg_op), auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['suppliers','contracts','invoices','invoice_approvals','budgets','budget_lines',
                           'ledger_entries','fee_schedules','levies','fee_charges','fee_payments','quotes']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.write_audit()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Invoice approval workflow (enforced in the database)
-- ---------------------------------------------------------------------------
create or replace function public.required_approvals(inv public.invoices)
returns int language sql stable security definer set search_path = '' as $$
  select case when (inv.net_cents + inv.vat_cents) > coalesce((c.settings ->> 'invoice_approval_threshold_cents')::bigint, 100000)
              then 2 else 1 end
  from public.communities c where c.id = inv.community_id
$$;

create or replace function public.invoice_status_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if new.status in ('approved', 'paid') and old.status not in ('approved', 'paid') then
    select count(*) into n from public.invoice_approvals where invoice_id = new.id;
    if n < public.required_approvals(new) then
      raise exception 'Invoice % needs % approval(s) before it can be approved or paid (has %)',
        new.invoice_number, public.required_approvals(new), n;
    end if;
  end if;
  if new.status = 'paid' and new.paid_date is null then
    new.paid_date := current_date;
  end if;
  return new;
end $$;

create trigger invoice_status_guard
before update of status on public.invoices
for each row execute function public.invoice_status_guard();

-- Record the caller's approval; flips the invoice to approved once enough approvals exist.
create or replace function public.approve_invoice(p_invoice uuid)
returns public.invoice_status language plpgsql security definer set search_path = '' as $$
declare
  inv public.invoices;
  n int;
begin
  select * into inv from public.invoices where id = p_invoice;
  if inv.id is null or not public.is_finance(inv.community_id) then
    raise exception 'Not allowed';
  end if;
  insert into public.invoice_approvals (community_id, invoice_id, approver_id)
  values (inv.community_id, inv.id, auth.uid()) on conflict do nothing;
  select count(*) into n from public.invoice_approvals where invoice_id = inv.id;
  if inv.status = 'received' and n >= public.required_approvals(inv) then
    update public.invoices set status = 'approved' where id = inv.id;
    return 'approved';
  end if;
  return inv.status;
end $$;

-- ---------------------------------------------------------------------------
-- Owner fee logic
-- ---------------------------------------------------------------------------
-- Allocate a payment to the unit's oldest open charges; remainder becomes credit.
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
    where unit_id = new.unit_id and status <> 'paid'
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

create trigger allocate_fee_payment
after insert on public.fee_payments
for each row execute function public.allocate_fee_payment();

-- Generate period charges for every unit from a fee schedule (idempotent per period).
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
    select s.community_id, u.id, s.id, v_label, due,
      case when s.method = 'fixed' then s.fixed_amount_cents
           else round(s.annual_total_cents * u.coefficient / total_coef / periods)::bigint end
    from public.units u
    where u.community_id = s.community_id
      and not exists (select 1 from public.fee_charges fc where fc.schedule_id = s.id and fc.unit_id = u.id and fc.period_label = v_label);
    get diagnostics added = row_count;
    n := n + added;
  end loop;
  return n;
end $$;

-- Split an extraordinary levy across units by coefficient.
create or replace function public.allocate_levy(p_levy uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  l public.levies;
  total_coef numeric;
  n int;
begin
  select * into l from public.levies where id = p_levy;
  if auth.uid() is not null and not public.is_finance(l.community_id) then raise exception 'Not allowed'; end if;
  select nullif(sum(coefficient), 0) into total_coef from public.units where community_id = l.community_id;
  insert into public.fee_charges (community_id, unit_id, levy_id, period_label, due_date, amount_cents)
  select l.community_id, u.id, l.id, l.title, l.due_date, round(l.total_cents * u.coefficient / total_coef)::bigint
  from public.units u where u.community_id = l.community_id
    and not exists (select 1 from public.fee_charges fc where fc.levy_id = l.id and fc.unit_id = u.id);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Reporting views (security_invoker => caller's RLS applies)
-- ---------------------------------------------------------------------------
create view public.v_contract_key_dates with (security_invoker = true) as
select c.id, c.community_id, c.title, c.status, s.name as supplier_name, s.service_type,
  ec.name as category_name, c.start_date, c.end_date,
  case when c.end_date is not null
       then (extract(year from age(c.end_date, c.start_date)) * 12 + extract(month from age(c.end_date, c.start_date)))::int
  end as length_months,
  c.notice_period_days,
  (c.end_date - c.notice_period_days) as notice_deadline,
  c.auto_renew, c.billing_frequency, c.amount_cents, c.vat_rate,
  (c.amount_cents * case c.billing_frequency when 'monthly' then 12 when 'quarterly' then 4 else 1 end) as annual_cost_cents,
  (c.end_date - current_date) as days_to_end,
  ((c.end_date - c.notice_period_days) - current_date) as days_to_notice
from public.contracts c
join public.suppliers s on s.id = c.supplier_id
left join public.expense_categories ec on ec.id = c.category_id;

create view public.v_invoice_list with (security_invoker = true) as
select i.*, s.name as supplier_name, ec.name as category_name, c.title as contract_title,
  (select count(*) from public.invoice_approvals a where a.invoice_id = i.id) as approvals,
  (i.status in ('received', 'approved') and i.due_date < current_date) as overdue
from public.invoices i
join public.suppliers s on s.id = i.supplier_id
left join public.expense_categories ec on ec.id = i.category_id
left join public.contracts c on c.id = i.contract_id;

create view public.v_spend_by_category_month with (security_invoker = true) as
select i.community_id, date_trunc('month', i.issue_date)::date as month,
  coalesce(ec.name, 'Uncategorised') as category_name, ec.color,
  sum(i.total_cents) as total_cents, count(*) as invoice_count
from public.invoices i
left join public.expense_categories ec on ec.id = i.category_id
where i.status <> 'disputed'
group by 1, 2, 3, 4;

create view public.v_budget_vs_actual with (security_invoker = true) as
select b.community_id, b.year, ec.id as category_id, ec.name as category_name, ec.color,
  bl.amount_cents as budget_cents,
  coalesce((select sum(i.total_cents) from public.invoices i
            where i.category_id = ec.id and i.status <> 'disputed'
              and extract(year from i.issue_date) = b.year), 0)::bigint as actual_cents
from public.budgets b
join public.budget_lines bl on bl.budget_id = b.id
join public.expense_categories ec on ec.id = bl.category_id;

create view public.v_supplier_spend with (security_invoker = true) as
select s.id, s.community_id, s.name, s.service_type, s.email, s.phone, s.active,
  (select count(*) from public.contracts c where c.supplier_id = s.id and c.status = 'active') as active_contracts,
  coalesce((select sum(total_cents) from public.invoices i where i.supplier_id = s.id
            and extract(year from i.issue_date) = extract(year from current_date)), 0)::bigint as spend_this_year_cents,
  coalesce((select sum(total_cents) from public.invoices i where i.supplier_id = s.id), 0)::bigint as spend_all_time_cents
from public.suppliers s;

create view public.v_unit_balance with (security_invoker = true) as
select u.id as unit_id, u.community_id, u.label, u.coefficient, b.name as building_name,
  coalesce(sum(fc.amount_cents), 0)::bigint as charged_cents,
  coalesce(sum(fc.paid_cents), 0)::bigint as paid_cents,
  coalesce(sum(fc.amount_cents - fc.paid_cents) filter (where fc.due_date <= current_date), 0)::bigint as overdue_cents,
  min(fc.due_date) filter (where fc.status <> 'paid' and fc.due_date <= current_date) as oldest_unpaid_due,
  (select string_agg(p.full_name, ', ') from public.unit_ownerships o join public.profiles p on p.id = o.owner_id
    where o.unit_id = u.id and (o.end_date is null or o.end_date >= current_date)) as owner_names,
  (select max(r.sent_at) from public.fee_reminders r where r.unit_id = u.id) as last_reminder_at
from public.units u
left join public.buildings b on b.id = u.building_id
left join public.fee_charges fc on fc.unit_id = u.id
group by u.id, b.name;

-- Resident-facing "Where the money goes": aggregate only, any member may call.
create or replace function public.community_spend_summary(c uuid, yr int default extract(year from current_date)::int)
returns table (category_name text, color text, budget_cents bigint, actual_cents bigint)
language sql stable security definer set search_path = '' as $$
  select ec.name, ec.color,
    coalesce(bl.amount_cents, 0)::bigint,
    coalesce((select sum(i.total_cents) from public.invoices i
              where i.category_id = ec.id and i.status <> 'disputed' and extract(year from i.issue_date) = yr), 0)::bigint
  from public.expense_categories ec
  left join public.budgets b on b.community_id = c and b.year = yr
  left join public.budget_lines bl on bl.budget_id = b.id and bl.category_id = ec.id
  where ec.community_id = c and public.is_member(c)
  order by ec.sort, ec.name
$$;

create or replace function public.community_contracts_public(c uuid)
returns table (supplier_name text, service_type text, title text, end_date date, annual_cost_cents bigint)
language sql stable security definer set search_path = '' as $$
  select s.name, s.service_type, ct.title, ct.end_date,
    ct.amount_cents * case ct.billing_frequency when 'monthly' then 12 when 'quarterly' then 4 else 1 end
  from public.contracts ct join public.suppliers s on s.id = ct.supplier_id
  where ct.community_id = c and ct.status = 'active' and public.is_member(c)
  order by s.name
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['expense_categories','suppliers','contracts','invoices','invoice_approvals','budgets',
                           'budget_lines','quotes','ledger_entries','fee_schedules','levies','fee_charges',
                           'fee_payments','payment_allocations','fee_reminders','audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  -- Finance roles have full access to the working tables (audit_log is excluded: read-only).
  foreach t in array array['expense_categories','suppliers','contracts','invoices','budgets','budget_lines',
                           'quotes','ledger_entries','fee_schedules','levies','fee_charges','fee_payments',
                           'fee_reminders']
  loop
    execute format('create policy "finance manage %1$s" on public.%1$I for all
                    using (public.is_finance(community_id)) with check (public.is_finance(community_id))', t);
  end loop;
end $$;

create policy "members read categories" on public.expense_categories for select using (public.is_member(community_id));
create policy "finance read approvals" on public.invoice_approvals for select using (public.is_finance(community_id));
create policy "finance read allocations" on public.payment_allocations for select using (public.is_finance(community_id));
create policy "finance read audit" on public.audit_log for select using (public.is_finance(community_id));

-- Owners see their own units' charges and payments (tenants never see fee data).
create policy "owners read own charges" on public.fee_charges for select using (public.owns_unit(unit_id));
create policy "owners read own payments" on public.fee_payments for select using (public.owns_unit(unit_id));
create policy "owners read own allocations" on public.payment_allocations for select using (
  exists (select 1 from public.fee_payments p where p.id = payment_id and public.owns_unit(p.unit_id))
);
create policy "owners read levies" on public.levies for select using (public.has_role(community_id, '{owner}'));
