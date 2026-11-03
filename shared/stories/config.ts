// Every tunable number for Discover stories, in one place. Type-only imports (the Edge Function reads it too).
import type { StoryType } from './schema.ts';

// ─── Feed ────────────────────────────────────────────────────────────────────
/** Stories in one day's set (the feed returns fewer only when there aren't enough). */
export const FEED_SIZE = 18;
/** Each daily set mixes at least this many types (when that many are available). */
export const MIN_TYPES_PER_FEED = 4;
/** No type takes more than this many slots in one set. */
export const MAX_PER_TYPE = 5;
/** A story skipped this many times is not shown again. */
export const SKIP_LIMIT = 2;

/** Base score per type before boosts. */
export const TYPE_WEIGHTS: Record<StoryType, number> = {
  coming_up: 1.2,
  culture_moment: 1.0,
  place_spotlight: 1.0,
  food_to_try: 1.0,
  your_people_loved: 1.0,
  phrase_of_the_day: 0.9,
  etiquette_tip: 0.9,
  season_tip: 0.8,
  learn_how: 1.0,
  did_you_know: 1.1,
  painting: 1.0,
  home_and_china: 1.0,
};
/** Added to your_people_loved and home_and_china stories for the user's own nationality. */
export const NATIONALITY_BOOST = 1.5;
/** Added to stories written for the user's city rather than for everyone. */
export const CITY_BOOST = 0.3;
/** Added to new stories, falling to 0 over FRESH_DAYS. */
export const FRESH_BOOST = 0.3;
export const FRESH_DAYS = 14;
/** Size of the per-user daily random nudge, so equal stories don't always come in the same order. */
export const JITTER = 0.4;

// ─── Generation ──────────────────────────────────────────────────────────────
/** The same topic or place is not written about again for a city within this many days. */
export const DEDUPE_DAYS = 14;
/** How long each type stays in the feed. */
export const VALID_DAYS: Record<StoryType, number> = {
  culture_moment: 14,
  place_spotlight: 14,
  your_people_loved: 14,
  food_to_try: 14,
  phrase_of_the_day: 1,
  etiquette_tip: 7,
  // Both are rewritten daily: the countdown and the forecast change every day.
  coming_up: 1,
  season_tip: 1,
  learn_how: 14,
  did_you_know: 14,
  painting: 21,
  home_and_china: 21,
};
/** Stories generated per city and language each night, by type. */
export const STORIES_PER_RUN: Record<StoryType, number> = {
  culture_moment: 2,
  place_spotlight: 2,
  your_people_loved: 2,
  food_to_try: 2,
  phrase_of_the_day: 1,
  etiquette_tip: 1,
  coming_up: 1,
  season_tip: 1,
  learn_how: 1,
  did_you_know: 2,
  painting: 1,
  // One per nationality with users in Hao (see HOME_NATIONALITIES_PER_RUN), at most this many a night.
  home_and_china: 4,
};
/** Wikipedia articles fetched per city each night (for culture_moment and did_you_know stories). */
export const WIKIPEDIA_PER_RUN = 3;
/** Painting articles fetched per city each night. */
export const PAINTINGS_PER_RUN = 1;
/** Nationalities (most users first) that get a "your country and China" article each night. */
export const HOME_NATIONALITIES_PER_RUN = 6;
/** coming_up looks this many days ahead for holidays. */
export const COMING_UP_DAYS = 21;
/** Fewest people in a nationality group before their stats can be used (same as places, MIN_GROUP_SIZE). */
export const MIN_GROUP_SIZE = 5;
/** Default per-run spend limit in model calls (text + image); override with STORIES_MAX_CALLS. */
export const DEFAULT_MAX_CALLS = 120;
/** Image generation counts as this many text calls toward the limit. */
export const IMAGE_CALL_COST = 4;
