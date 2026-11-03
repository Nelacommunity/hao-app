-- Discover: short AI-made stories about Chinese culture and places, a few swipeable slides each.
-- Stories are written only by the generate-stories Edge Function (service role). Signed-in users read
-- approved stories that are valid right now, and log what they did with them (story_events) for later
-- personalisation. Shapes of slides/action/sources are validated in shared/stories/schema.ts.

-- ─── Profile: student or tourist, and who may review stories ────────────────
alter table public.profiles
  add column traveller_type text check (traveller_type in ('student', 'tourist')),
  -- Set by the team in SQL; never by the app.
  add column is_admin boolean not null default false;

comment on column public.profiles.traveller_type is 'Who Discover stories are picked for. Null: treated as both.';

grant update (traveller_type) on public.profiles to authenticated;

-- ─── Topics the generator may write about (editable by admins) ──────────────
create table public.story_topics (
  id text primary key check (id ~ '^[a-z0-9:_-]{2,60}$'),
  category text not null check (category in ('culture', 'festival', 'food', 'language', 'etiquette', 'season', 'place', 'community')),
  label text not null check (char_length(label) between 1 and 120),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.story_topics is 'Curated list of allowed story topics. The generator only writes about enabled topics.';

-- ─── Cities and languages the nightly run generates for ─────────────────────
create table public.story_cities (
  city text primary key check (char_length(city) between 1 and 80),
  city_zh text not null check (char_length(city_zh) between 1 and 40),
  -- AMap adcode, used for the weather forecast.
  adcode text not null check (adcode ~ '^[0-9]{6}$'),
  lat double precision not null,
  lng double precision not null,
  languages text[] not null default '{en}',
  enabled boolean not null default true
);

insert into public.story_cities (city, city_zh, adcode, lat, lng) values
  ('Beijing', '北京', '110000', 39.9042, 116.4074),
  ('Shanghai', '上海', '310000', 31.2304, 121.4737),
  ('Chengdu', '成都', '510100', 30.5728, 104.0668),
  ('Xi''an', '西安', '610100', 34.3416, 108.9398);

-- ─── Holidays and festivals, the facts behind coming_up stories ─────────────
create table public.holidays (
  id text not null check (id ~ '^[a-z0-9-]{2,40}$'),
  starts_on date not null,
  ends_on date not null,
  name text not null,
  name_zh text not null,
  -- public_holiday: days off nationwide; festival / observance: a normal working day.
  kind text not null check (kind in ('public_holiday', 'festival', 'observance')),
  about text not null,
  closures text not null default '',
  crowds text not null default '',
  primary key (id, starts_on),
  check (ends_on >= starts_on)
);

comment on table public.holidays is 'Dates are Gregorian; lunar festivals move every year. Add next year''s rows each December.';

insert into public.holidays (id, starts_on, ends_on, name, name_zh, kind, about, closures, crowds) values
  ('national-day', '2026-10-01', '2026-10-07', 'National Day Golden Week', '国庆节', 'public_holiday',
   'A week-long holiday from 1 October; the busiest travel week of the year.', 'Government offices and banks close; shops and restaurants stay open.', 'Famous sights, trains and flights are packed all week.'),
  ('double-ninth', '2026-10-18', '2026-10-18', 'Double Ninth Festival', '重阳节', 'festival',
   'A day to honour elders: people climb hills, drink chrysanthemum tea and visit grandparents.', '', 'City hills and parks are busier than usual.'),
  ('singles-day', '2026-11-11', '2026-11-11', 'Singles'' Day', '双十一', 'observance',
   '11.11 is the world''s biggest online shopping day, with sales on Taobao and JD.', '', 'Deliveries can be slower for about a week after.'),
  ('winter-solstice', '2026-12-22', '2026-12-22', 'Winter Solstice', '冬至', 'festival',
   'The longest night: the north eats dumplings, the south eats sweet rice balls.', '', 'Dumpling restaurants are busy in the evening.'),
  ('new-year', '2027-01-01', '2027-01-01', 'New Year''s Day', '元旦', 'public_holiday',
   'A public holiday, but the big celebration is Spring Festival a few weeks later.', 'Government offices and banks close.', 'Shopping malls are busy.'),
  ('spring-festival', '2027-02-06', '2027-02-12', 'Spring Festival', '春节', 'public_holiday',
   'Chinese New Year: families reunite, eat dumplings, set off fireworks and give red envelopes.', 'Many small shops and restaurants close for about a week; offices and banks close.', 'Trains are sold out weeks ahead; big cities feel quiet, tourist sights are crowded.'),
  ('lantern', '2027-02-20', '2027-02-20', 'Lantern Festival', '元宵节', 'festival',
   'The 15th day of the new year closes the holiday with lantern shows, riddles and sweet rice balls.', '', 'Lantern shows are crowded in the evening.'),
  ('qingming', '2027-04-05', '2027-04-05', 'Qingming Festival', '清明节', 'public_holiday',
   'Tomb-Sweeping Day: families clean ancestors'' graves and enjoy spring outings.', 'Government offices and banks close.', 'A short holiday, so parks and scenic spots get busy.'),
  ('labour-day', '2027-05-01', '2027-05-05', 'Labour Day holiday', '劳动节', 'public_holiday',
   'A five-day holiday around 1 May when much of the country travels.', 'Government offices and banks close.', 'Book hotels and tickets early; big sights are crowded.'),
  ('dragon-boat', '2027-06-09', '2027-06-09', 'Dragon Boat Festival', '端午节', 'public_holiday',
   'Teams race long dragon boats to drums, and everyone eats zongzi, sticky rice in bamboo leaves.', 'Government offices and banks close.', 'Riverside races draw big crowds.');

-- ─── Stories ─────────────────────────────────────────────────────────────────
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'culture_moment', 'place_spotlight', 'your_people_loved', 'food_to_try',
    'phrase_of_the_day', 'etiquette_tip', 'coming_up', 'season_tip'
  )),
  -- Null: shown in every city / to every nationality.
  city text check (char_length(city) <= 80),
  nationality text check (nationality ~ '^[A-Z]{2}$'),
  audience text not null default 'all' check (audience in ('student', 'tourist', 'all')),
  language text not null default 'en' check (char_length(language) between 2 and 64),
  title text not null check (char_length(title) between 1 and 120),
  -- [{ heading, body, image_url, image_kind: real_photo | ai_illustration | none }]
  slides jsonb not null check (jsonb_typeof(slides) = 'array' and jsonb_array_length(slides) between 3 and 4),
  -- { kind, label, payload }
  action jsonb not null check (jsonb_typeof(action) = 'object'),
  place_id uuid references public.places (id) on delete cascade,
  -- Story topics plus diet markers (contains:pork, diet:halal, …) the feed filters on.
  topics text[] not null default '{}' check (cardinality(topics) <= 20),
  -- The facts the story was written from, so chat can answer follow-up questions from them.
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected', 'expired')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  generated_by_model text not null default '' check (char_length(generated_by_model) <= 80),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_until > valid_from)
);

