-- Saved conversations with Hao (interpreter, guide and memory chats), like a chat history.
-- Each user sees and changes only their own chats.
create table public.chats (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mode text not null check (mode in ('interpret', 'guide', 'memory')),
  title text not null default '' check (char_length(title) <= 120),
  -- The chat as the app shows it (messages, checklists, tools used); capped at ~500 kB.
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 512000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.chats is 'A user''s saved chats with Hao. Only that user can read or change them.';

create index chats_user_recent on public.chats (user_id, updated_at desc);

alter table public.chats enable row level security;

create policy "Users can read their chats"
  on public.chats for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add chats"
  on public.chats for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their chats"
  on public.chats for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their chats"
  on public.chats for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.chats from anon, authenticated;
grant select, insert, delete on public.chats to authenticated;
grant update (mode, title, data, updated_at) on public.chats to authenticated;

create trigger chats_set_updated_at
  before update on public.chats
  for each row execute function public.set_updated_at();
