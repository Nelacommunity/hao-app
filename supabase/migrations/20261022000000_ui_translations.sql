-- The app's UI text in each language, translated once by AI and shared by every user.
-- Anyone may read it (the app shows it before sign-in). Only the API server writes it, with the
-- secret key, and only for strings in the app's own catalog — so nobody can store their own text here.
create table public.ui_translations (
  lang text primary key check (char_length(lang) between 2 and 80),
  language_name text not null check (char_length(language_name) <= 80),
  -- Source English text → translation.
  strings jsonb not null default '{}'::jsonb,
  -- Catalog version the strings were completed for (shared/i18n/catalog.generated.ts).
  catalog_hash text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.ui_translations enable row level security;

create policy "UI translations are public"
  on public.ui_translations for select
  to anon, authenticated
  using (true);

-- No insert/update/delete policies: only the service role (API server) can write.
revoke insert, update, delete on public.ui_translations from anon, authenticated;