comment on table public.stories is 'AI-generated Discover stories. Written only by the service role; users read approved, current ones.';

create index stories_feed on public.stories (status, language, city, valid_until);
create index stories_recent_topics on public.stories using gin (topics);
create index stories_place on public.stories (place_id) where place_id is not null;

alter table public.stories enable row level security;

create policy "Signed-in users can read approved current stories"
  on public.stories for select
  to authenticated
  using (status = 'approved' and valid_from <= now() and (valid_until is null or valid_until > now()));

revoke all on public.stories from anon, authenticated;
grant select on public.stories to authenticated;

-- ─── What users did with stories (for a future "taste twin"; not used for learning yet) ───
create table public.story_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  event text not null check (event in ('view', 'complete', 'skip', 'save', 'action_tap', 'ask_more', 'hide')),
  slide_index smallint check (slide_index between 0 and 10),
  dwell_ms integer check (dwell_ms between 0 and 3600000),
  created_at timestamptz not null default now()
);

create index story_events_user on public.story_events (user_id, story_id, event);

alter table public.story_events enable row level security;

create policy "Users can read their story events"
  on public.story_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can log their story events"
  on public.story_events for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on public.story_events from anon, authenticated;
grant select on public.story_events to authenticated;
grant insert (story_id, event, slide_index, dwell_ms, created_at) on public.story_events to authenticated;

-- ─── Saved stories ───────────────────────────────────────────────────────────
create table public.saved_stories (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

alter table public.saved_stories enable row level security;

create policy "Users can read their saved stories"
  on public.saved_stories for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can save stories"
  on public.saved_stories for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can unsave stories"
  on public.saved_stories for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.saved_stories from anon, authenticated;
grant select, delete on public.saved_stories to authenticated;
grant insert (story_id) on public.saved_stories to authenticated;

-- ─── "Not interested in this topic" ──────────────────────────────────────────
create table public.muted_story_topics (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic text not null check (char_length(topic) between 1 and 60),
  created_at timestamptz not null default now(),
  primary key (user_id, topic)
);

alter table public.muted_story_topics enable row level security;

create policy "Users can read their muted topics"
  on public.muted_story_topics for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can mute topics"
  on public.muted_story_topics for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can unmute topics"
  on public.muted_story_topics for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.muted_story_topics from anon, authenticated;
grant select, delete on public.muted_story_topics to authenticated;
grant insert (topic) on public.muted_story_topics to authenticated;

-- ─── Admin helpers ───────────────────────────────────────────────────────────
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = (select auth.uid())), false)
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.story_topics enable row level security;

