-- Discover: culture stories grounded in Wikipedia articles, and "learn how" stories where Hao teaches a
-- craft step by step (paper cutting, dumplings, calligraphy…). Admins add Wikipedia-backed topics by
-- inserting a story_topics row with the article title in `wikipedia`.

-- ─── New story type ──────────────────────────────────────────────────────────
alter table public.stories drop constraint stories_type_check;
alter table public.stories add constraint stories_type_check check (type in (
  'culture_moment', 'place_spotlight', 'your_people_loved', 'food_to_try',
  'phrase_of_the_day', 'etiquette_tip', 'coming_up', 'season_tip', 'learn_how'
));

-- Credit shown on the story, e.g. "Based on Wikipedia: “Chinese paper cutting” (CC BY-SA 4.0)".
alter table public.stories add column attribution text check (char_length(attribution) <= 300);

-- ─── Topics: crafts, and the Wikipedia article behind a topic ───────────────
alter table public.story_topics drop constraint story_topics_category_check;
alter table public.story_topics add constraint story_topics_category_check
  check (category in ('culture', 'festival', 'food', 'language', 'etiquette', 'season', 'place', 'community', 'craft'));

alter table public.story_topics add column wikipedia text check (char_length(wikipedia) between 1 and 200);

comment on column public.story_topics.wikipedia is 'English Wikipedia article title. The generator writes culture stories from its text (CC BY-SA, credited on the story).';

-- Existing culture topics that have a good article.
update public.story_topics set wikipedia = v.title
from (
  values
    ('calligraphy', 'Chinese calligraphy'),
    ('paper-cutting', 'Chinese paper cutting'),
    ('peking-opera', 'Peking opera'),
    ('tai-chi', 'Tai chi'),
    ('mahjong', 'Mahjong'),
    ('zodiac', 'Chinese zodiac'),
    ('hutongs', 'Hutong'),
    ('pandas', 'Giant panda'),
    ('hanfu', 'Hanfu'),
    ('face-changing', 'Bian lian'),
    ('gongfu-tea', 'Chinese tea culture')
) as v (id, title)
where story_topics.id = v.id;

insert into public.story_topics (id, category, label, wikipedia) values
  ('wiki:chinese-new-year', 'festival', 'Chinese New Year', 'Chinese New Year'),
  ('wiki:lantern-festival', 'festival', 'Lantern Festival', 'Lantern Festival'),
  ('wiki:mid-autumn', 'festival', 'Mid-Autumn Festival', 'Mid-Autumn Festival'),
  ('wiki:dragon-boat', 'festival', 'Dragon Boat Festival', 'Dragon Boat Festival'),
  ('wiki:lion-dance', 'culture', 'Lion dance', 'Lion dance'),
  ('wiki:chinese-dragon', 'culture', 'Chinese dragons', 'Chinese dragon'),
  ('wiki:chinese-knotting', 'culture', 'Chinese knotting', 'Chinese knotting'),
  ('wiki:xiangqi', 'culture', 'Xiangqi (Chinese chess)', 'Xiangqi'),
  ('wiki:go', 'culture', 'The game of Go', 'Go (game)'),
  ('wiki:chinese-painting', 'culture', 'Chinese painting', 'Chinese painting'),
  ('wiki:chinese-garden', 'culture', 'Chinese gardens', 'Chinese garden'),
  ('wiki:porcelain', 'culture', 'Chinese porcelain', 'Chinese ceramics'),
  ('wiki:qipao', 'culture', 'Qipao', 'Cheongsam'),
  ('wiki:great-wall', 'culture', 'The Great Wall', 'Great Wall of China'),
  ('wiki:forbidden-city', 'culture', 'The Forbidden City', 'Forbidden City'),
  ('wiki:terracotta-army', 'culture', 'The Terracotta Army', 'Terracotta Army'),
  ('craft:paper-cutting', 'craft', 'Learn paper cutting', null),
  ('craft:dumpling-folding', 'craft', 'Learn to fold dumplings', null),
  ('craft:gongfu-tea', 'craft', 'Learn to brew gongfu tea', null),
  ('craft:brush-fu', 'craft', 'Learn to write 福', null),
  ('craft:tangram', 'craft', 'Learn tangram', null),
  ('craft:chinese-knot', 'craft', 'Learn a Chinese knot', null)
on conflict (id) do nothing;

-- The review view shows the credit too.
create or replace view public.stories_review
with (security_invoker = true)
as
select id, type, city, nationality, audience, language, title, slides, action, sources, topics, created_at, generated_by_model, attribution
from public.stories
where status = 'draft'
order by created_at;

revoke all on public.stories_review from anon, authenticated;
