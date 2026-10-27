-- Likes on Discover items (stories, AMap places, phrases), so everyone sees how many people liked each.
-- item_key: 'story:<uuid>', 'place:<AMap POI id>' or 'phrase:<Chinese text>'.
create table public.discover_likes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_key text not null check (item_key ~ '^(story|place|phrase):.{1,100}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

create index discover_likes_item_key_idx on public.discover_likes (item_key);

alter table public.discover_likes enable row level security;

create policy "Users can read their likes"
  on public.discover_likes for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can like"
  on public.discover_likes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can unlike"
  on public.discover_likes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.discover_likes from anon, authenticated;
grant select, delete on public.discover_likes to authenticated;
grant insert (item_key) on public.discover_likes to authenticated;

-- Like counts for up to 100 items. Counts only: who liked what stays private.
create function public.discover_like_counts(item_keys text[])
returns table (item_key text, likes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select l.item_key, count(*)::bigint
  from public.discover_likes l
  where l.item_key = any (item_keys[1:100])
  group by l.item_key
$$;

revoke all on function public.discover_like_counts(text[]) from public, anon;
grant execute on function public.discover_like_counts(text[]) to authenticated;
