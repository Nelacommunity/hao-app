-- Community stats: only confirmed visits of people who opted in count, and only groups of 5+ show.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.places (id, amap_poi_id, name, category, lat, lng)
values ('d0000000-0000-4000-8000-00000000000d', 'B000TEST02', '[PLACE NAME]', 'food', 39.9, 116.4);

-- Six Tanzanians and one Kenyan who share, one Tanzanian who doesn't.
insert into auth.users (id, email, raw_user_meta_data)
select ('e0000000-0000-4000-8000-00000000000' || n)::uuid, 'tz' || n || '@example.test', '{"nationality": "TZ", "share_visits": true}'
from generate_series(1, 6) n;
insert into auth.users (id, email, raw_user_meta_data) values
  ('f0000000-0000-4000-8000-000000000001', 'ke@example.test', '{"nationality": "KE", "share_visits": true}'),
  ('f0000000-0000-4000-8000-000000000002', 'private@example.test', '{"nationality": "TZ", "share_visits": false}');

-- Four sharing Tanzanians liked it, one private one too.
insert into public.visits (user_id, place_id, source, status, rating)
select ('e0000000-0000-4000-8000-00000000000' || n)::uuid, 'd0000000-0000-4000-8000-00000000000d', 'manual', 'confirmed', 1
from generate_series(1, 4) n;
insert into public.visits (user_id, place_id, source, status, rating)
values ('f0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-00000000000d', 'manual', 'confirmed', 1);

select is(
  (select visitor_count from public.place_country_stats where place_id = 'd0000000-0000-4000-8000-00000000000d' and nationality = 'TZ'),
  4,
  'the trigger counts sharing users only'
);
select is(
  (select count(*)::int from public.get_place_social_proof(array['d0000000-0000-4000-8000-00000000000d']::uuid[], 'TZ') where scope = 'country'),
  0,
  '4 people are below MIN_GROUP_SIZE'
);

-- A pending visit does not count.
insert into public.visits (user_id, place_id, source, status)
values ('e0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-00000000000d', 'navigation', 'pending');
select is(
  (select visitor_count from public.place_country_stats where place_id = 'd0000000-0000-4000-8000-00000000000d' and nationality = 'TZ'),
  4,
  'pending visits do not count'
);

-- Confirming it (thumbs down) makes 5.
update public.visits set status = 'confirmed', rating = -1
where user_id = 'e0000000-0000-4000-8000-000000000005' and status = 'pending';
select results_eq(
  $$ select visitor_count, like_count, dislike_count from public.get_place_social_proof(array['d0000000-0000-4000-8000-00000000000d']::uuid[], 'TZ') where scope = 'country' $$,
  $$ values (5, 4, 1) $$,
  'a group of 5 is shown with its likes and dislikes'
);

-- A Kenyan visit adds to the East African region, not to Tanzania.
insert into public.visits (user_id, place_id, source, status, rating)
values ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000d', 'chat', 'confirmed', 1);
select results_eq(
  $$ select region, visitor_count from public.get_place_social_proof(array['d0000000-0000-4000-8000-00000000000d']::uuid[], 'KE') where scope = 'region' $$,
  $$ values ('east_africa'::text, 6) $$,
  'regions combine neighbouring countries'
);

-- Turning sharing off removes the user from the stats.
update public.profiles set share_visits = false where id = 'e0000000-0000-4000-8000-000000000001';
select is(
  (select visitor_count from public.place_country_stats where place_id = 'd0000000-0000-4000-8000-00000000000d' and nationality = 'TZ'),
  4,
  'opting out removes the user''s visits'
);

-- Deleting a visit removes it too.
delete from public.visits where user_id = 'e0000000-0000-4000-8000-000000000002' and place_id = 'd0000000-0000-4000-8000-00000000000d';
select is(
  (select visitor_count from public.place_country_stats where place_id = 'd0000000-0000-4000-8000-00000000000d' and nationality = 'TZ'),
  3,
  'deleted visits drop out of the stats'
);

-- Seeded survey likes count as liked visits.
insert into public.seeded_likes (place_id, nationality, likes) values ('d0000000-0000-4000-8000-00000000000d', 'TZ', 10);
select results_eq(
  $$ select visitor_count, like_count from public.place_country_stats where place_id = 'd0000000-0000-4000-8000-00000000000d' and nationality = 'TZ' $$,
  $$ values (13, 12) $$,
  'seeded likes are added to the counts'
);

-- The nightly full recompute agrees with the triggers.
create temp table before_recompute as select nationality, visitor_count, like_count, dislike_count from public.place_country_stats;
select public.recompute_all_place_stats();
select set_eq(
  'select nationality, visitor_count, like_count, dislike_count from public.place_country_stats',
  'select * from before_recompute',
  'the full recompute matches the incremental one'
);

-- confirm_visit: a second visit updates the confirmed one instead of adding a row.
insert into public.visits (user_id, place_id, source, status)
values ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-00000000000d', 'navigation', 'pending');
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub": "e0000000-0000-4000-8000-000000000003", "role": "authenticated"}', true);
select public.confirm_visit(
  (select id from public.visits where status = 'pending'),
  (-1)::smallint,
  array['cheap']
);
select results_eq(
  $$ select count(*)::int, min(rating)::int, bool_and('cheap' = any(tags)) from public.visits $$,
  $$ values (1, -1, true) $$,
  'a repeat visit keeps one confirmed row with the latest rating'
);

select * from finish();
rollback;
