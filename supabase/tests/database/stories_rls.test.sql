-- Discover stories privacy: run with `npx supabase test db` against the local stack.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'amani@example.test', '{"nationality": "TZ"}'),
  ('b1000000-0000-4000-8000-00000000000b', 'boris@example.test', '{"nationality": "RU"}');

-- Written as the service role would: one live story, a draft, a rejected one and an expired one.
insert into public.stories (id, type, title, slides, action, status, valid_from, valid_until) values
  ('51000000-0000-4000-8000-000000000001', 'etiquette_tip', '[PLACEHOLDER] live',
   '[{"heading":"[PLACEHOLDER]","body":"[PLACEHOLDER]","image_url":null,"image_kind":"none"},{"heading":"[PLACEHOLDER]","body":"[PLACEHOLDER]","image_url":null,"image_kind":"none"},{"heading":"[PLACEHOLDER]","body":"[PLACEHOLDER]","image_url":null,"image_kind":"none"}]',
   '{"kind":"ask_more","label":"Ask Hao more","payload":{}}', 'approved', now() - interval '1 hour', now() + interval '1 day'),
  ('51000000-0000-4000-8000-000000000002', 'culture_moment', '[PLACEHOLDER] draft',
   '[{"heading":"[PLACEHOLDER]","body":"[PLACEHOLDER]","image_url":null,"image_kind":"none"},{"heading":"[PLACEHOLDER]","body":"[PLACEHOLDER]","image_url":null,"image_kind":"none"},{"heading":"[PLACEHOLDER]","body":"[PLACEHOLDER]","image_url":null,"image_kind":"none"}]',
   '{"kind":"ask_more","label":"Ask Hao more","payload":{}}', 'draft', now() - interval '1 hour', null),
  ('51000000-0000-4000-8000-000000000003', 'culture_moment', '[PLACEHOLDER] rejected',
   '[{"heading":"[PLACEHOLDER]","body":"[PLACEHOLDER]","image_url":null,"image_kind":"none"},{"heading":"[PLACEHOLDER]","body":"[PLACEHOLDER]","image_url":null,"image_kind":"none"},{"heading":"[PLACEHOLDER]","body":"[PLACEHOLDER]","image_url":null,"image_kind":"none"}]',
   '{"kind":"ask_more","label":"Ask Hao more","payload":{}}', 'rejected', now() - interval '1 hour', null),
  ('51000000-0000-4000-8000-000000000004', 'season_tip', '[PLACEHOLDER] past',
   '[{"heading":"[PLACEHOLDER]","body":"[PLACEHOLDER]","image_url":null,"image_kind":"none"},{"heading":"[PLACEHOLDER]","body":"[PLACEHOLDER]","image_url":null,"image_kind":"none"},{"heading":"[PLACEHOLDER]","body":"[PLACEHOLDER]","image_url":null,"image_kind":"none"}]',
   '{"kind":"ask_more","label":"Ask Hao more","payload":{}}', 'approved', now() - interval '3 days', now() - interval '1 day'),
  ('51000000-0000-4000-8000-000000000005', 'coming_up', '[PLACEHOLDER] future',
   '[{"heading":"[PLACEHOLDER]","body":"[PLACEHOLDER]","image_url":null,"image_kind":"none"},{"heading":"[PLACEHOLDER]","body":"[PLACEHOLDER]","image_url":null,"image_kind":"none"},{"heading":"[PLACEHOLDER]","body":"[PLACEHOLDER]","image_url":null,"image_kind":"none"}]',
   '{"kind":"ask_more","label":"Ask Hao more","payload":{}}', 'approved', now() + interval '1 day', null);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end;
$$;

-- ─── Amani reads stories and logs events ─────────────────────────────────────
select pg_temp.act_as('a1000000-0000-4000-8000-00000000000a');

select is((select count(*)::int from public.stories), 1, 'only approved, currently valid stories are visible');
select is((select count(*)::int from public.stories where status = 'draft'), 0, 'drafts are invisible');
select is((select count(*)::int from public.stories where id = '51000000-0000-4000-8000-000000000004'), 0, 'expired stories are invisible');
select is((select count(*)::int from public.stories where id = '51000000-0000-4000-8000-000000000005'), 0, 'stories not yet valid are invisible');

select throws_ok(
  $$ insert into public.stories (type, title, slides, action) values ('etiquette_tip', 'x', '[{},{},{}]', '{}') $$,
  '42501', null, 'users cannot write stories'
);
select throws_ok(
  $$ update public.stories set status = 'approved' where id = '51000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'users cannot approve stories'
);

select lives_ok(
  $$ insert into public.story_events (story_id, event, slide_index, dwell_ms) values
     ('51000000-0000-4000-8000-000000000001', 'view', 0, 1200),
     ('51000000-0000-4000-8000-000000000001', 'complete', 2, 5400) $$,
  'a user can log their own events in one batch'
);
select lives_ok(
  $$ insert into public.saved_stories (story_id) values ('51000000-0000-4000-8000-000000000001') $$,
  'a user can save a story'
);
select lives_ok($$ insert into public.muted_story_topics (topic) values ('mahjong') $$, 'a user can mute a topic');
select is((select count(*)::int from public.story_events), 2, 'a user sees their own events');

-- ─── Boris cannot see or touch them ─────────────────────────────────────────
select pg_temp.act_as('b1000000-0000-4000-8000-00000000000b');

select is((select count(*)::int from public.story_events), 0, 'another user''s events are invisible');
select is((select count(*)::int from public.saved_stories), 0, 'another user''s saved stories are invisible');
select is((select count(*)::int from public.muted_story_topics), 0, 'another user''s muted topics are invisible');
select throws_ok(
  $$ insert into public.story_events (user_id, story_id, event) values ('a1000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-000000000001', 'hide') $$,
  '42501', null, 'events cannot be logged for someone else'
);
select is(
  (with removed as (delete from public.saved_stories where true returning 1) select count(*)::int from removed),
  0, 'another user''s saves cannot be deleted'
);

-- ─── Admin-only data stays closed ────────────────────────────────────────────
select throws_ok('select * from public.story_generation_runs', '42501', null, 'generation runs are not readable');
select throws_ok(
  $$ update public.profiles set is_admin = true where id = 'b1000000-0000-4000-8000-00000000000b' $$,
  '42501', null, 'users cannot make themselves admin'
);

select * from finish();
rollback;
