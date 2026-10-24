// Writes one night's Discover stories for one city and language from grounded facts. Pure apart from the
// injected model and illustrator, so the generate-stories Edge Function and the unit tests (with mocks)
// run exactly the same code. Only .ts imports from this folder and shared/places (Deno loads it too).
import { COMING_UP_DAYS, DEDUPE_DAYS, IMAGE_CALL_COST, MIN_GROUP_SIZE, STORIES_PER_RUN, VALID_DAYS, WIKIPEDIA_PER_RUN } from './config.ts';
import { dietTags } from './diet.ts';
import type { FactBundle, HolidayFact, LovedFact, PlaceFact, TopicRow, WeatherDay, WikiFact } from './facts.ts';
import { illustrationPrompt, storySystemPrompt, storyUserPrompt } from './prompt.ts';
import {
  AUTO_APPROVED_TYPES,
  PLACE_TYPES,
  STORY_TYPES,
  parseGenerated,
  storySchema,
  type Audience,
  type ImageKind,
  type Slide,
  type StoryAction,
  type StorySource,
  type StoryType,
} from './schema.ts';

export { DEDUPE_DAYS };

/** Writes one story's text. Returns the raw model output (JSON expected). */
export type StoryModel = { name: string; generate: (input: { system: string; prompt: string }) => Promise<string> };
/** Makes an illustration and returns its public https URL (or null when it couldn't). */
export type Illustrator = { generate: (prompt: string, key: string) => Promise<string | null> };
/** Model calls allowed this run; shared across cities so the whole run has one limit. */
export type Budget = { maxCalls: number; used: number };

export type GenerationInput = {
  city: { city: string; cityZh: string };
  language: { code: string; name: string };
  now: Date;
  facts: FactBundle;
  topics: TopicRow[];
  /** Dedupe keys (story topics and place:<id>) used in this city in the last DEDUPE_DAYS days. */
  recentKeys: Set<string>;
  holidays: HolidayFact[];
  weather: WeatherDay[] | null;
  spotlight: PlaceFact[];
  loved: LovedFact[];
  /** Wikipedia articles fetched for tonight's culture topics (see wikipediaTopics). */
  wikipedia?: WikiFact[];
  model: StoryModel;
  illustrate?: Illustrator;
  budget: Budget;
  autoApproveAll: boolean;
  perType?: Partial<Record<StoryType, number>>;
};

/** A row for public.stories (id and created_at are left to the database). */
export type NewStory = {
  type: StoryType;
  city: string;
  nationality: string | null;
  audience: Audience;
  language: string;
  title: string;
  slides: Slide[];
  action: StoryAction;
  place_id: string | null;
  topics: string[];
  sources: StorySource[];
  status: 'draft' | 'approved';
  valid_from: string;
  valid_until: string;
  generated_by_model: string;
  attribution: string | null;
};

export type GenerationError = { city: string; language: string; type: StoryType; key: string; error: string; output?: string };

export type GenerationResult = { stories: NewStory[]; errors: GenerationError[]; rejected: number; stopped: 'cost_limit' | null };

type Candidate = {
  type: StoryType;
  /** Dedupe key: the same key isn't written about again in this city within DEDUPE_DAYS. */
  key: string;
  /** The story_topics id this story is about (what "Not interested in this topic" mutes). */
  topicId: string;
  facts: string[];
  sources: StorySource[];
  extraTopics: string[];
  action: StoryAction;
  slides: 3 | 4;
  images: { url: string | null; kind: ImageKind; credit?: string }[];
  illustration?: string;
  /** Credit shown on the story, e.g. for Wikipedia text. */
  attribution?: string;
  audience: Audience;
  nationality: string | null;
  placeId: string | null;
};

const DAY = 86_400_000;
const CHINA_OFFSET_MS = 8 * 3_600_000;
const chinaDate = (d: Date) => new Date(d.getTime() + CHINA_OFFSET_MS).toISOString().slice(0, 10);
const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const trim = (text: string, max = 1200) => (text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text);

