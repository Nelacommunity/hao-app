// Discover stories for API routes: today's feed for one user, and a story's facts for chat.
// The ranking itself lives in shared/stories/ranking.ts so it can be replaced on its own.
import type { SupabaseClient } from '@supabase/supabase-js';

import { parsePreferences } from '@shared/ai/preferences';
import { emptyHistory, rankFeed, type FeedHistory, type FeedStory } from '@shared/stories/ranking';
import { storySchema, type Story, type StorySource } from '@shared/stories/schema';

import type { Database } from '@/lib/database.types';

type Db = SupabaseClient<Database>;

const DEFAULT_CITY = 'Beijing';
/** Being this close to a story city counts as being in it. */
const CITY_RADIUS_KM = 120;
const CHINA_OFFSET_MS = 8 * 3_600_000;
const DAY = 86_400_000;

/** Today in China (YYYY-MM-DD) and when it started, as a Date. */
export function chinaDay(now = new Date()) {
  const start = Math.floor((now.getTime() + CHINA_OFFSET_MS) / DAY) * DAY - CHINA_OFFSET_MS;
  return { day: new Date(start + CHINA_OFFSET_MS).toISOString().slice(0, 10), start: new Date(start) };
}

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Where the user is right now if that's a story city, else their profile city, else Beijing. */
async function resolveCity(db: Db, location: { lat: number; lng: number } | null, profileCity: string | null) {
  const { data } = await db.from('story_cities').select('city, city_zh, lat, lng').eq('enabled', true);
  const cities = data ?? [];
  if (location) {
    const near = cities
      .map((c) => ({ city: c.city, d: km(location.lat, location.lng, c.lat, c.lng) }))
      .sort((a, b) => a.d - b.d)[0];
    if (near && near.d <= CITY_RADIUS_KM) return near.city;
  }
  if (profileCity) {
    const p = profileCity.trim().toLowerCase();
    const match = cities.find((c) => c.city.toLowerCase() === p || c.city_zh === profileCity.trim());
    if (match) return match.city;
  }
  return DEFAULT_CITY;
}

/** Completed, hidden and skipped stories, and muted topics, from before today. */
async function loadHistory(db: Db, before: Date): Promise<FeedHistory> {
  const history = emptyHistory();
  const [{ data: events }, { data: muted }] = await Promise.all([
    db.from('story_events').select('story_id, event').in('event', ['complete', 'hide', 'skip']).lt('created_at', before.toISOString()).limit(5000),
    db.from('muted_story_topics').select('topic'),
  ]);
  for (const e of events ?? []) {
    if (e.event === 'complete') history.completed.add(e.story_id);
    else if (e.event === 'hide') history.hidden.add(e.story_id);
    else history.skips.set(e.story_id, (history.skips.get(e.story_id) ?? 0) + 1);
  }
  for (const m of muted ?? []) history.mutedTopics.add(m.topic);
  return history;
}

const FEED_COLUMNS = 'id, type, city, nationality, audience, language, title, slides, action, place_id, topics, valid_until, attribution, interaction, created_at';

/** Today's Discover set for the signed-in user (RLS limits reads to approved, current stories). */
export async function discoverFeed(
  db: Db,
  userId: string,
  o: { language: string; location: { lat: number; lng: number } | null; now?: Date }
): Promise<{ day: string; city: string; stories: Story[] }> {
  const now = o.now ?? new Date();
  const today = chinaDay(now);
  const { data: profile } = await db
    .from('profiles')
    .select('nationality, city, university, traveller_type, preferences')
    .eq('id', userId)
    .maybeSingle();
  const city = await resolveCity(db, o.location, profile?.city ?? null);
  const prefs = parsePreferences(profile?.preferences);

  const [{ data: rows, error }, history] = await Promise.all([
    db
      .from('stories')
      .select(FEED_COLUMNS)
      .or(`city.is.null,city.eq.${JSON.stringify(city)}`)
      .in('language', [...new Set([o.language, 'en'])])
      .order('created_at', { ascending: false })
      .limit(400),
    loadHistory(db, today.start),
  ]);
  if (error) throw error;

  // Anything that doesn't match the schema (a hand edit gone wrong) is left out rather than breaking the feed.
  const valid: (Story & FeedStory)[] = [];
  for (const row of rows ?? []) {
    const parsed = storySchema.safeParse(row);
    if (parsed.success) valid.push({ ...parsed.data, created_at: row.created_at });
    else console.warn('discover: invalid story', row.id, parsed.error.issues[0]?.message);
  }

  const ranked = rankFeed(valid, {
    profile: {
      city,
      nationality: profile?.nationality ?? null,
      audience: profile?.traveller_type ?? (profile?.university ? 'student' : null),
      language: o.language,
      diet: prefs?.diet ?? [],
      allergies: prefs?.allergies ?? [],
    },
    history,
    now,
    seed: `${userId}:${today.day}`,
  });
  return { day: today.day, city, stories: ranked.map(({ created_at: _, ...s }) => s) };
}

