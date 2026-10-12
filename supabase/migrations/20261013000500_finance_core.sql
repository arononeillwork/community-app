-- Finance core: invoice disputes, approval integrity, supplier performance and invoice attachments.
--
-- 1. invoices.dispute_reason: why an invoice is disputed. Shown on the invoice; every change is in the audit log.
-- 2. An approval is for an amount. Changing the supplier, number, net or VAT of an invoice that is not paid
--    clears its approvals and sends it back to "received", so nobody can approve €500 and then pay €5,000.
-- 3. supplier_reports(): resident reports about a supplier, for finance users. The treasurer cannot read
--    complaints directly (they hold residents' details); this returns only title, type, status and dates,
--    as a supplier-performance signal.
-- 4. Finance users may delete invoice attachments (to replace or remove a file). Other finance folders
--    (contracts, quotes) are not affected.

-- ---------------------------------------------------------------------------
-- 1. Dispute reason
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column dispute_reason text check (dispute_reason is null or length(dispute_reason) <= 1000);

-- ---------------------------------------------------------------------------
-- 2. Approvals are cleared when what was approved changes
-- ---------------------------------------------------------------------------
create or replace function public.invoice_reset_approvals()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status <> 'paid'
     and (new.supplier_id, new.invoice_number, new.net_cents, new.vat_cents)
         is distinct from (old.supplier_id, old.invoice_number, old.net_cents, old.vat_cents) then
    delete from public.invoice_approvals where invoice_id = old.id;
    if new.status in ('approved', 'paid') then
      new.status := 'received';
      new.paid_date := null;
    end if;
  end if;
  return new;
end $$;

-- Fires before invoice_status_guard (triggers run in name order), so a forced "received" is never checked.
create trigger invoice_reset_approvals
before update of supplier_id, invoice_number, net_cents, vat_cents on public.invoices
for each row execute function public.invoice_reset_approvals();

-- ---------------------------------------------------------------------------
-- 3. Resident reports about a supplier (finance roles only)
-- ---------------------------------------------------------------------------
create or replace function public.supplier_reports(p_supplier uuid)
returns table (
  id uuid, kind public.report_kind, title text, status public.complaint_status,
  priority public.priority, created_at timestamptz, resolved_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select cp.id, cp.kind, cp.title, cp.status, cp.priority, cp.created_at, cp.resolved_at
  from public.complaints cp
  join public.suppliers s on s.id = cp.target_supplier_id
  where s.id = p_supplier
    and cp.community_id = s.community_id
    and public.is_finance(s.community_id)
  order by cp.created_at desc
$$;

revoke execute on function public.supplier_reports(uuid) from public, anon;
grant execute on function public.supplier_reports(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Invoice attachments can be removed by finance roles
-- ---------------------------------------------------------------------------
create policy "finance delete invoice files" on storage.objects for delete using (
  bucket_id = 'finance'
  and split_part(name, '/', 2) = 'invoices'
  and public.is_finance(public.path_community(name))
);
