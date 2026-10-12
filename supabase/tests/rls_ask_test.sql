-- Ask (community assistant): access tests. Run with:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -q -f supabase/tests/rls_ask_test.sql
-- Each check raises an exception on failure; the script stops at the first failure. Everything rolls back.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
set client_min_messages = notice;

create or replace function pg_temp.login(p_email text) returns void language plpgsql as $$
declare uid uuid;
begin
  select id into uid from auth.users where email = p_email;
  if uid is null then raise exception 'no user %', p_email; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok  - %', msg;
end $$;

-- ---------------------------------------------------------------- conversations and messages
begin;
select pg_temp.login('tenant1@oceanagardens.test');
insert into assistant_conversations (community_id, profile_id, channel)
values ('0cea0a00-0000-4000-8000-000000000001', auth.uid(), 'chat');
select set_config('test.conv', (select id::text from assistant_conversations where profile_id = auth.uid() order by created_at desc limit 1), true) is not null as prepared \gset
insert into assistant_messages (community_id, conversation_id, role, content)
values ('0cea0a00-0000-4000-8000-000000000001', current_setting('test.conv')::uuid, 'user', 'When is glass collected?');
insert into assistant_messages (community_id, conversation_id, role, content, meta)
values ('0cea0a00-0000-4000-8000-000000000001', current_setting('test.conv')::uuid, 'assistant', 'Glass is collected on Thursday.',
        '{"engine": "retrieval", "sources": [{"kind": "bins", "label": "Bin days", "href": "/info"}]}');
select pg_temp.check((select count(*) from assistant_messages where conversation_id = current_setting('test.conv')::uuid) = 2,
  'resident can write and read messages in their own conversation');
select pg_temp.check((select meta->>'engine' from assistant_messages where conversation_id = current_setting('test.conv')::uuid and role = 'assistant') = 'retrieval',
  'answers keep their structured meta (sources, contacts, drafts)');
select pg_temp.check((select meta from assistant_messages where conversation_id = current_setting('test.conv')::uuid and role = 'user') = '{}'::jsonb,
  'meta defaults to an empty object');

-- A message cannot be filed under another community (it would appear on that community's admin list).
do $$ begin
  insert into assistant_messages (community_id, conversation_id, role, content, unanswered)
  values ('de300000-0000-4000-8000-000000000002', current_setting('test.conv')::uuid, 'user', 'Planted question', true);
  raise exception 'FAIL: message filed under another community';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'a message must stay in its conversation''s community');

do $$ begin
  update assistant_messages set community_id = 'de300000-0000-4000-8000-000000000002'
  where conversation_id = current_setting('test.conv')::uuid;
  raise exception 'FAIL: message moved to another community';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'a message cannot be moved to another community');

-- Nobody can start a conversation in a community they don't belong to.
do $$ begin
  insert into assistant_conversations (community_id, profile_id) values ('de300000-0000-4000-8000-000000000002', auth.uid());
  raise exception 'FAIL: conversation in a foreign community';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'resident cannot start a conversation in another community');

select pg_temp.check((select count(*) from assistant_conversations where profile_id <> auth.uid()) = 0,
  'resident sees only their own conversations');
select pg_temp.check((select count(*) from assistant_messages m join assistant_conversations c on c.id = m.conversation_id where c.profile_id <> auth.uid()) = 0,
  'resident cannot read other people''s questions (not even unanswered ones)');
rollback;

