// Every tunable number for places memory and community ranking, in one place.
// MIN_GROUP_SIZE is also enforced in SQL (get_place_social_proof, supabase/migrations/*_community_stats.sql);
// change both together.

/** Fewest people in a nationality or region group before their counts are shown or used. */
export const MIN_GROUP_SIZE = 5;

/** How much each signal adds to a place's score (signals are 0–1 before weighting). */
export const RANKING_WEIGHTS = {
  /** Like ratio of people from the user's own country. */
  nationality: 3.0,
  /** Like ratio of people from the user's region (e.g. East Africa). */
  region: 1.5,
  /** Diet, budget and spice fit. */
  profile: 2.0,
  /** Closer is better. */
  distance: 1.0,
  /** AMap's own rating, the fallback when nobody we know has been. */
  amapRating: 0.5,
  /** Subtracted when the user has been and gave it a thumbs down. */
  dislikedByMe: 4.0,
} as const;

/** Distance score is 1 up to this many metres away… */
export const DISTANCE_FULL_M = 300;
/** …and falls to 0 at this distance. */
export const DISTANCE_ZERO_M = 5000;

/** A like ratio at least this high can be the reason shown on a card. */
export const REASON_MIN_LIKE_RATIO = 0.5;
/** AMap ratings at least this high give "Highly rated nearby". */
export const HIGH_RATING = 4.3;

/** Spend per person (CNY) that still fits each budget (see BudgetLabels in shared/ai/preferences). */
export const BUDGET_MAX_CNY = { low: 40, medium: 120, high: Infinity } as const;

/** Being this close to a place the user navigated to counts as having gone there. */
export const ARRIVAL_RADIUS_M = 100;
/** Navigation taps older than this are forgotten without asking. */
export const NAVIGATION_MEMORY_HOURS = 48;
/** Unanswered "Did you go?" questions expire after this (pg_cron job in *_places_cron.sql). */
export const PENDING_VISIT_DAYS = 7;

/** Every tag a visit can carry. */
export const VISIT_TAGS = [
  'halal',
  'cheap',
  'like_home',
  'good_for_groups',
  'spicy',
  'clean',
  'quiet',
  'good_location',
  'friendly_staff',
  'great_view',
  'worth_it',
] as const;
export type VisitTag = (typeof VISIT_TAGS)[number];

/** The tag chips offered for each kind of place when confirming or reviewing a visit. */
export const TAGS_FOR: Record<'food' | 'hotel' | 'other', readonly VisitTag[]> = {
  food: ['halal', 'cheap', 'like_home', 'good_for_groups', 'spicy'],
  hotel: ['clean', 'quiet', 'good_location', 'friendly_staff', 'cheap'],
  other: ['worth_it', 'great_view', 'good_for_groups', 'cheap', 'like_home'],
};
