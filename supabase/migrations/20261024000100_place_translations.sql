-- AMap places in each traveller language (beyond the Chinese and English AMap provides), translated
-- once by AI and shared by every user. Only the API server reads and writes it, with the secret key.
create table public.place_translations (
  place_id text not null check (place_id ~ '^B[0-9A-Z]{9}$'),
  lang text not null check (char_length(lang) between 2 and 80),
  name text not null check (char_length(name) <= 400),
  address text not null check (char_length(address) <= 800),
  type text not null check (char_length(type) <= 200),
  tags text[] not null default '{}',
  -- The English name it was translated from, so a renamed place is translated again.
  source_name text not null,
  updated_at timestamptz not null default now(),
  primary key (place_id, lang)
);

alter table public.place_translations enable row level security;

-- No policies: only the service role (API server) can read or write.
revoke all on public.place_translations from anon, authenticated;
