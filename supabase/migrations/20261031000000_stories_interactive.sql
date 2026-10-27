-- Discover: interactive stories. "Did you know?" stories open with a quiz the story then answers; culture,
-- painting and home-country stories end with one; food and craft stories ask "Tried it / Want to try".
-- Painting stories show a real, public-domain painting (the Commons file named on the topic) and zoom
-- across it. "Your country and China" stories are written from Wikipedia for each nationality with users
-- and only shown to people from there.

-- ─── New story types and the interaction ────────────────────────────────────
alter table public.stories drop constraint stories_type_check;
alter table public.stories add constraint stories_type_check check (type in (
  'culture_moment', 'place_spotlight', 'your_people_loved', 'food_to_try',
  'phrase_of_the_day', 'etiquette_tip', 'coming_up', 'season_tip', 'learn_how',
  'did_you_know', 'painting', 'home_and_china'
));

-- { quiz: { question, choices, answer, why } | null, quiz_at: 'start' | 'end' | null, tried: text | null }
alter table public.stories add column interaction jsonb check (interaction is null or jsonb_typeof(interaction) = 'object');

comment on column public.stories.interaction is 'Quiz and "Tried it / Want to try" for the story; validated in shared/stories/schema.ts.';

-- The review view shows it too.
create or replace view public.stories_review
with (security_invoker = true)
as
select id, type, city, nationality, audience, language, title, slides, action, sources, topics, created_at, generated_by_model, attribution, interaction
from public.stories
where status = 'draft'
order by created_at;

revoke all on public.stories_review from anon, authenticated;

-- ─── What readers do with them ──────────────────────────────────────────────
alter table public.story_events drop constraint story_events_event_check;
alter table public.story_events add constraint story_events_event_check check (event in (
  'view', 'complete', 'skip', 'save', 'action_tap', 'ask_more', 'hide',
  'quiz_right', 'quiz_wrong', 'tried', 'want_to_try'
));

-- ─── Topics: paintings (with their Commons file) and home countries ─────────
alter table public.story_topics drop constraint story_topics_category_check;
alter table public.story_topics add constraint story_topics_category_check
  check (category in ('culture', 'festival', 'food', 'language', 'etiquette', 'season', 'place', 'community', 'craft', 'painting', 'home'));

alter table public.story_topics
  add column nationality text check (nationality ~ '^[A-Z]{2}$'),
  add column image_file text check (char_length(image_file) between 1 and 240);

comment on column public.story_topics.nationality is 'home topics: the country (ISO 3166-1 alpha-2) the article links with China; only its people see the story.';
comment on column public.story_topics.image_file is 'painting topics: the Wikimedia Commons file of the painting itself (public domain), used on every slide.';

insert into public.story_topics (id, category, label, wikipedia, image_file) values
  ('painting:qingming', 'painting', 'Along the River During the Qingming Festival', 'Along the River During the Qingming Festival', '清明上河圖.png'),
  ('painting:fuchun', 'painting', 'Dwelling in the Fuchun Mountains', 'Dwelling in the Fuchun Mountains', 'Dwelling in the Fuchun Mountains (first half).JPG'),
  ('painting:early-spring', 'painting', 'Early Spring by Guo Xi', 'Early Spring (painting)', 'Guo Xi - Early Spring (large).jpg'),
  ('painting:travelers', 'painting', 'Travelers Among Mountains and Streams', 'Fan Kuan', 'Fan Kuan - Travelers Among Mountains and Streams - Google Art Project.jpg'),
  ('painting:night-revels', 'painting', 'The Night Revels of Han Xizai', 'The Night Revels of Han Xizai', 'Gu Hongzhong''s Night Revels 1 edit (cropped2) (cropped) (cropped).jpg'),
  ('painting:admonitions', 'painting', 'The Admonitions Scroll', 'Admonitions Scroll', 'Ku K''ai-chih 001.jpg'),
  ('painting:ma-yuan', 'painting', 'Walking on a Path in Spring by Ma Yuan', 'Ma Yuan (painter)', 'Ma Yuan Walking on Path in Spring.jpg')
on conflict (id) do nothing;

-- One general article per country, plus friendlier, more specific ones where Wikipedia has them.
insert into public.story_topics (id, category, label, wikipedia, nationality) values
  ('home:tz', 'home', 'Tanzania and China', 'China–Tanzania relations', 'TZ'),
  ('home:tz-tazara', 'home', 'The TAZARA Railway', 'TAZARA Railway', 'TZ'),
  ('home:tz-people', 'home', 'Chinese people in Tanzania', 'Chinese people in Tanzania', 'TZ'),
  ('home:ke', 'home', 'Kenya and China', 'China–Kenya relations', 'KE'),
  ('home:ke-zheng-he', 'home', 'Zheng He''s fleet in East Africa', 'Zheng He', 'KE'),
  ('home:ke-people', 'home', 'Chinese people in Kenya', 'Chinese people in Kenya', 'KE'),
  ('home:ng', 'home', 'Nigeria and China', 'China–Nigeria relations', 'NG'),
  ('home:gh', 'home', 'Ghana and China', 'China–Ghana relations', 'GH'),
  ('home:et', 'home', 'Ethiopia and China', 'China–Ethiopia relations', 'ET'),
  ('home:za', 'home', 'South Africa and China', 'China–South Africa relations', 'ZA'),
  ('home:eg', 'home', 'Egypt and China', 'China–Egypt relations', 'EG'),
  ('home:pk', 'home', 'Pakistan and China', 'China–Pakistan relations', 'PK'),
  ('home:in', 'home', 'India and China', 'China–India relations', 'IN'),
  ('home:bd', 'home', 'Bangladesh and China', 'Bangladesh–China relations', 'BD'),
  ('home:ru', 'home', 'Russia and China', 'China–Russia relations', 'RU'),
  ('home:kz', 'home', 'Kazakhstan and China', 'China–Kazakhstan relations', 'KZ'),
  ('home:kz-silk-road', 'home', 'The Silk Road', 'Silk Road', 'KZ'),
  ('home:mn', 'home', 'Mongolia and China', 'China–Mongolia relations', 'MN'),
  ('home:kr', 'home', 'South Korea and China', 'China–South Korea relations', 'KR'),
  ('home:vn', 'home', 'Vietnam and China', 'China–Vietnam relations', 'VN'),
  ('home:th', 'home', 'Thailand and China', 'China–Thailand relations', 'TH'),
  ('home:id', 'home', 'Indonesia and China', 'China–Indonesia relations', 'ID'),
  ('home:us', 'home', 'The United States and China', 'China–United States relations', 'US'),
  ('home:gb', 'home', 'The United Kingdom and China', 'China–United Kingdom relations', 'GB'),
  ('home:fr', 'home', 'France and China', 'China–France relations', 'FR')
on conflict (id) do nothing;
