-- Audit log page: filter by person, and page through the whole log on the server.
--
-- audit_log_actors(c): everyone who appears in a community's audit log (null = changes made by the system),
-- for the "Who" filter. It includes people who have since left a finance role, so their changes stay findable.
-- security invoker: the "finance read audit" policy still applies, so only that community's finance users get rows.

create or replace function public.audit_log_actors(c uuid)
returns table (actor uuid)
language sql stable security invoker set search_path = '' as $$
  select distinct a.actor from public.audit_log a where a.community_id = c;
$$;

revoke execute on function public.audit_log_actors(uuid) from public, anon;
grant execute on function public.audit_log_actors(uuid) to authenticated;

-- Filters on the Audit log page (area, person) within a community, newest first.
create index if not exists audit_log_community_table_at_idx on public.audit_log (community_id, table_name, at desc);
create index if not exists audit_log_community_actor_at_idx on public.audit_log (community_id, actor, at desc);
