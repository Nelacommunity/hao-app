// Picks and orders one day's Discover stories for one user. Simple rules for now; a learned "taste twin"
// ranking can replace rankFeed later without touching the API route or the app. Pure functions, no I/O,
// so the route and the unit tests (ranking.test.ts, `node --test`) share exactly the same logic.
import {
  CITY_BOOST,
  FEED_SIZE,
  FRESH_BOOST,
  FRESH_DAYS,
  JITTER,
  MAX_PER_TYPE,
  MIN_TYPES_PER_FEED,
  NATIONALITY_BOOST,
  SKIP_LIMIT,
  TYPE_WEIGHTS,
} from './config.ts';
import { dietConflict } from './diet.ts';
import type { Audience, StoryType } from './schema.ts';

/** The parts of a story the ranking reads. */
export type FeedStory = {
  id: string;
  type: StoryType;
  city: string | null;
  nationality: string | null;
  audience: Audience;
  language: string;
  topics: string[];
  place_id: string | null;
  created_at: string;
};

export type FeedProfile = {
  city: string;
  nationality: string | null;
  /** Null: the user hasn't said, so both student and tourist stories fit. */
  audience: 'student' | 'tourist' | null;
  language: string;
  diet: string[];
  allergies: string[];
};

/** What the user did before today (today's own events don't change today's set). */
export type FeedHistory = {
  completed: Set<string>;
  hidden: Set<string>;
  skips: Map<string, number>;
  mutedTopics: Set<string>;
};

export const emptyHistory = (): FeedHistory => ({ completed: new Set(), hidden: new Set(), skips: new Map(), mutedTopics: new Set() });

const DAY = 86_400_000;
const FALLBACK_LANGUAGE = 'en';

/** Topics that describe what a story is about (not its diet markers), the ones a user can mute. */
export const subjectTopics = (topics: string[]) => topics.filter((t) => !/^(contains|diet|allergen):/.test(t));

/** Deterministic 0–1 number per (seed, id): the same order all day, a new one tomorrow. */
function jitter(seed: string, id: string) {
  let h = 2166136261;
  for (const ch of `${seed}:${id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/** Why a story is not shown to this user at all, or null. */
export function exclusionOf(story: FeedStory, profile: FeedProfile, history: FeedHistory, language: string): string | null {
  if (story.language !== language) return 'language';
  if (story.city && story.city.toLowerCase() !== profile.city.toLowerCase()) return 'city';
  if (story.nationality && story.nationality !== profile.nationality) return 'nationality';
  if (story.audience !== 'all' && profile.audience && story.audience !== profile.audience) return 'audience';
  if (history.completed.has(story.id)) return 'completed';
  if (history.hidden.has(story.id)) return 'hidden';
  if ((history.skips.get(story.id) ?? 0) >= SKIP_LIMIT) return 'skipped';
  if (subjectTopics(story.topics).some((t) => history.mutedTopics.has(t))) return 'muted';
  const diet = dietConflict(story.topics, profile.diet, profile.allergies);
  if (diet) return `diet:${diet}`;
  return null;
}

export function scoreStory(story: FeedStory, profile: FeedProfile, now: Date, seed: string) {
  let score = TYPE_WEIGHTS[story.type];
  if ((story.type === 'your_people_loved' || story.type === 'home_and_china') && story.nationality && story.nationality === profile.nationality) score += NATIONALITY_BOOST;
  if (story.city) score += CITY_BOOST;
  const ageDays = Math.max(0, (now.getTime() - new Date(story.created_at).getTime()) / DAY);
  score += FRESH_BOOST * Math.max(0, 1 - ageDays / FRESH_DAYS);
  return score + JITTER * jitter(seed, story.id);
}

/**
 * Orders stories so no two of the same type are next to each other. When one type has more than the
 * others can separate, it is taken as early as allowed; what still can't be placed is dropped.
 */
export function arrangeByType<T extends { type: StoryType }>(sorted: T[]): T[] {
  const remaining = [...sorted];
  const out: T[] = [];
  while (remaining.length) {
    const last = out[out.length - 1]?.type;
    const counts = new Map<StoryType, number>();
    for (const s of remaining) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
    // A type with more stories than all the others together must go now, or it ends up side by side.
    let forced: StoryType | undefined;
    for (const [type, count] of counts) if (type !== last && count > remaining.length - count) forced = type;
    const index = remaining.findIndex((s) => (forced ? s.type === forced : s.type !== last));
    if (index < 0) break;
    out.push(remaining.splice(index, 1)[0]);
  }
  return out;
}

/** Today's set for one user: filtered, scored, mixed (at least MIN_TYPES_PER_FEED types) and ordered. */
export function rankFeed<T extends FeedStory>(
  stories: T[],
  ctx: { profile: FeedProfile; history: FeedHistory; now: Date; seed: string; limit?: number }
): T[] {
  const limit = ctx.limit ?? FEED_SIZE;
  // Stories in the user's language when there are any, otherwise English.
  const language = stories.some((s) => s.language === ctx.profile.language) ? ctx.profile.language : FALLBACK_LANGUAGE;

  const seenPlaces = new Set<string>();
  const scored = stories
    .filter((s) => !exclusionOf(s, ctx.profile, ctx.history, language))
    .map((story) => ({ story, score: scoreStory(story, ctx.profile, ctx.now, ctx.seed) }))
    .sort((a, b) => b.score - a.score || a.story.id.localeCompare(b.story.id))
    // One story per place in a set.
    .filter(({ story }) => {
      if (!story.place_id) return true;
      if (seenPlaces.has(story.place_id)) return false;
      seenPlaces.add(story.place_id);
      return true;
    });

  // The best story of each of the strongest types goes in first, so the set is mixed.
  const picked = new Set<T>();
  const leaders = new Map<StoryType, T>();
  for (const { story } of scored) if (!leaders.has(story.type)) leaders.set(story.type, story);
  for (const story of [...leaders.values()].slice(0, MIN_TYPES_PER_FEED)) picked.add(story);

  const perType = new Map<StoryType, number>();
  for (const s of picked) perType.set(s.type, (perType.get(s.type) ?? 0) + 1);
  for (const { story } of scored) {
    if (picked.size >= limit) break;
    if (picked.has(story)) continue;
    const n = perType.get(story.type) ?? 0;
    if (n >= MAX_PER_TYPE) continue;
    picked.add(story);
    perType.set(story.type, n + 1);
  }

  const order = new Map(scored.map(({ story }, i) => [story, i]));
  const sorted = [...picked].sort((a, b) => order.get(a)! - order.get(b)!);
  return arrangeByType(sorted).slice(0, limit);
}
