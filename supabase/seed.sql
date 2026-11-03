-- Local demo data, loaded by `npx supabase db reset` (never by `db push`, so it doesn't reach production).
-- Two test users asking "food near me" from the same spot get different top picks and reason lines:
--   demo-tz@hao.test / hao-demo-pass  (Tanzania, East Africa)
--   demo-ru@hao.test / hao-demo-pass  (Russia, Eastern Europe)
-- Run `npm run demo:ranking` afterwards to see it.

-- ─── Users (the sign-up trigger creates their profiles from the metadata) ────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'demo-tz@hao.test',
   extensions.crypt('hao-demo-pass', extensions.gen_salt('bf')), now(), '{"provider": "email", "providers": ["email"]}',
   '{"display_name": "Amani", "nationality": "TZ", "share_visits": true}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'demo-ru@hao.test',
   extensions.crypt('hao-demo-pass', extensions.gen_salt('bf')), now(), '{"provider": "email", "providers": ["email"]}',
   '{"display_name": "Boris", "nationality": "RU", "share_visits": true}', now(), now());

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email', json_build_object('sub', id::text, 'email', email)::jsonb, now(), now(), now()
from auth.users
where email in ('demo-tz@hao.test', 'demo-ru@hao.test');

-- Empty-string token columns: GoTrue can't read NULLs there when signing in.
update auth.users
set confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = ''
where email in ('demo-tz@hao.test', 'demo-ru@hao.test');

update public.profiles set city = 'Beijing', preferences = '{"diet": [], "allergies": [], "spice": "medium", "budget": "medium"}'
where id in ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000002');

-- ─── Five placeholder restaurants around one spot in Beijing (GCJ-02) ───────
-- Placeholders, not real places: the same shapes the ranking unit tests use (shared/places/ranking.test.ts).
insert into public.places (id, amap_poi_id, name, name_zh, category, lat, lng, address, tags, amap_rating, source) values
  ('7b000000-0000-4000-8000-000000000001', 'B000000001', '[PLACE NAME] Halal beef noodles', '[PLACE NAME] 清真牛肉面', 'food', 39.9087, 116.3975, '[ADDRESS]', '{牛肉面,拉条子}', 4.1, 'seeded'),
  ('7b000000-0000-4000-8000-000000000002', 'B000000002', '[PLACE NAME] Barbecue', '[PLACE NAME] 烤肉', 'food', 39.9090, 116.3980, '[ADDRESS]', '{烤五花肉}', 4.7, 'seeded'),
  ('7b000000-0000-4000-8000-000000000003', 'B000000003', '[PLACE NAME] Seafood', '[PLACE NAME] 海鲜大排档', 'food', 39.9080, 116.3990, '[ADDRESS]', '{小龙虾}', 4.6, 'seeded'),
  ('7b000000-0000-4000-8000-000000000004', 'B000000004', '[PLACE NAME] Dumplings', '[PLACE NAME] 饺子馆', 'food', 39.9095, 116.3970, '[ADDRESS]', '{}', 4.0, 'seeded'),
  ('7b000000-0000-4000-8000-000000000005', 'B000000005', '[PLACE NAME] Russian restaurant', '[PLACE NAME] 俄式西餐', 'food', 39.9085, 116.3965, '[ADDRESS]', '{罗宋汤}', 4.2, 'seeded');

-- ─── Survey likes (the trigger fills place_country_stats and region_stats) ───
insert into public.seeded_likes (place_id, nationality, likes) values
  ('7b000000-0000-4000-8000-000000000001', 'TZ', 21),
  ('7b000000-0000-4000-8000-000000000001', 'KE', 14),
  ('7b000000-0000-4000-8000-000000000001', 'RU', 3),   -- below MIN_GROUP_SIZE: never shown to anyone
  ('7b000000-0000-4000-8000-000000000005', 'RU', 16),
  ('7b000000-0000-4000-8000-000000000005', 'UA', 10),
  ('7b000000-0000-4000-8000-000000000005', 'TZ', 2);   -- below MIN_GROUP_SIZE
