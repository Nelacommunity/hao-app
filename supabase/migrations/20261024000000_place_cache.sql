-- Shared cache of AMap (高德) results, so a place or search is fetched from AMap once for everyone
-- instead of once per user — AMap keys have a daily quota and a per-second limit.
-- Only the API server reads and writes it, with the secret key.

-- One row per AMap POI, as the app's Place JSON (see src/data/places.ts).
create table public.place_cache (
  id text primary key check (id ~ '^B[0-9A-Z]{9}$'),
  place jsonb not null,
  fetched_at timestamptz not null default now()
);

-- One row per normalized search (nearby searches snapped to a grid; see src/lib/server/place-cache.ts):
-- the POI ids AMap returned, in order. The places themselves live in place_cache.
create table public.place_search_cache (
  key text primary key check (char_length(key) <= 400),
  ids text[] not null,
  fetched_at timestamptz not null default now()
);

create index place_cache_fetched_at_idx on public.place_cache (fetched_at);
create index place_search_cache_fetched_at_idx on public.place_search_cache (fetched_at);

alter table public.place_cache enable row level security;
alter table public.place_search_cache enable row level security;

-- No policies: only the service role (API server) can read or write.
revoke all on public.place_cache from anon, authenticated;
revoke all on public.place_search_cache from anon, authenticated;