/** Same order all night for a city, a different one tomorrow, so topics rotate. */
function shuffle<T>(list: T[], seed: string, keyOf: (item: T) => string) {
  const h = (s: string) => {
    let x = 2166136261;
    for (const ch of s) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
    return x >>> 0;
  };
  return [...list].sort((a, b) => h(`${seed}:${keyOf(a)}`) - h(`${seed}:${keyOf(b)}`));
}

function placeAction(p: PlaceFact, label: string): StoryAction {
  return {
    kind: 'navigate',
    label,
    payload: { amap_poi_id: p.amapId, name: p.name, name_zh: p.nameZh, address: p.address, address_zh: p.addressZh, lat: p.lat, lng: p.lng, category: p.category },
  };
}

function placeFacts(p: PlaceFact): string[] {
  return [
    `Name: ${p.name}${p.nameZh && p.nameZh !== p.name ? ` (Chinese: ${p.nameZh})` : ''}`,
    `Type: ${p.category}${p.typeZh ? ` (${p.typeZh})` : ''}`,
    p.address || p.addressZh ? `Address: ${p.address || p.addressZh}` : '',
    p.hours ? `Opening hours (from AMap): ${p.hours}` : '',
    p.rating ? `AMap rating: ${p.rating} out of 5` : '',
    p.cost ? `Typical spend per person: ¥${p.cost}` : '',
    p.tags.length ? `Known for (AMap tags): ${p.tags.join(', ')}` : '',
  ].filter(Boolean);
}

/** Real AMap photos for the slides, in order; slides without one get no image (colour and icon). */
function photoSlides(p: PlaceFact, slides: number) {
  return Array.from({ length: slides }, (_, i) => {
    const url = p.photos[i]?.startsWith('https://') ? p.photos[i] : null;
    return { url, kind: (url ? 'real_photo' : 'none') as ImageKind };
  });
}

const noImages = (slides: number): Candidate['images'] => Array.from({ length: slides }, () => ({ url: null, kind: 'none' as ImageKind }));

/** Wikipedia topics worth fetching tonight: enabled, with an article, not written about recently, rotated daily. */
export function wikipediaTopics(o: { topics: TopicRow[]; recentKeys: Set<string>; city: string; now: Date; limit?: number }) {
  const seed = `${o.city}:${chinaDate(o.now)}`;
  const fresh = o.topics.filter((t) => t.enabled && t.wikipedia && !o.recentKeys.has(t.id) && !o.recentKeys.has(`wiki:${t.wikipedia}`));
  return shuffle(fresh, seed, (t) => t.id)
    .slice(0, o.limit ?? WIKIPEDIA_PER_RUN)
    .map((t) => ({ topicId: t.id, title: t.wikipedia! }));
}