/** A story and the facts it was written from, for "Ask Hao more" (only approved, current ones via RLS). */
export async function storyContext(db: Db, storyId: string): Promise<{ story: Story; sources: StorySource[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(storyId)) return null;
  const { data } = await db.from('stories').select(`${FEED_COLUMNS}, sources`).eq('id', storyId).maybeSingle();
  if (!data) return null;
  const parsed = storySchema.safeParse(data);
  if (!parsed.success) return null;
  return { story: parsed.data, sources: Array.isArray(data.sources) ? (data.sources as StorySource[]) : [] };
}

/** Plain-text story context for the chat prompt. */
export function describeStory(ctx: { story: Story; sources: StorySource[] }) {
  const { story, sources } = ctx;
  return [
    `The user opened this Discover story and wants to know more: "${story.title}" (${story.type.replace(/_/g, ' ')}).`,
    ...story.slides.map((s, i) => `Slide ${i + 1}: ${s.heading}. ${s.body}`),
    story.interaction?.quiz
      ? `The story's quiz: ${story.interaction.quiz.question} Answer: ${story.interaction.quiz.choices[story.interaction.quiz.answer]}. ${story.interaction.quiz.why}`
      : '',
    sources.length ? 'Facts the story was written from (answer from these first; say so if something is not covered):' : '',
    ...sources.map((s) => `- [${s.kind}${s.ref ? `: ${s.ref}` : ''}] ${s.facts}`),
  ]
    .filter(Boolean)
    .join('\n');
}

const QUESTION_STOP = new Set(
  'what whats about tell this that these those with from have does when where which there their they will would could should please know more mean means here today tomorrow week china chinese people really'.split(' ')
);
/** Words that point at a kind of story rather than a topic. */
const TYPE_WORDS: { match: RegExp; types: Story['type'][] }[] = [
  { match: /festival|holiday|celebrat|golden week|节/i, types: ['coming_up', 'culture_moment'] },
  { match: /weather|rain|cold|hot|wear|season/i, types: ['season_tip'] },
  { match: /etiquette|polite|rude|manners/i, types: ['etiquette_tip'] },
  { match: /how (do|can|to)|teach|learn|make|craft/i, types: ['learn_how'] },
];

/**
 * A live story that fits a chat question ("What's this festival?"), or null. Simple word overlap with the
 * story's title, headings and topics; only approved, current stories (RLS) in the user's city or everywhere.
 */
export async function relatedStory(db: Db, question: string, o: { city: string | null; language: string }): Promise<Story | null> {
  const words = [...new Set((question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 4 && !QUESTION_STOP.has(w)))];
  const typeHint = TYPE_WORDS.filter((t) => t.match.test(question)).flatMap((t) => t.types);
  if (!words.length && !typeHint.length) return null;

  let query = db.from('stories').select(FEED_COLUMNS).in('language', [...new Set([o.language, 'en'])]).order('created_at', { ascending: false }).limit(100);
  query = o.city ? query.or(`city.is.null,city.eq.${JSON.stringify(o.city)}`) : query.is('city', null);
  const { data } = await query;

  let best: { story: Story; score: number } | null = null;
  for (const row of data ?? []) {
    const parsed = storySchema.safeParse(row);
    if (!parsed.success) continue;
    const s = parsed.data;
    const text = [s.title, ...s.slides.map((x) => x.heading), ...s.topics].join(' ').toLowerCase();
    let score = words.filter((w) => text.includes(w)).length * 2;
    if (typeHint.includes(s.type)) score += 1;
    // A type word alone is enough only for countdowns ("what's this festival?" → the holiday coming up).
    if (score >= 2 || (score === 1 && s.type === 'coming_up')) {
      if (!best || score > best.score) best = { story: s, score };
    }
  }
  return best?.story ?? null;
}
