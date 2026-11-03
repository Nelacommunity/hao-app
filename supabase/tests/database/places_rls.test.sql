-- Privacy of places memory: run with `npx supabase test db` against the local stack.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Two users. The sign-up trigger creates their profiles.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-00000000000a', 'amani@example.test', '{"nationality": "TZ", "share_visits": true}'),
  ('b0000000-0000-4000-8000-00000000000b', 'boris@example.test', '{"nationality": "RU", "share_visits": true}');

insert into public.places (id, amap_poi_id, name, name_zh, category, lat, lng)
values ('c0000000-0000-4000-8000-00000000000c', 'B000TEST01', '[PLACE NAME]', '[地点]', 'food', 39.9, 116.4);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end;
$$;

-- ─── Amani logs and confirms a visit ─────────────────────────────────────────
select pg_temp.act_as('a0000000-0000-4000-8000-00000000000a');

select lives_ok(
  $$ insert into public.visits (place_id, source, status, rating) values ('c0000000-0000-4000-8000-00000000000c', 'manual', 'confirmed', 1) $$,
  'a user can add their own visit'
);
select is((select count(*)::int from public.visits), 1, 'a user sees their own visit');
select is((select nationality from public.profiles), 'TZ', 'onboarding nationality is saved at sign-up');

-- ─── Boris cannot see or touch it ────────────────────────────────────────────
select pg_temp.act_as('b0000000-0000-4000-8000-00000000000b');

select is((select count(*)::int from public.visits), 0, 'another user''s visits are invisible');
select is(
  (select count(*)::int from public.visits where user_id = 'a0000000-0000-4000-8000-00000000000a'),
  0,
  'filtering by another user id returns nothing'
);
select is(
  (with changed as (update public.visits set rating = -1 where true returning 1) select count(*)::int from changed),
  0,
  'another user''s visits cannot be updated'
);
select is(
  (with removed as (delete from public.visits where true returning 1) select count(*)::int from removed),
  0,
  'another user''s visits cannot be deleted'
);
select throws_ok(
  $$ insert into public.visits (user_id, place_id, source) values ('a0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000c', 'manual') $$,
  '42501',
  null,
  'a visit cannot be created for someone else'
);
select is((select count(*)::int from public.profiles), 1, 'only their own profile is visible');
select is(
  (select count(*)::int from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a'),
  0,
  'another user''s profile is invisible'
);
select is(
  (select count(*)::int from public.saved_places where user_id = 'a0000000-0000-4000-8000-00000000000a'),
  0,
  'another user''s saved places are invisible'
);

-- ─── Raw stats are closed to every client ────────────────────────────────────
select throws_ok('select * from public.place_country_stats', '42501', null, 'place_country_stats is not readable');
select throws_ok('select * from public.region_stats', '42501', null, 'region_stats is not readable');
select throws_ok('select * from public.seeded_likes', '42501', null, 'seeded_likes is not readable');
select throws_ok(
  $$ insert into public.seeded_likes (place_id, nationality, likes) values ('c0000000-0000-4000-8000-00000000000c', 'RU', 999) $$,
  '42501',
  null,
  'seeded_likes cannot be written'
);
select throws_ok(
  $$ select public.recompute_place_stats('c0000000-0000-4000-8000-00000000000c') $$,
  '42501',
  null,
  'recompute cannot be called by clients'
);
select throws_ok(
  $$ insert into public.places (name, category, lat, lng) values ('x', 'food', 1, 1) $$,
  '42501',
  null,
  'places cannot be written by clients'
);

-- One TZ visitor is below the minimum group size, so nothing comes back.
select is(
  (select count(*)::int from public.get_place_social_proof(array['c0000000-0000-4000-8000-00000000000c']::uuid[], 'TZ')),
  0,
  'social proof hides groups smaller than 5'
);

-- The function's result has no column that could identify a person.
reset role;
select is(
  (select array_agg(p order by p) from unnest((select proargnames from pg_proc where proname = 'get_place_social_proof')) p
   where p in ('user_id', 'id', 'email', 'display_name')),
  null,
  'get_place_social_proof returns no user identifiers'
);

select * from finish();
rollback;
