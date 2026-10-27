-- Contact details the traveller can share in a QR-room conversation when someone asks for them
-- ("can I have your number?"). They are never sent to the AI: the app asks the traveller first and
-- only then shows them to the other person. WeChat comes later.
alter table public.profiles
  add column contact_phone text check (char_length(contact_phone) <= 32),
  add column contact_email text check (char_length(contact_email) <= 254);

comment on column public.profiles.contact_phone is 'Phone number the user can choose to share in a conversation. Never sent to the AI.';
comment on column public.profiles.contact_email is 'Email the user can choose to share in a conversation (may differ from the sign-in email). Never sent to the AI.';

grant update (contact_phone, contact_email) on public.profiles to authenticated;
