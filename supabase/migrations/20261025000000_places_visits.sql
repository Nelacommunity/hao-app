-- Places memory: the places each user actually visited ("My Places", "My Food") and the "Want to go" list.
-- Food preferences (diet, allergies, spice, budget) already live in profiles.preferences.

-- ─── Profile: where the user is from, and whether their visits help others ───
alter table public.profiles
  add column nationality text check (nationality ~ '^[A-Z]{2}$'),
  add column home_city text check (char_length(home_city) <= 80),
  add column university text check (char_length(university) <= 120),
  add column city text check (char_length(city) <= 80),
  -- Off by default: visits count towards community stats only after the user opts in.
  add column share_visits boolean not null default false;

comment on column public.profiles.nationality is 'ISO 3166-1 alpha-2 code, e.g. TZ. Used for "liked by people from your country".';
comment on column public.profiles.share_visits is 'Count my confirmed visits, anonymously, in place_country_stats / region_stats.';

grant update (nationality, home_city, university, city, share_visits) on public.profiles to authenticated;

-- Sign-up can also carry the nationality and sharing choice made during onboarding.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nat text := upper(nullif(new.raw_user_meta_data ->> 'nationality', ''));
begin
  insert into public.profiles (id, display_name, language_code, language_name, nationality, share_visits)
  values (
    new.id,
    nullif(left(new.raw_user_meta_data ->> 'display_name', 80), ''),
    coalesce(nullif(left(new.raw_user_meta_data ->> 'language_code', 64), ''), 'en'),
    coalesce(nullif(left(new.raw_user_meta_data ->> 'language_name', 80), ''), 'English'),
    case when nat ~ '^[A-Z]{2}$' then nat end,
    -- Compared as text so odd metadata can never make sign-up fail.
    coalesce(new.raw_user_meta_data ->> 'share_visits', '') = 'true'
  );
  return new;
end;
$$;

-- ─── Places: every AMap POI (or surveyed place) Hao has shown or someone visited ───
create table public.places (
  id uuid primary key default gen_random_uuid(),
  -- Seeded places found only by address may not have one yet.
  amap_poi_id text unique check (amap_poi_id ~ '^B[0-9A-Z]{9}$'),
  name text not null check (char_length(name) between 1 and 200),
  name_zh text not null default '' check (char_length(name_zh) <= 200),
  category text not null check (category in ('food', 'attraction', 'shop', 'service')),
  -- GCJ-02, like everything from AMap.
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  address text not null default '' check (char_length(address) <= 400),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  amap_rating numeric(2, 1) check (amap_rating between 0 and 5),
  source text not null default 'amap' check (source in ('amap', 'seeded')),
  created_at timestamptz not null default now()
);

comment on table public.places is 'Places known to Hao. Readable by signed-in users; written only by the API server and the seed script.';

alter table public.places enable row level security;

create policy "Signed-in users can read places"
  on public.places for select
  to authenticated
  using (true);

revoke all on public.places from anon, authenticated;
grant select on public.places to authenticated;

-- ─── Visits ──────────────────────────────────────────────────────────────────
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  visited_at timestamptz not null default now(),
  source text not null check (source in ('navigation', 'voice_room', 'chat', 'manual')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'dismissed')),
  rating smallint check (rating in (-1, 0, 1)),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  note text check (char_length(note) <= 1000),
  -- Object path in the private visit-photos bucket: <user id>/<file>.
  photo_path text check (char_length(photo_path) <= 300),
  -- When Hao asked "Did you go?" in chat, so it asks only once.
  prompted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.visits is 'Places a user went to. Only that user can read or change their visits; only confirmed ones count.';

-- One confirmed visit (and one open question) per user per place; repeat visits update that row.
create unique index visits_one_confirmed on public.visits (user_id, place_id) where status = 'confirmed';
create unique index visits_one_pending on public.visits (user_id, place_id) where status = 'pending';
create index visits_user_id on public.visits (user_id, visited_at desc);
create index visits_place_status on public.visits (place_id, status);

alter table public.visits enable row level security;

create policy "Users can read their visits"
  on public.visits for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add visits"
  on public.visits for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (photo_path is null or photo_path like (select auth.uid())::text || '/%')
  );

create policy "Users can update their visits"
  on public.visits for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (photo_path is null or photo_path like (select auth.uid())::text || '/%')
  );

create policy "Users can delete their visits"
  on public.visits for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.visits from anon, authenticated;
grant select, delete on public.visits to authenticated;
grant insert (place_id, visited_at, source, status, rating, tags, note, photo_path) on public.visits to authenticated;
grant update (visited_at, status, rating, tags, note, photo_path, prompted_at) on public.visits to authenticated;

create trigger visits_set_updated_at
  before update on public.visits
  for each row execute function public.set_updated_at();

-- Answers "Did you go? Did you like it?". If the user already has a confirmed visit to the place,
-- that one is updated (latest date and rating, tags merged) and the question is removed.
-- Security invoker: row-level security limits it to the caller's own visits.
create function public.confirm_visit(visit_id uuid, visit_rating smallint default null, visit_tags text[] default '{}')
returns public.visits
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.visits;
  existing public.visits;
  result public.visits;
begin
  select * into v from public.visits where id = visit_id for update;
  if not found then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  select * into existing
  from public.visits
  where user_id = v.user_id and place_id = v.place_id and status = 'confirmed' and id <> v.id
  for update;

  if found then
    update public.visits set
      visited_at = greatest(existing.visited_at, v.visited_at),
      rating = coalesce(visit_rating, existing.rating),
      tags = (select coalesce(array_agg(distinct t), '{}') from unnest(existing.tags || coalesce(visit_tags, '{}')) t)[1:10],
      note = coalesce(v.note, existing.note),
      photo_path = coalesce(v.photo_path, existing.photo_path)
    where id = existing.id
    returning * into result;
    delete from public.visits where id = v.id;
  else
    update public.visits set
      status = 'confirmed',
      rating = coalesce(visit_rating, v.rating),
      tags = (select coalesce(array_agg(distinct t), '{}') from unnest(v.tags || coalesce(visit_tags, '{}')) t)[1:10]
    where id = v.id
    returning * into result;
  end if;
  return result;
end;
$$;

revoke execute on function public.confirm_visit(uuid, smallint, text[]) from public, anon;
grant execute on function public.confirm_visit(uuid, smallint, text[]) to authenticated;

-- ─── "Want to go": saved_places already holds it (keyed by AMap POI id) ─────
comment on table public.saved_places is 'The user''s "Want to go" list. place_id is the AMap POI id (places.amap_poi_id).';

-- ─── Visit photos: private bucket, each user only touches <their id>/… ──────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visit-photos', 'visit-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "Users can read their visit photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can upload their visit photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can replace their visit photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can delete their visit photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ─── Chats: the new Places mode is saved like the others ────────────────────
alter table public.chats drop constraint chats_mode_check;
alter table public.chats add constraint chats_mode_check check (mode in ('interpret', 'guide', 'memory', 'places'));
