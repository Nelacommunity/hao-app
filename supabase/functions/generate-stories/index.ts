// generate-stories: writes the night's Discover stories for every enabled city and language.
// Called nightly by pg_cron (service role key, *_stories_cron.sql) or on demand by an admin
// (their user token; profiles.is_admin). All writing logic is shared/stories/generate.ts.
//
// POST { cities?: string[], dry_run?: boolean } → { run_id, created, rejected, model_calls, stopped }
//
// Secrets (supabase secrets set …): QWEN_API_KEY, AMAP_KEY. Optional: QWEN_BASE_URL, QWEN_STORY_MODEL,
// STORIES_MAX_CALLS, STORIES_AUTO_APPROVE_ALL=true (demo), STORIES_AI_IMAGES=true (+ QWEN_IMAGE_MODEL),
// STORIES_MOCK=true (placeholder model and AMap, no keys needed).
import { createClient } from '@supabase/supabase-js';

import { DEDUPE_DAYS, DEFAULT_MAX_CALLS, MIN_GROUP_SIZE } from '../../../shared/stories/config.ts';
import type { HolidayFact, LovedFact, PlaceFact, TopicRow, WikiFact } from '../../../shared/stories/facts.ts';
import { FACTS } from '../../../shared/stories/facts.generated.ts';
import { generateStories, homeTopics, paintingTopics, recentKeysFrom, wikipediaTopics, type Budget, type GenerationError, type Illustrator } from '../../../shared/stories/generate.ts';
import { Countries } from '../../../shared/places/countries.ts';

import { amapClient, mockAmap, type Amap } from './amap.ts';
import { mockStoryModel, qwenImage, qwenStoryModel } from './qwen.ts';
import { mockWikipediaFact, wikipediaFact, type ImageStore } from './wikipedia.ts';

