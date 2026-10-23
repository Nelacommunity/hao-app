-- Hao: profiles, saved places and self-service account deletion.

-- ─── Profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  language_code text not null default 'en' check (char_length(language_code) <= 64),
  language_name text not null default 'English' check (char_length(language_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per user, created automatically on sign-up.';

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Only the editable columns can be changed from the app.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, language_code, language_name) on public.profiles to authenticated;

-- Keep updated_at fresh.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create the profile from sign-up metadata (display_name, language_code, language_name).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, language_code, language_name)
  values (
    new.id,
    nullif(left(new.raw_user_meta_data ->> 'display_name', 80), ''),
    coalesce(nullif(left(new.raw_user_meta_data ->> 'language_code', 64), ''), 'en'),
    coalesce(nullif(left(new.raw_user_meta_data ->> 'language_name', 80), ''), 'English')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Saved places ────────────────────────────────────────────────────────────
create table public.saved_places (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  place_id text not null check (char_length(place_id) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

comment on table public.saved_places is 'Places a user has bookmarked. place_id matches src/data/places.ts.';

alter table public.saved_places enable row level security;

create policy "Users can read their saved places"
  on public.saved_places for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can save places"
  on public.saved_places for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can remove saved places"
  on public.saved_places for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.saved_places from anon, authenticated;
grant select, insert, delete on public.saved_places to authenticated;

-- ─── Account deletion (required by the App Store and Google Play) ────────────
create function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  -- Cascades to profiles and saved_places.
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
