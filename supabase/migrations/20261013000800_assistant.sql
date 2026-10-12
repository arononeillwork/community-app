-- Ask: the community assistant.
--
-- 1. assistant_messages.meta: an answer is more than text. It carries the sources it was built
--    from (links to /info, /meetings/<id>, /documents/<id>…), the contacts it found (rendered as
--    Call / WhatsApp / Email buttons) and, for "report a leak in …", the pending report the
--    resident still has to confirm. Stored as jsonb next to the plain-text answer, which stays
--    readable on its own (history, WhatsApp, the admin's unanswered list).
--
-- 2. Tighter "own messages" policy: a message must belong to the caller's conversation *in the
--    same community*. Without this a resident could file a message under another community's id
--    and it would show up in that community's "questions the assistant couldn't answer" list.
--
-- 3. pending_actions: rows can only be created in a community the caller belongs to.
--
-- 4. ai_usage: the assistant logs each Claude call (model, tokens, cost) as the signed-in user.
--    Members may insert their own usage rows only; nobody but administrators can read them, and
--    nobody can change or delete them.

-- ---------------------------------------------------------------------------
-- 1. Structured answers
-- ---------------------------------------------------------------------------
alter table public.assistant_messages
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table public.assistant_messages
  drop constraint if exists assistant_messages_meta_size;
alter table public.assistant_messages
  add constraint assistant_messages_meta_size check (pg_column_size(meta) <= 65536);

create index if not exists assistant_conversations_owner_idx
  on public.assistant_conversations (profile_id, community_id, created_at desc);
create index if not exists assistant_messages_conversation_idx
  on public.assistant_messages (conversation_id, created_at);
create index if not exists pending_actions_owner_idx
  on public.pending_actions (profile_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Messages stay inside their conversation's community
-- ---------------------------------------------------------------------------
drop policy if exists "own messages" on public.assistant_messages;
create policy "own messages" on public.assistant_messages for all using (
  exists (select 1 from public.assistant_conversations c
          where c.id = conversation_id and c.profile_id = auth.uid())
) with check (
  exists (select 1 from public.assistant_conversations c
          where c.id = conversation_id and c.profile_id = auth.uid()
            and c.community_id = assistant_messages.community_id)
);

-- ---------------------------------------------------------------------------
-- 3. Pending actions only in your own community
-- ---------------------------------------------------------------------------
drop policy if exists "own pending actions" on public.pending_actions;
create policy "own pending actions" on public.pending_actions for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and public.is_member(community_id));

-- ---------------------------------------------------------------------------
-- 4. Usage logging
-- ---------------------------------------------------------------------------
drop policy if exists "members log own usage" on public.ai_usage;
create policy "members log own usage" on public.ai_usage for insert with check (
  profile_id = auth.uid()
  and public.is_member(community_id)
  and kind = 'llm'
  and coalesce(input_tokens, 0) >= 0
  and coalesce(output_tokens, 0) >= 0
  and cost_cents >= 0
);