-- Another resident cannot read or add to tenant1's conversation.
begin;
select pg_temp.login('tenant1@oceanagardens.test');
insert into assistant_conversations (community_id, profile_id) values ('0cea0a00-0000-4000-8000-000000000001', auth.uid());
select set_config('test.conv', (select id::text from assistant_conversations where profile_id = auth.uid() order by created_at desc limit 1), true) is not null as prepared \gset
reset role;
select pg_temp.login('tenant3@oceanagardens.test');
select pg_temp.check((select count(*) from assistant_conversations where id = current_setting('test.conv')::uuid) = 0, 'tenant3 cannot see tenant1''s conversation');
do $$ begin
  insert into assistant_messages (community_id, conversation_id, role, content)
  values ('0cea0a00-0000-4000-8000-000000000001', current_setting('test.conv')::uuid, 'assistant', 'Injected answer');
  raise exception 'FAIL: wrote into someone else''s conversation';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'tenant3 cannot write into tenant1''s conversation');
rollback;

-- ---------------------------------------------------------------- unanswered questions
begin;
select pg_temp.login('admin@oceanagardens.test');
select pg_temp.check((select count(*) from assistant_messages where unanswered and role = 'user') >= 1, 'administrator reads unanswered questions');
select pg_temp.check((select count(*) from assistant_messages where not unanswered and conversation_id not in
  (select id from assistant_conversations where profile_id = auth.uid())) = 0, 'administrator cannot read residents'' other messages');
rollback;

begin;
select pg_temp.login('admin@demoheights.test');
select pg_temp.check((select count(*) from assistant_messages where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0,
  'another community''s administrator reads no Oceana questions');
select pg_temp.check((select count(*) from faq_entries where community_id = '0cea0a00-0000-4000-8000-000000000001') = 0,
  'another community''s administrator reads no Oceana FAQ');
select pg_temp.check((select count(*) from pending_actions) = 0, 'another community''s administrator sees no drafts');
rollback;

-- ---------------------------------------------------------------- drafted reports (pending_actions)
begin;
select pg_temp.login('tenant1@oceanagardens.test');
insert into pending_actions (community_id, profile_id, action_type, payload)
values ('0cea0a00-0000-4000-8000-000000000001', auth.uid(), 'create_complaint',
        '{"kind": "incident", "title": "Leak in the Block B stairs", "description": "Water on the stairs", "location": "Block B stairs", "category": "Maintenance", "urgent": true}');
select set_config('test.pa', (select id::text from pending_actions where profile_id = auth.uid() order by created_at desc limit 1), true) is not null as prepared \gset
select pg_temp.check((select status from pending_actions where id = current_setting('test.pa')::uuid) = 'pending', 'resident can draft a report');
select pg_temp.check((select count(*) from complaints where title = 'Leak in the Block B stairs' and description = 'Water on the stairs') = 0,
  'a draft creates no report');

do $$ begin
  insert into pending_actions (community_id, profile_id, action_type, payload)
  values ('de300000-0000-4000-8000-000000000002', auth.uid(), 'create_complaint', '{}');
  raise exception 'FAIL: draft in a foreign community';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'resident cannot draft in another community');

do $$ begin
  insert into pending_actions (community_id, profile_id, action_type, payload)
  values ('0cea0a00-0000-4000-8000-000000000001', (select id from profiles where email = 'tenant3@oceanagardens.test'), 'create_complaint', '{}');
  raise exception 'FAIL: draft for someone else';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'resident cannot draft on someone else''s behalf');

reset role;
select pg_temp.login('tenant3@oceanagardens.test');
select pg_temp.check((select count(*) from pending_actions where id = current_setting('test.pa')::uuid) = 0, 'tenant3 cannot see tenant1''s draft');
update pending_actions set status = 'confirmed' where id = current_setting('test.pa')::uuid;
reset role;
select pg_temp.login('admin@oceanagardens.test');
select pg_temp.check((select count(*) from pending_actions where id = current_setting('test.pa')::uuid) = 0, 'not even the administrator sees a resident''s draft');
reset role;
select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select status from pending_actions where id = current_setting('test.pa')::uuid) = 'pending', 'tenant3 could not confirm tenant1''s draft');

