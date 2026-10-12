-- Library: Bins & info, Local area, Documents.
--
--   1. Document files follow their document's visibility. Until now any member could read any file in
--      the private "documents" bucket, so a tenant holding the path of an owners-only file could open it.
--      Files that no document row points to (an upload still being saved, or an old file whose removal
--      failed) are for administrators only, so they can never leak through a bucket listing.
--   2. Administrators can delete files in the "documents" bucket (needed to delete or replace a document).
--   3. Administrators can add and remove translations of their community's documents.
--   4. Places suggested by residents show who suggested them: the full name to administrators and to the
--      person themselves, "First L." to everyone else (residents cannot read other blocks' profiles).

-- ---------------------------------------------------------------------------
-- 1 + 2. Storage rules for the documents bucket
-- ---------------------------------------------------------------------------
create index if not exists documents_storage_path_idx on public.documents (storage_path) where storage_path is not null;

create or replace function public.can_read_document_file(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  with f as (select public.path_community(p_name) as c)
  select case
    when f.c is null then false
    when public.is_admin(f.c) then true
    else exists (
      select 1 from public.documents d
      where d.storage_path = p_name and d.community_id = f.c and public.can_see(d.community_id, d.visibility)
    )
  end
  from f
$$;

-- Used inside a storage policy, so every role that queries storage.objects must be able to run it
-- (it is false for anyone who is not a member of the file's community).
revoke execute on function public.can_read_document_file(text) from public;
grant execute on function public.can_read_document_file(text) to anon, authenticated;

drop policy if exists "documents member read" on storage.objects;
create policy "documents read by visibility" on storage.objects for select
  using (bucket_id = 'documents' and public.can_read_document_file(name));

create policy "documents admin delete" on storage.objects for delete
  using (bucket_id = 'documents' and public.is_admin(public.path_community(name)));

-- ---------------------------------------------------------------------------
-- 3. Translations managed by administrators
-- ---------------------------------------------------------------------------
create policy "admins manage translations" on public.document_translations for all
  using (public.is_admin(community_id))
  with check (
    public.is_admin(community_id)
    and exists (select 1 from public.documents d where d.id = document_id and d.community_id = document_translations.community_id)
  );

-- ---------------------------------------------------------------------------
-- 4. Who suggested a place
-- ---------------------------------------------------------------------------
create or replace function public.local_place_suggesters(c uuid)
returns table (place_id uuid, name text) language sql stable security definer set search_path = '' as $$
  select lp.id,
    case
      when public.is_admin(c) or p.id = auth.uid() or position(' ' in btrim(p.full_name)) = 0 then btrim(p.full_name)
      else split_part(btrim(p.full_name), ' ', 1) || ' ' || upper(left(regexp_replace(btrim(p.full_name), '^.*\s', ''), 1)) || '.'
    end
  from public.local_places lp
  join public.profiles p on p.id = lp.recommended_by
  where lp.community_id = c
    and public.is_member(c)
    and nullif(btrim(p.full_name), '') is not null
$$;

revoke execute on function public.local_place_suggesters(uuid) from public, anon;
grant execute on function public.local_place_suggesters(uuid) to authenticated;
