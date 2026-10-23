-- Hao's long-term memory: what locals told the user, facts about the user, places and plans.

alter table public.profiles add column memory_enabled boolean not null default true;
grant update (memory_enabled) on public.profiles to authenticated;

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('said', 'fact', 'preference', 'place', 'plan', 'note')),
  content text not null check (char_length(content) between 1 and 1000),
  source text not null default 'manual' check (source in ('interpret', 'guide', 'memory', 'manual')),
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- 'simple' keeps every language's words as-is (no English-only stemming).
  search tsvector generated always as (to_tsvector('simple', content)) stored
);

comment on table public.memories is 'Things Hao remembers for one user. Only that user can read or delete them.';

create index memories_user_recent on public.memories (user_id, happened_at desc);
create index memories_search on public.memories using gin (search);

alter table public.memories enable row level security;

create policy "Users can read their memories"
  on public.memories for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add memories"
  on public.memories for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their memories"
  on public.memories for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.memories from anon, authenticated;
grant select, insert, delete on public.memories to authenticated;

-- Ranked full-text search over the caller's own memories (RLS applies: security invoker).
create function public.search_memories(q text, max_results int default 20)
returns setof public.memories
language sql
stable
security invoker
set search_path = ''
as $$
  select m.*
  from public.memories m
  where m.search @@ websearch_to_tsquery('simple', q)
  order by ts_rank(m.search, websearch_to_tsquery('simple', q)) desc, m.happened_at desc
  limit least(greatest(max_results, 1), 50);
$$;

revoke execute on function public.search_memories(text, int) from public, anon;
grant execute on function public.search_memories(text, int) to authenticated;
