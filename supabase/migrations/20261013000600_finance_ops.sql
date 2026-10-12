-- Finance operations: owner-fee payment corrections and fee reminders.
--
-- 1. Deleting a recorded payment (e.g. a typo by the treasurer) must give the money back to the
--    charges it paid. Without this, payment_allocations cascade away but fee_charges keep their
--    paid_cents/status, so the flat would look paid when it is not.
-- 2. Finance users send fee reminders. A reminder is logged in fee_reminders and every current
--    owner of the flat gets an in-app notification linking to their statement. Notifications are
--    not writable by residents or finance users directly, so this goes through a checked function.

-- ---------------------------------------------------------------------------
-- 1. Reverse a payment's allocations before it is deleted
-- ---------------------------------------------------------------------------
create or replace function public.reverse_fee_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a record;
begin
  for a in
    select pa.charge_id, pa.amount_cents from public.payment_allocations pa where pa.payment_id = old.id
  loop
    update public.fee_charges
      set paid_cents = greatest(paid_cents - a.amount_cents, 0),
          status = case
            when greatest(paid_cents - a.amount_cents, 0) = 0 then 'unpaid'::public.charge_status
            when greatest(paid_cents - a.amount_cents, 0) >= amount_cents then 'paid'::public.charge_status
            else 'partial'::public.charge_status end
      where id = a.charge_id;
  end loop;
  return old;
end $$;

create trigger reverse_fee_payment
before delete on public.fee_payments
for each row execute function public.reverse_fee_payment();

-- ---------------------------------------------------------------------------
-- 2. Send a fee reminder to the current owners of a flat
-- ---------------------------------------------------------------------------
-- Returns the number of owners notified. Only finance roles of the flat's community may call it.
create or replace function public.send_fee_reminder(p_unit uuid, p_note text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  u record;
  owed bigint;
  oldest date;
  msg text;
  note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
  n int;
begin
  select un.id, un.label, un.community_id, c.currency
    into u
    from public.units un join public.communities c on c.id = un.community_id
    where un.id = p_unit;
  if u.id is null or not public.is_finance(u.community_id) then
    raise exception 'Not allowed';
  end if;

  select coalesce(sum(fc.amount_cents - fc.paid_cents), 0), min(fc.due_date)
    into owed, oldest
    from public.fee_charges fc
    where fc.unit_id = u.id and fc.status <> 'paid' and fc.due_date <= current_date;
  if owed <= 0 then
    raise exception 'Flat % has nothing overdue', u.label;
  end if;

  insert into public.fee_reminders (community_id, unit_id, channel, note)
  values (u.community_id, u.id, 'in_app', note);

  msg := 'Flat ' || u.label || ' has '
      || case u.currency when 'EUR' then '€' when 'GBP' then '£' else u.currency || ' ' end
      || to_char(owed / 100.0, 'FM999,999,990.00')
      || ' of community fees outstanding since ' || to_char(oldest, 'FMDD Mon YYYY') || '.'
      || coalesce(' ' || note || case when note ~ '[.!?]$' then '' else '.' end, '')
      || ' If you have already paid, please ignore this message.';

  insert into public.notifications (community_id, profile_id, kind, title, body, link)
  select distinct u.community_id, o.owner_id, 'fee_reminder',
         'Reminder: community fees for flat ' || u.label, msg, '/my-units'
  from public.unit_ownerships o
  join public.memberships m on m.profile_id = o.owner_id and m.community_id = u.community_id and m.status = 'active'
  where o.unit_id = u.id and (o.end_date is null or o.end_date >= current_date);
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.send_fee_reminder(uuid, text) from public, anon;
grant execute on function public.send_fee_reminder(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Approved budgets are locked
-- ---------------------------------------------------------------------------
-- The AGM approves a budget; after that its lines must not change. The app only edits draft
-- budgets, and this makes the database refuse it too. Seeds and maintenance scripts run without a
-- signed-in user (auth.uid() is null) and are not affected; deleting a whole budget still cascades.
create or replace function public.budget_lines_locked_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  st public.budget_status;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  select b.status into st from public.budgets b where b.id = coalesce(new.budget_id, old.budget_id);
  if st = 'approved' then
    raise exception 'This budget has been approved at the AGM and can no longer be changed'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.budget_id <> old.budget_id then
    select b.status into st from public.budgets b where b.id = old.budget_id;
    if st = 'approved' then
      raise exception 'This budget has been approved at the AGM and can no longer be changed'
        using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger budget_lines_locked_guard
before insert or update or delete on public.budget_lines
for each row execute function public.budget_lines_locked_guard();