create policy "Signed-in users can read topics"
  on public.story_topics for select
  to authenticated
  using (true);

create policy "Admins can add topics"
  on public.story_topics for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins can change topics"
  on public.story_topics for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins can delete topics"
  on public.story_topics for delete
  to authenticated
  using ((select public.is_admin()));

revoke all on public.story_topics from anon, authenticated;
grant select, insert, update, delete on public.story_topics to authenticated;

alter table public.story_cities enable row level security;
alter table public.holidays enable row level security;

create policy "Signed-in users can read holidays"
  on public.holidays for select
  to authenticated
  using (true);

create policy "Signed-in users can read story cities"
  on public.story_cities for select
  to authenticated
  using (true);

revoke all on public.story_cities, public.holidays from anon, authenticated;
grant select on public.story_cities, public.holidays to authenticated;

-- ─── Generation log (service role only) ─────────────────────────────────────
create table public.story_generation_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('cron', 'admin')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_count integer not null default 0,
  rejected_count integer not null default 0,
  model_calls integer not null default 0,
  -- Why the run stopped early, e.g. 'cost_limit'.
  stopped_reason text,
  -- [{ city, language, type, error, output }]: invalid model output and other failures.
  errors jsonb not null default '[]'::jsonb
);

alter table public.story_generation_runs enable row level security;
revoke all on public.story_generation_runs from anon, authenticated;

-- Drafts waiting for review, for the team in SQL Studio (the app's review screen goes through the API).
create view public.stories_review
with (security_invoker = true)
as
select id, type, city, nationality, audience, language, title, slides, action, sources, topics, created_at, generated_by_model
from public.stories
where status = 'draft'
order by created_at;

revoke all on public.stories_review from anon, authenticated;

-- ─── Story images: public bucket written by the generator ───────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('story-images', 'story-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ─── Starter topics ──────────────────────────────────────────────────────────
insert into public.story_topics (id, category, label) values
  ('gongfu-tea', 'culture', 'Gongfu tea'),
  ('calligraphy', 'culture', 'Calligraphy'),
  ('tai-chi', 'culture', 'Morning tai chi'),
  ('square-dance', 'culture', 'Square dancing'),
  ('mahjong', 'culture', 'Mahjong'),
  ('peking-opera', 'culture', 'Peking opera'),
  ('face-changing', 'culture', 'Sichuan face-changing'),
  ('paper-cutting', 'culture', 'Paper cutting'),
  ('hongbao', 'culture', 'Red envelopes'),
  ('lucky-numbers', 'culture', 'Lucky numbers'),
  ('zodiac', 'culture', 'Chinese zodiac'),
  ('night-markets', 'culture', 'Night markets'),
  ('hutongs', 'culture', 'Hutongs'),
  ('pandas', 'culture', 'Giant pandas'),
  ('hanfu', 'culture', 'Hanfu'),
  ('shadow-puppets', 'culture', 'Shadow puppets'),
  ('kung-fu', 'culture', 'Kung fu'),
  ('tea-houses', 'culture', 'Tea houses'),
  ('qr-life', 'culture', 'Scanning QR codes'),
  ('chopsticks', 'etiquette', 'Chopstick manners'),
  ('ganbei', 'etiquette', 'Toasting'),
  ('hot-water', 'etiquette', 'Hot water'),
  ('bargaining', 'etiquette', 'Bargaining'),
  ('peking-duck', 'food', 'Peking duck'),
  ('xiaolongbao', 'food', 'Xiaolongbao'),
  ('mapo-tofu', 'food', 'Mapo tofu'),
  ('hotpot', 'food', 'Hotpot'),
  ('roujiamo', 'food', 'Roujiamo'),
  ('biangbiang', 'food', 'Biangbiang noodles'),
  ('dim-sum', 'food', 'Dim sum'),
  ('jianbing', 'food', 'Jianbing'),
  ('dumplings', 'food', 'Dumplings'),
  ('phrases:basics', 'language', 'Basic phrases'),
  ('phrases:getting-around', 'language', 'Getting around'),
  ('phrases:eating', 'language', 'Eating out'),
  ('phrases:shopping', 'language', 'Shopping'),
  ('phrases:emergency', 'language', 'Emergencies'),
  ('season:weather', 'season', 'Weather and season'),
  ('holiday', 'festival', 'Holidays and festivals'),
  ('place:attraction', 'place', 'Sights nearby'),
  ('place:food', 'place', 'Food nearby'),
  ('community', 'community', 'Loved by people from your country');
