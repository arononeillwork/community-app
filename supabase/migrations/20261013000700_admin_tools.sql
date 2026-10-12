-- Administration area: small database helpers the admin pages need.
--
-- 1. resolve_unanswered_question(): administrators can read assistant questions flagged as unanswered
--    ("admins read unanswered") but have no update right on assistant_messages, which belong to the
--    resident who asked. Once the admin has added an answer to the FAQ (or dismissed the question),
--    this function clears the flag so the question leaves the "couldn't answer" list. It touches only
--    the unanswered flag, only for a message in a community the caller administers.
--
-- 2. community_identity_guard: "admins update community" lets a community administrator update their
--    community row (name, languages, settings). The slug, status and custom domain decide how the
--    community is reached, so only platform administrators may change them.

-- ---------------------------------------------------------------------------
-- 1. Unanswered assistant questions
-- ---------------------------------------------------------------------------
create or replace function public.resolve_unanswered_question(c uuid, m uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(c) then
    return false;
  end if;
  update public.assistant_messages
     set unanswered = false
   where id = m and community_id = c and unanswered;
  return found;
end $$;
revoke execute on function public.resolve_unanswered_question(uuid, uuid) from public, anon;
grant execute on function public.resolve_unanswered_question(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Community identity is managed by the platform
-- ---------------------------------------------------------------------------
create or replace function public.community_identity_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() and (
       new.id is distinct from old.id
       or new.slug is distinct from old.slug
       or new.status is distinct from old.status
       or new.custom_domain is distinct from old.custom_domain
     ) then
    raise exception 'Only the platform team can change the web address or status of a community';
  end if;
  return new;
end $$;

drop trigger if exists community_identity_guard on public.communities;
create trigger community_identity_guard
before update on public.communities
for each row execute function public.community_identity_guard();
