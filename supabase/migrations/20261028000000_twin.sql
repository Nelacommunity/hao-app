-- Digital twin ("Hao DNA"): what the user loves and wants to do, and whether they finished the
-- getting-to-know-you chat. Chats also capture these as the user mentions them ("I love this").
-- Diet, allergies, spice and budget stay in profiles.preferences; nationality, city and traveller_type
-- keep their columns. The twin chat (/api/twin) writes all of them as the signed-in user.
alter table public.profiles
  add column loves text[] not null default '{}' check (cardinality(loves) <= 20),
  add column wants text[] not null default '{}' check (cardinality(wants) <= 20),
  -- Written by the API when the user saves a QR-room conversation; not editable from the app.
  add column experiences text[] not null default '{}' check (cardinality(experiences) <= 30),
  add column twin_completed_at timestamptz;

comment on column public.profiles.loves is 'Foods, kinds of places and activities the user loves, in short English phrases.';
comment on column public.profiles.wants is 'Things the user wants to do, try or find ("try Peking duck"), in short English phrases.';
comment on column public.profiles.experiences is 'Titles of QR-room conversations the user saved ("Opening a bank card · 24 Oct"), newest last.';
comment on column public.profiles.twin_completed_at is 'When the user finished (or skipped) the twin chat after sign-up. Null: Hao asks on next open.';

grant update (loves, wants, twin_completed_at) on public.profiles to authenticated;

-- Saved QR-room conversations live with the other chats (read-only in the app; the user can delete them).
alter table public.chats drop constraint chats_mode_check;
alter table public.chats add constraint chats_mode_check check (mode in ('interpret', 'guide', 'memory', 'places', 'room'));

-- The API saves experiences as the signed-in user, so they need the grant; only the API writes them.
grant update (experiences) on public.profiles to authenticated;