const env = (name: string) => Deno.env.get(name) ?? '';
const LANGUAGE_NAMES: Record<string, string> = { en: 'English', fr: 'French', es: 'Spanish', ar: 'Arabic', ru: 'Russian', sw: 'Swahili', pt: 'Portuguese' };
const DAY = 86_400_000;
const LOVED_RADIUS_KM = 60;

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Keys that may call as the cron job: the legacy service role key and any sb_secret_… key of the project. */
function serverKeys() {
  const keys = [env('SUPABASE_SERVICE_ROLE_KEY')];
  const secret = env('SUPABASE_SECRET_KEYS');
  try {
    // A JSON object of name → key on hosted projects.
    keys.push(...Object.values(JSON.parse(secret) as Record<string, string>));
  } catch {
    keys.push(...secret.split(','));
  }
  return keys.map((k) => String(k).trim()).filter(Boolean);
}

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  const url = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // Links saved for the app. Self-hosted, SUPABASE_URL is the internal http://kong:8000, so set the public one.
  const publicUrl = (path: string) => `${(env('SUPABASE_PUBLIC_URL') || url).replace(/\/$/, '')}/storage/v1/object/public/story-images/${path}`;

  // ─── Who is asking: the cron job (service role) or an admin ─────────────────
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  let trigger: 'cron' | 'admin';
  if (token && serverKeys().includes(token)) trigger = 'cron';
  else {
    const { data } = token ? await db.auth.getUser(token) : { data: { user: null } };
    if (!data.user) return json({ error: 'Unauthorized' }, 401);
    const { data: profile } = await db.from('profiles').select('is_admin').eq('id', data.user.id).maybeSingle();
    if (!profile?.is_admin) return json({ error: 'Admins only' }, 403);
    trigger = 'admin';
  }

  const body = (await request.json().catch(() => ({}))) as { cities?: unknown; dry_run?: unknown };
  const onlyCities = Array.isArray(body.cities) ? body.cities.map(String) : null;
  const dryRun = body.dry_run === true;

  // ─── Model, AMap, images ────────────────────────────────────────────────────
  const mock = env('STORIES_MOCK') === 'true';
  if (!mock && (!env('QWEN_API_KEY') || !env('AMAP_KEY'))) return json({ error: 'Set QWEN_API_KEY and AMAP_KEY (or STORIES_MOCK=true).' }, 500);
  const baseUrl = env('QWEN_BASE_URL') || undefined;
  const model = mock ? mockStoryModel() : qwenStoryModel(env('QWEN_API_KEY'), env('QWEN_STORY_MODEL') || env('QWEN_MODEL') || 'qwen3.8-flash', baseUrl);
  const amap: Amap = mock ? mockAmap() : amapClient(env('AMAP_KEY'));
  const budget: Budget = { maxCalls: Number(env('STORIES_MAX_CALLS')) || DEFAULT_MAX_CALLS, used: 0 };
  const autoApproveAll = env('STORIES_AUTO_APPROVE_ALL') === 'true';

  let illustrate: Illustrator | undefined;
  if (!mock && env('STORIES_AI_IMAGES') === 'true') {
    illustrate = {
      async generate(prompt, key) {
        const image = await qwenImage(env('QWEN_API_KEY'), env('QWEN_IMAGE_MODEL') || 'qwen-image-3.0-pro', prompt, baseUrl);
        if (!image || dryRun) return null;
        const path = `${new Date().toISOString().slice(0, 10)}/${key.replace(/[^a-z0-9-]/gi, '-')}.${image.mime.includes('jpeg') ? 'jpg' : 'png'}`;
        const { error } = await db.storage.from('story-images').upload(path, image.bytes, { contentType: image.mime, upsert: true });
        if (error) throw error;
        return publicUrl(path);
      },
    };
  }

  // ─── Shared inputs ──────────────────────────────────────────────────────────
  const now = new Date();
  const today = new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
  const [{ data: cities }, { data: topics }, { data: holidays }] = await Promise.all([
    db.from('story_cities').select('*').eq('enabled', true),
    db.from('story_topics').select('id, category, label, enabled, wikipedia, nationality, image_file'),
    db.from('holidays').select('*').gte('starts_on', today).lte('starts_on', new Date(now.getTime() + 30 * DAY).toISOString().slice(0, 10)),
  ]);

  // Nationalities of Hao's users, most first: who gets a "your country and China" story.
  const { data: people } = await db.from('profiles').select('nationality').not('nationality', 'is', null).limit(20_000);
  const counts = new Map<string, number>();
  for (const p of people ?? []) counts.set(p.nationality, (counts.get(p.nationality) ?? 0) + 1);
  const nationalities = [...counts].sort((a, b) => b[1] - a[1]).map(([n]) => n);

  const { data: run } = dryRun
    ? { data: null }
    : await db.from('story_generation_runs').insert({ trigger }).select('id').single();
  const errors: GenerationError[] = [];
  let created = 0;
  let rejected = 0;
  let stopped: string | null = null;

  // Wikimedia photos are copied into the public story-images bucket (Wikimedia is blocked in mainland China).
  const storeImage: ImageStore | null = dryRun
    ? null
    : async (path, bytes, contentType) => {
        const { error } = await db.storage.from('story-images').upload(path, bytes, { contentType, upsert: true });
        if (error) throw error;
        return publicUrl(path);
      };
  // Articles fetched this run, shared across cities.
  const articles = new Map<string, Promise<WikiFact | null>>();
  const article = (topic: { topicId: string; title: string; imageFile?: string }) => {
    if (!articles.has(topic.title)) {
      articles.set(topic.title, mock ? Promise.resolve(mockWikipediaFact(topic)) : wikipediaFact(topic, storeImage).catch(() => null));
    }
    return articles.get(topic.title)!.then((f) => (f ? { ...f, topicId: topic.topicId } : null));
  };

  /** Stores AMap places in public.places and returns them with their uuid. */
  async function stored(list: Omit<PlaceFact, 'placeId'>[]): Promise<PlaceFact[]> {
    if (!list.length) return [];
    const rows = list.map((p) => ({
      amap_poi_id: p.amapId,
      name: p.name.slice(0, 200),
      name_zh: p.nameZh.slice(0, 200),
      category: p.category === 'food' ? 'food' : p.category === 'market' ? 'shop' : p.category === 'hotel' ? 'service' : 'attraction',
      lat: p.lat,
      lng: p.lng,
      address: (p.addressZh || p.address).slice(0, 400),
      tags: p.tags.slice(0, 20),
      amap_rating: p.rating ?? null,
    }));
    const { data, error } = await db.from('places').upsert(rows, { onConflict: 'amap_poi_id' }).select('id, amap_poi_id');
    if (error) throw error;
    const ids = new Map((data ?? []).map((r: { id: string; amap_poi_id: string }) => [r.amap_poi_id, r.id]));
    return list.filter((p) => ids.has(p.amapId)).map((p) => ({ ...p, placeId: ids.get(p.amapId)! }));
  }

  for (const city of cities ?? []) {
    if (onlyCities && !onlyCities.includes(city.city)) continue;
    if (stopped) break;
    const fail = (error: string) => errors.push({ city: city.city, language: '', type: 'place_spotlight', key: 'inputs', error });

    // Facts from AMap and the community stats. A failing source just means fewer story types tonight.
    const page = (Math.floor(now.getTime() / DAY) % 3) + 1;
    const [weather, sights, food] = await Promise.all([
      amap.weather(city.adcode).catch((e) => (fail(`weather: ${e.message}`), null)),
      amap.places({ cityZh: city.city_zh, types: '110000', page }).catch((e) => (fail(`places: ${e.message}`), [])),
      amap.places({ cityZh: city.city_zh, types: '050000', page }).catch((e) => (fail(`food places: ${e.message}`), [])),
    ]);
    const spotlight = await stored([...sights, ...food.filter((p) => p.photos.length)]).catch((e) => (fail(`store places: ${e.message}`), []));

    const { data: stats } = await db
      .from('place_country_stats')
      .select('nationality, visitor_count, like_count, places!inner(id, amap_poi_id, lat, lng)')
      .gte('visitor_count', MIN_GROUP_SIZE)
      .order('like_count', { ascending: false })
      .limit(200);
    type StatRow = { nationality: string; visitor_count: number; like_count: number; places: { id: string; amap_poi_id: string | null; lat: number; lng: number } };
    const nearby = ((stats ?? []) as unknown as StatRow[]).filter((s) => s.places.amap_poi_id && km(city.lat, city.lng, s.places.lat, s.places.lng) <= LOVED_RADIUS_KM).slice(0, 10);
    // Fresh details and real photos from AMap for the places people loved.
    const details = await amap.placesById(nearby.map((s) => s.places.amap_poi_id!)).catch((e) => (fail(`loved places: ${e.message}`), []));
    const loved: LovedFact[] = nearby.flatMap((s) => {
      const d = details.find((p) => p.amapId === s.places.amap_poi_id);
      return d ? [{ ...d, placeId: s.places.id, nationality: s.nationality, country: Countries[s.nationality] ?? s.nationality, visitors: s.visitor_count, likes: s.like_count }] : [];
    });

    const { data: recent } = await db
      .from('stories')
      .select('topics, place_id')
      .eq('city', city.city)
      .gte('created_at', new Date(now.getTime() - DEDUPE_DAYS * DAY).toISOString());
    const recentKeys = recentKeysFrom(recent ?? []);
    const wanted = wikipediaTopics({ topics: (topics ?? []) as TopicRow[], recentKeys, city: city.city, now });
    const wikipedia = (await Promise.all(wanted.map(article))).filter((f): f is WikiFact => !!f);
    if (wanted.length > wikipedia.length) fail(`wikipedia: ${wanted.length - wikipedia.length} article(s) not found`);
    const pick = { topics: (topics ?? []) as TopicRow[], recentKeys, city: city.city, now };
    const [paintings, home] = await Promise.all([
      Promise.all(paintingTopics(pick).map(article)),
      Promise.all(homeTopics({ ...pick, nationalities }).map(article)),
    ]);

    for (const code of city.languages as string[]) {
      const result = await generateStories({
        city: { city: city.city, cityZh: city.city_zh },
        language: { code, name: LANGUAGE_NAMES[code] ?? code },
        now,
        facts: FACTS,
        topics: (topics ?? []) as TopicRow[],
        recentKeys,
        holidays: (holidays ?? []) as HolidayFact[],
        weather,
        spotlight,
        loved,
        wikipedia,
        paintings: paintings.filter((f): f is WikiFact => !!f),
        home: home.filter((f): f is WikiFact => !!f),
        model,
        illustrate,
        budget,
        autoApproveAll,
      });
      errors.push(...result.errors);
      rejected += result.rejected;
      if (result.stories.length && !dryRun) {
        const { error } = await db.from('stories').insert(result.stories);
        if (error) errors.push({ city: city.city, language: code, type: result.stories[0].type, key: 'insert', error: error.message });
        else created += result.stories.length;
      } else if (dryRun) created += result.stories.length;
      if (result.stopped) {
        stopped = result.stopped;
        break;
      }
    }
  }

  for (const e of errors) console.warn('generate-stories', e.city, e.language, e.type, e.key, e.error);
  if (run) {
    await db
      .from('story_generation_runs')
      .update({ finished_at: new Date().toISOString(), created_count: created, rejected_count: rejected, model_calls: budget.used, stopped_reason: stopped, errors: errors.slice(0, 200) })
      .eq('id', run.id);
  }
  return json({ run_id: run?.id ?? null, dry_run: dryRun, created, rejected, model_calls: budget.used, stopped });
});