/** Every story this city could get tonight, per type, best first. */
export function candidates(input: GenerationInput): Record<StoryType, Candidate[]> {
  const { facts, city } = input;
  const today = chinaDate(input.now);
  const seed = `${city.city}:${today}`;
  const enabled = new Map(input.topics.filter((t) => t.enabled).map((t) => [t.id, t]));
  const knowledge = (id: string) => facts.knowledge.find((k) => k.id === id);
  const kbSource = (id: string): StorySource[] => {
    const k = knowledge(id);
    return k ? [{ kind: 'knowledge', ref: k.title, facts: trim(k.body, 1500) }] : [];
  };
  const kbFacts = (id: string) => {
    const k = knowledge(id);
    return k ? [`Background (${k.title}): ${trim(k.body, 900)}`] : [];
  };
  const out = Object.fromEntries(STORY_TYPES.map((t) => [t, [] as Candidate[]])) as Record<StoryType, Candidate[]>;

  // ─── Culture from Wikipedia articles (fetched by the caller), first: the widest range of topics ───
  for (const w of input.wikipedia ?? []) {
    if (!enabled.has(w.topicId) || w.extract.length < 200) continue;
    const lines = [`Topic: ${w.title}`, `From the Wikipedia article "${w.title}": ${trim(w.extract, 2200)}`];
    const images = noImages(4);
    if (w.image) images[0] = { url: w.image.url, kind: 'real_photo', credit: w.image.credit };
    out.culture_moment.push({
      type: 'culture_moment',
      key: `wiki:${w.title}`,
      topicId: w.topicId,
      facts: lines,
      sources: [{ kind: 'wikipedia', ref: w.url, facts: trim(w.extract, 2000) }],
      extraTopics: [],
      action: { kind: 'ask_more', label: 'Ask Hao more', payload: {} },
      slides: 4,
      images,
      // A free photo from the article is better than an illustration; only draw when there is none.
      illustration: w.image ? undefined : illustrationPrompt({ title: w.title, zh: '', about: trim(w.extract, 200) }),
      attribution: `Based on Wikipedia: “${w.title}” (CC BY-SA 4.0)`,
      audience: 'all',
      nationality: null,
      placeId: null,
    });
  }

  // ─── Crafts and skills Hao teaches step by step ────────────────────────────
  for (const craft of shuffle(facts.crafts, seed, (c) => c.id)) {
    const topicId = `craft:${craft.id}`;
    if (!enabled.has(topicId)) continue;
    const lines = [
      `Skill: ${craft.title} (Chinese: ${craft.zh}, pinyin: ${craft.pinyin})`,
      `About: ${craft.about}`,
      `You need: ${craft.materials.join('; ')}`,
      ...craft.steps.map((step, i) => `Step ${i + 1}: ${step}`),
      ...craft.tips.map((tip) => `Tip: ${tip}`),
      craft.whereToTry ? `Where to try it: ${craft.whereToTry}` : '',
    ].filter(Boolean);
    out.learn_how.push({
      type: 'learn_how',
      key: topicId,
      topicId,
      facts: lines,
      sources: [{ kind: 'craft', ref: craft.id, facts: lines.join(' ') }],
      extraTopics: [],
      action: { kind: 'learn_with_hao', label: 'Learn with Hao', payload: { craft: craft.id, title: craft.title } },
      slides: 4,
      images: noImages(4),
      illustration: illustrationPrompt({ title: craft.title, zh: craft.zh, about: craft.about }),
      audience: 'all',
      nationality: null,
      placeId: null,
    });
  }

  // ─── Culture and etiquette, from the curated items ─────────────────────────
  for (const item of shuffle(facts.culture, seed, (c) => c.id)) {
    const topic = enabled.get(item.id);
    if (!topic) continue;
    const lines = [`Tradition: ${item.title} (Chinese: ${item.zh}, pinyin: ${item.pinyin})`, `About: ${item.body}`, `Tip: ${item.tip}`];
    const source: StorySource = { kind: 'culture', ref: item.id, facts: lines.join(' ') };
    if (item.etiquette || topic.category === 'etiquette') {
      out.etiquette_tip.push({
        type: 'etiquette_tip',
        key: item.id,
        topicId: item.id,
        facts: [...lines, ...kbFacts('culture-etiquette-and-holidays')],
        sources: [source, ...kbSource('culture-etiquette-and-holidays')],
        extraTopics: [],
        action: { kind: 'ask_more', label: 'Ask Hao more', payload: {} },
        slides: 3,
        images: noImages(3),
        audience: 'all',
        nationality: null,
        placeId: null,
      });
    } else {
      out.culture_moment.push({
        type: 'culture_moment',
        key: item.id,
        topicId: item.id,
        facts: lines,
        sources: [source],
        extraTopics: [],
        action: { kind: 'ask_more', label: 'Ask Hao more', payload: {} },
        slides: 4,
        images: noImages(4),
        illustration: illustrationPrompt({ title: item.title, zh: item.zh, about: item.body }),
        audience: 'all',
        nationality: null,
        placeId: null,
      });
    }
  }

  // ─── Dishes ────────────────────────────────────────────────────────────────
  for (const dish of shuffle(facts.dishes, seed, (d) => d.id)) {
    if (!enabled.has(dish.id)) continue;
    const tags = dietTags([dish.name, dish.nameZh, dish.description].join(' '));
    if (dish.tags.includes('halal')) tags.push('diet:halal');
    if (dish.tags.includes('vegetarian')) tags.push('diet:vegetarian');
    const diet = [
      dish.tags.includes('halal') ? 'Usually halal.' : '',
      dish.tags.includes('vegetarian') ? 'Vegetarian.' : '',
      tags.includes('contains:pork') ? 'Contains pork.' : '',
      tags.includes('contains:beef') ? 'Contains beef.' : '',
      tags.includes('contains:seafood') ? 'Contains seafood.' : '',
    ].filter(Boolean);
    const lines = [
      `Dish: ${dish.name} (Chinese: ${dish.nameZh}, pinyin: ${dish.pinyin}), from ${dish.region}`,
      `What it is: ${dish.description}`,
      `Spice level: ${['not spicy', 'mild', 'medium spicy', 'very spicy'][dish.spice] ?? 'unknown'}`,
      `Typical price: ${dish.price}`,
      diet.length ? `Diet notes: ${diet.join(' ')}` : 'Diet notes: none given (do not claim it is halal or vegetarian).',
      `How to order: "${dish.orderZh}" means "${dish.orderEn}"`,
    ];
    out.food_to_try.push({
      type: 'food_to_try',
      key: dish.id,
      topicId: dish.id,
      facts: [...lines, ...kbFacts('food-dietary-words-and-ordering-phrases')],
      sources: [{ kind: 'dish', ref: dish.id, facts: lines.join(' ') }, ...kbSource('food-dietary-words-and-ordering-phrases')],
      extraTopics: [...new Set(tags)],
      action: { kind: 'find_food', label: 'Find this food near me', payload: { query: `Where can I eat ${dish.name} (${dish.nameZh}) near me?` } },
      slides: 4,
      // A dish in general, not at a real restaurant, but still no AI food pictures: colour and icon.
      images: noImages(4),
      audience: 'all',
      nationality: null,
      placeId: null,
    });
  }

  // ─── Phrases ───────────────────────────────────────────────────────────────
  for (const phrase of shuffle(facts.phrases, seed, (p) => p.zh)) {
    const topicId = `phrases:${phrase.group}`;
    if (!enabled.has(topicId)) continue;
    const lines = [`Phrase: ${phrase.zh}`, `Pinyin: ${phrase.pinyin}`, `Meaning: ${phrase.en}`, `Topic: ${phrase.groupTitle}`];
    out.phrase_of_the_day.push({
      type: 'phrase_of_the_day',
      key: `phrase:${phrase.zh}`,
      topicId,
      facts: lines,
      sources: [{ kind: 'phrase', ref: phrase.zh, facts: lines.join(' ') }],
      extraTopics: [],
      action: { kind: 'practice_phrase', label: 'Practice with Hao', payload: { zh: phrase.zh, pinyin: phrase.pinyin, en: phrase.en } },
      slides: 3,
      images: noImages(3),
      audience: 'all',
      nationality: null,
      placeId: null,
    });
  }

  // ─── Holidays coming up ────────────────────────────────────────────────────
  if (enabled.has('holiday')) {
    for (const h of input.holidays) {
      const days = daysUntil(today, h.starts_on);
      if (days < 1 || days > COMING_UP_DAYS) continue;
      const festival = facts.festivals.find((f) => f.id === h.id);
      const lines = [
        `Holiday: ${h.name} (Chinese: ${h.name_zh})`,
        `Starts in ${days} day${days === 1 ? '' : 's'}, on ${h.starts_on}${h.ends_on !== h.starts_on ? `, until ${h.ends_on}` : ''}`,
        `Kind: ${h.kind === 'public_holiday' ? 'public holiday (days off)' : 'festival on a normal working day'}`,
        `About: ${h.about}`,
        h.closures ? `What closes: ${h.closures}` : '',
        h.crowds ? `Crowds: ${h.crowds}` : '',
        festival?.tip ? `Tip: ${festival.tip}` : '',
      ].filter(Boolean);
      out.coming_up.push({
        type: 'coming_up',
        key: `holiday:${h.id}:${today}`,
        topicId: 'holiday',
        facts: lines,
        sources: [{ kind: 'holiday', ref: `${h.id}:${h.starts_on}`, facts: lines.join(' ') }],
        extraTopics: [`holiday:${h.id}`],
        action: { kind: 'ask_more', label: 'Ask Hao more', payload: {} },
        slides: 3,
        images: noImages(3),
        audience: 'all',
        nationality: null,
        placeId: null,
      });
    }
  }

  // ─── Weather ───────────────────────────────────────────────────────────────
  if (enabled.has('season:weather') && input.weather?.length) {
    const lines = input.weather.map(
      (d) => `${d.date}: day ${d.dayWeather}, night ${d.nightWeather}, ${d.nightTemp}–${d.dayTemp} °C, wind ${d.wind} (AMap forecast, weather words in Chinese)`
    );
    out.season_tip.push({
      type: 'season_tip',
      key: `season:${today}`,
      topicId: 'season:weather',
      facts: [`City: ${city.city} (${city.cityZh})`, ...lines, ...kbFacts('weather-and-climate-by-region')],
      sources: [{ kind: 'weather', ref: `${city.city}:${today}`, facts: lines.join(' ') }, ...kbSource('weather-and-climate-by-region')],
      extraTopics: [],
      action: { kind: 'ask_more', label: 'Ask Hao more', payload: {} },
      slides: 3,
      images: noImages(3),
      audience: 'all',
      nationality: null,
      placeId: null,
    });
  }

  // ─── Real places ───────────────────────────────────────────────────────────
  const placeTopic = (p: PlaceFact) => (p.category === 'food' ? 'place:food' : 'place:attraction');
  const placeDiet = (p: PlaceFact) => (p.category === 'food' ? dietTags([p.name, p.nameZh, p.typeZh, ...p.tags].join(' ')) : []);
  // Places with photos first: their stories look best.
  const byPhotos = (a: PlaceFact, b: PlaceFact) => Math.min(b.photos.length, 3) - Math.min(a.photos.length, 3);

  for (const p of shuffle(input.spotlight, seed, (x) => x.placeId).sort(byPhotos)) {
    if (!enabled.has(placeTopic(p))) continue;
    const slides = p.photos.length >= 4 ? 4 : 3;
    const lines = placeFacts(p);
    out.place_spotlight.push({
      type: 'place_spotlight',
      key: `place:${p.placeId}`,
      topicId: placeTopic(p),
      facts: lines,
      sources: [{ kind: 'amap_place', ref: p.amapId, facts: lines.join(' ') }],
      extraTopics: placeDiet(p),
      action: placeAction(p, 'Navigate'),
      slides,
      images: photoSlides(p, slides),
      audience: 'all',
      nationality: null,
      placeId: p.placeId,
    });
  }

  for (const p of [...input.loved].sort((a, b) => b.likes / b.visitors - a.likes / a.visitors)) {
    // Small groups could identify people: never used, even if the caller passed them.
    if (p.visitors < MIN_GROUP_SIZE || !enabled.has('community')) continue;
    const lines = [
      ...placeFacts(p),
      `${p.visitors} people from ${p.country} who use Hao visited this place, and ${p.likes} of them liked it.`,
    ];
    out.your_people_loved.push({
      type: 'your_people_loved',
      key: `loved:${p.placeId}:${p.nationality}`,
      topicId: 'community',
      facts: lines,
      sources: [
        { kind: 'amap_place', ref: p.amapId, facts: placeFacts(p).join(' ') },
        { kind: 'community_stats', ref: p.nationality, facts: lines[lines.length - 1] },
      ],
      extraTopics: [placeTopic(p), ...placeDiet(p)],
      action: placeAction(p, 'Navigate'),
      slides: 3,
      images: photoSlides(p, 3),
      audience: 'all',
      nationality: p.nationality,
      placeId: p.placeId,
    });
  }

  return out;
}

