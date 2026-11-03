// Eleven approved [PLACEHOLDER] Discover stories (every type) for one city, so the feed and UI work before generation runs.
//
//   npm run seed:stories -- [--city Beijing] [--dry-run]
//
// Re-running replaces the same stories (fixed ids). Needs, in the local .env only:
// EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (service role, bypasses row-level security).
import { createClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // Variables may come from the shell instead.
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const cityIndex = args.indexOf('--city');
const city = cityIndex >= 0 ? args[cityIndex + 1] : 'Beijing';

const slide = (n, extra = {}) => ({
  heading: `[PLACEHOLDER] heading ${n}`,
  body: `[PLACEHOLDER] A short, friendly line of text for slide ${n}. Real stories come from the generator.`,
  image_url: null,
  image_kind: 'none',
  ...extra,
});
const slides = (count = 3) => Array.from({ length: count }, (_, i) => slide(i + 1));

const place = { name: '[PLACE NAME]', name_zh: '[地点]', lat: 39.9163, lng: 116.3972, amap_poi_id: null };

const STORIES = [
  { type: 'culture_moment', topics: ['gongfu-tea'], action: { kind: 'ask_more', label: 'Ask Hao more', payload: {} }, slides: slides(4) },
  { type: 'culture_moment', topics: ['mahjong'], action: { kind: 'ask_more', label: 'Ask Hao more', payload: {} } },
  { type: 'place_spotlight', topics: ['place:attraction'], action: { kind: 'navigate', label: 'Navigate', payload: place } },
  { type: 'your_people_loved', nationality: 'TZ', topics: ['community', 'place:food', 'diet:halal'], action: { kind: 'navigate', label: 'Navigate', payload: place } },
  { type: 'food_to_try', topics: ['jianbing'], action: { kind: 'find_food', label: 'Find this food near me', payload: { query: '[PLACEHOLDER] jianbing near me' } } },
  { type: 'food_to_try', topics: ['roujiamo', 'contains:pork', 'contains:meat'], action: { kind: 'find_food', label: 'Find this food near me', payload: { query: '[PLACEHOLDER] roujiamo near me' } } },
  { type: 'phrase_of_the_day', topics: ['phrases:basics'], action: { kind: 'practice_phrase', label: 'Practice with Hao', payload: { zh: '你好', pinyin: 'nǐ hǎo', en: 'Hello' } } },
  { type: 'etiquette_tip', topics: ['chopsticks'], action: { kind: 'ask_more', label: 'Ask Hao more', payload: {} } },
  { type: 'coming_up', topics: ['holiday'], action: { kind: 'ask_more', label: 'Ask Hao more', payload: {} } },
  { type: 'season_tip', topics: ['season:weather'], audience: 'student', action: { kind: 'ask_more', label: 'Ask Hao more', payload: {} } },
  { type: 'learn_how', topics: ['craft:paper-cutting'], action: { kind: 'learn_with_hao', label: 'Learn with Hao', payload: { craft: 'paper-cutting', title: 'Paper cutting' } }, slides: slides(4) },
];

const now = new Date();
const rows = STORIES.map((s, i) => ({
  id: `5eed0000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  type: s.type,
  city,
  nationality: s.nationality ?? null,
  audience: s.audience ?? 'all',
  language: 'en',
  title: `[PLACEHOLDER] ${s.type.replace(/_/g, ' ')} ${i + 1}`,
  slides: s.slides ?? slides(),
  action: s.action,
  place_id: null,
  topics: s.topics,
  sources: [{ kind: 'knowledge', ref: 'seed', facts: '[PLACEHOLDER] The facts this story was written from.' }],
  status: 'approved',
  valid_from: now.toISOString(),
  valid_until: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
  generated_by_model: 'seed',
}));

if (dryRun) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env (see .env.example).');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await supabase.from('stories').upsert(rows, { onConflict: 'id' });
if (error) {
  console.error(`Seeding failed: ${error.message}`);
  process.exit(1);
}
console.log(`Seeded ${rows.length} approved stories for ${city}.`);