-- Claiming a draft is a conditional update: the second claim finds nothing.
do $$ declare n int; begin
  update pending_actions set status = 'confirmed' where id = current_setting('test.pa')::uuid and status = 'pending';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: first confirmation did not claim the draft'; end if;
  update pending_actions set status = 'confirmed' where id = current_setting('test.pa')::uuid and status = 'pending';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: second confirmation claimed the draft again'; end if;
end $$;
select pg_temp.check(true, 'a draft can be claimed once only (no duplicate report on a double click)');
rollback;

-- ---------------------------------------------------------------- usage logging
begin;
select pg_temp.login('tenant1@oceanagardens.test');
insert into ai_usage (community_id, profile_id, kind, model, input_tokens, output_tokens, cost_cents)
values ('0cea0a00-0000-4000-8000-000000000001', auth.uid(), 'llm', 'claude-opus-5-5', 1800, 120, 0.96);
select pg_temp.check(true, 'resident''s assistant call can log its own usage');
select pg_temp.check((select count(*) from ai_usage) = 0, 'residents cannot read usage, not even their own');

do $$ begin
  insert into ai_usage (community_id, profile_id, kind, model, input_tokens, output_tokens)
  values ('0cea0a00-0000-4000-8000-000000000001', (select id from profiles where email = 'tenant3@oceanagardens.test'), 'llm', 'x', 1, 1);
  raise exception 'FAIL: usage logged for someone else';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'usage cannot be logged against someone else');

do $$ begin
  insert into ai_usage (community_id, profile_id, kind, model, input_tokens, output_tokens)
  values ('0cea0a00-0000-4000-8000-000000000001', auth.uid(), 'llm', 'x', -50, 1);
  raise exception 'FAIL: negative usage accepted';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'negative token counts are refused');

do $$ begin
  insert into ai_usage (community_id, profile_id, kind, model) values ('de300000-0000-4000-8000-000000000002', auth.uid(), 'llm', 'x');
  raise exception 'FAIL: usage logged in a foreign community';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'usage cannot be logged in another community');

reset role;
select pg_temp.login('admin@oceanagardens.test');
select pg_temp.check((select count(*) from ai_usage where model = 'claude-opus-5-5' and input_tokens = 1800) = 1, 'administrator reads the community''s usage');
update ai_usage set cost_cents = 0 where model = 'claude-opus-5-5' and input_tokens = 1800;
delete from ai_usage where model = 'claude-opus-5-5' and input_tokens = 1800;
select pg_temp.check((select cost_cents from ai_usage where model = 'claude-opus-5-5' and input_tokens = 1800) = 0.96, 'usage rows cannot be changed or deleted');
rollback;

-- ---------------------------------------------------------------- what the assistant can look up as a tenant
begin;
select pg_temp.login('tenant1@oceanagardens.test');
select pg_temp.check((select count(*) from faq_entries) >= 12, 'residents read the community FAQ');
do $$ begin
  insert into faq_entries (community_id, question, answer) values ('0cea0a00-0000-4000-8000-000000000001', 'Q?', 'A.');
  raise exception 'FAIL: resident wrote an FAQ entry';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'residents cannot write FAQ entries');
select pg_temp.check((select count(*) from key_contacts where building_id is not null) = 1
  and (select role_title from key_contacts where building_id is not null) = 'Block B representative',
  'tenant1 (Block B) only finds the Block B representative');
select pg_temp.check((select count(*) from block_directory('0cea0a00-0000-4000-8000-000000000001') where building_name <> 'Block B') = 0,
  'neighbour lookups stay inside tenant1''s block');
select pg_temp.check((select count(*) from v_contract_key_dates) = 0, 'contract notice dates (finance tool) return nothing for a tenant');
select pg_temp.check((select count(*) from v_supplier_spend) = 0, 'supplier spend (finance tool) returns nothing for a tenant');
select pg_temp.check((select count(*) from complaints where reporter_id <> auth.uid()) = 0, 'report statistics only cover the tenant''s own reports');
rollback;

\echo 'All assistant RLS tests passed'