/** The candidates to write tonight: per type, the first ones not used recently, taken round-robin across types. */
export function pick(input: GenerationInput, all: Record<StoryType, Candidate[]>): Candidate[] {
  const queues = STORY_TYPES.map((type) => {
    const want = input.perType?.[type] ?? STORIES_PER_RUN[type];
    const fresh = all[type].filter((c) => !input.recentKeys.has(c.key) && !(c.placeId && input.recentKeys.has(`place:${c.placeId}`)));
    return fresh.slice(0, want);
  });
  const out: Candidate[] = [];
  const usedPlaces = new Set<string>();
  for (let round = 0; queues.some((q) => q.length > round); round++) {
    for (const q of queues) {
      const c = q[round];
      if (!c) continue;
      // One story per place per night, even across types.
      if (c.placeId && usedPlaces.has(c.placeId)) continue;
      if (c.placeId) usedPlaces.add(c.placeId);
      out.push(c);
    }
  }
  return out;
}

function spend(budget: Budget, cost: number) {
  if (budget.used + cost > budget.maxCalls) return false;
  budget.used += cost;
  return true;
}

/** Generates, validates (retrying once) and returns the night's stories for one city and language. */
export async function generateStories(input: GenerationInput): Promise<GenerationResult> {
  const result: GenerationResult = { stories: [], errors: [], rejected: 0, stopped: null };
  const system = storySystemPrompt(input.language.name);
  const validFrom = input.now.toISOString();

  for (const c of pick(input, candidates(input))) {
    const fail = (error: string, output?: string) => {
      result.rejected++;
      result.errors.push({ city: input.city.city, language: input.language.code, type: c.type, key: c.key, error, output: output?.slice(0, 2000) });
    };

    let story: ReturnType<typeof parseGenerated> | null = null;
    let output = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!spend(input.budget, 1)) {
        result.stopped = 'cost_limit';
        return result;
      }
      const prompt = storyUserPrompt({
        type: c.type,
        city: input.city.city,
        slides: c.slides,
        actionLabel: c.action.label,
        facts: c.facts,
        retryError: story && !story.ok ? story.error : undefined,
      });
      try {
        output = await input.model.generate({ system, prompt });
        story = parseGenerated(output);
      } catch (e) {
        story = { ok: false, error: `Model call failed: ${(e as Error).message}` };
      }
      if (story.ok) break;
    }
    if (!story?.ok) {
      fail(story?.error ?? 'No output', output);
      continue;
    }

    // Images: real photos for places, an optional illustration for culture, otherwise colour and icon.
    const images = [...c.images];
    if (c.illustration && input.illustrate && !PLACE_TYPES.includes(c.type) && spend(input.budget, IMAGE_CALL_COST)) {
      const url = await input.illustrate.generate(c.illustration, `${input.city.city}-${c.key}`).catch(() => null);
      if (url) images[0] = { url, kind: 'ai_illustration' };
    }

    const slides: Slide[] = story.story.slides.map((s, i) => ({
      heading: s.heading,
      body: s.body,
      image_url: images[i]?.url ?? null,
      image_kind: images[i]?.url ? images[i].kind : 'none',
      image_credit: images[i]?.url ? (images[i].credit ?? null) : null,
    }));
    const validUntil = new Date(input.now.getTime() + VALID_DAYS[c.type] * DAY).toISOString();
    const row: NewStory = {
      type: c.type,
      city: input.city.city,
      nationality: c.nationality,
      audience: c.audience,
      language: input.language.code,
      title: story.story.title,
      slides,
      action: { ...c.action, label: story.story.action_label },
      place_id: c.placeId,
      topics: [...new Set([c.topicId, c.key, ...c.extraTopics])].slice(0, 20),
      sources: c.sources,
      status: input.autoApproveAll || AUTO_APPROVED_TYPES.includes(c.type) ? 'approved' : 'draft',
      valid_from: validFrom,
      valid_until: validUntil,
      generated_by_model: input.model.name,
      attribution: c.attribution ?? null,
    };

    // The same check the feed runs, so nothing invalid is ever stored.
    const check = storySchema.safeParse({ ...row, id: 'new' });
    if (!check.success) {
      fail(check.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), output);
      continue;
    }
    result.stories.push(row);
    input.recentKeys.add(c.key);
    if (c.placeId) input.recentKeys.add(`place:${c.placeId}`);
  }
  return result;
}

/** Dedupe keys from recent stories' topics and places (what the Edge Function loads per city). */
export function recentKeysFrom(rows: { topics: string[]; place_id: string | null }[]) {
  const keys = new Set<string>();
  for (const r of rows) {
    for (const t of r.topics) if (!/^(contains|diet|allergen):/.test(t)) keys.add(t);
    if (r.place_id) keys.add(`place:${r.place_id}`);
  }
  return keys;
}
