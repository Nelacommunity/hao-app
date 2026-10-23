-- Traveller food preferences the agent applies automatically (diet, allergies, spice, budget).
alter table public.profiles
  add column preferences jsonb not null default '{}'::jsonb
  check (jsonb_typeof(preferences) = 'object' and pg_column_size(preferences) < 4096);

comment on column public.profiles.preferences is
  'Shape: { diet: string[], allergies: string[], spice: none|mild|medium|hot, budget: low|medium|high, notes?: string }';

grant update (preferences) on public.profiles to authenticated;
