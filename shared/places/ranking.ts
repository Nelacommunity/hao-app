// Ranks place candidates for one user: what people from their country and region liked, how well a
// place fits their diet, budget and spice tolerance, distance and AMap's rating. Pure functions, no I/O,
// so the API route and the unit tests (ranking.test.ts, `node --test`) share exactly the same logic.
import type { Budget, DietTag, SpiceLevel } from '../ai/types';
import {
  BUDGET_MAX_CNY,
  DISTANCE_FULL_M,
  DISTANCE_ZERO_M,
  HIGH_RATING,
  MIN_GROUP_SIZE,
  RANKING_WEIGHTS,
  REASON_MIN_LIKE_RATIO,
} from './config.ts';
import { ALLERGEN_PATTERNS, PATTERNS } from './diet-patterns.ts';

export type PlaceKind = 'food' | 'attraction' | 'shop' | 'service' | 'hotel';

/** The parts of a place the ranking reads (a subset of the app's Place). */
export type RankPlace = {
  id: string;
  name: string;
  nameZh: string;
  kind: PlaceKind;
  typeZh: string;
  type?: string;
  tags: string[];
  /** Spend per person in CNY. */
  cost?: number;
  rating?: number;
  distanceM?: number;
};

export type GroupStat = { visitors: number; likes: number; dislikes: number };
export type SocialProof = { country?: GroupStat; region?: GroupStat & { region: string } };

export type RankProfile = {
  nationality: string | null;
  region: string | null;
  city: string | null;
  diet: DietTag[];
  allergies: string[];
  spice: SpiceLevel;
  budget: Budget;
};

export type ProfileMatch = 'halal' | 'vegetarian' | 'vegan' | 'budget' | 'spice';

/** Why a place is recommended, shown as one line on its card. */
export type Reason =
  | { kind: 'country'; count: number; nationality: string }
  | { kind: 'region'; count: number; region: string; city: string | null }
  | { kind: 'profile'; matches: ProfileMatch[] }
  | { kind: 'rating'; rating: number }
  | { kind: 'nearby' };

export type Ranked<T> = { place: T; score: number; reason: Reason };

const textOf = (p: RankPlace) => [p.nameZh, p.name, p.typeZh, p.type ?? '', ...p.tags].join(' ');

/**
 * Why a place must not be suggested to this user at all, or null. Only food places are checked:
 * a halal or vegetarian traveller can still visit a temple next to a barbecue.
 */
export function conflictOf(place: RankPlace, profile: Pick<RankProfile, 'diet' | 'allergies'>): string | null {
  if (place.kind !== 'food') return null;
  const text = textOf(place);
  const diet = new Set(profile.diet);
  const halalFriendly = PATTERNS.halal.test(text);
  if (diet.has('halal') && !halalFriendly && (PATTERNS.pork.test(text) || PATTERNS.alcohol.test(text))) return 'halal';
  if ((diet.has('no_pork') || diet.has('kosher')) && !halalFriendly && PATTERNS.pork.test(text)) return 'no_pork';
  if ((diet.has('vegetarian') || diet.has('vegan')) && !PATTERNS.vegetarian.test(text) && (PATTERNS.meatCentric.test(text) || PATTERNS.pork.test(text))) {
    return 'vegetarian';
  }
  if (diet.has('no_beef') && PATTERNS.beef.test(text)) return 'no_beef';
  if (diet.has('no_seafood') && PATTERNS.seafood.test(text)) return 'no_seafood';
  for (const allergy of profile.allergies) {
    const rule = ALLERGEN_PATTERNS.find((r) => r.match.test(allergy.trim()));
    if (rule?.place.test(text)) return `allergy:${allergy}`;
  }
  return null;
}

/** How well a place fits the user's diet, budget and spice tolerance (0–1), and what matched. */
export function profileMatch(place: RankPlace, profile: RankProfile): { score: number; matches: ProfileMatch[] } {
  const parts: number[] = [];
  const matches: ProfileMatch[] = [];
  const text = textOf(place);

  if (place.kind === 'food') {
    if (profile.diet.includes('halal')) {
      const ok = PATTERNS.halal.test(text);
      parts.push(ok ? 1 : 0.3);
      if (ok) matches.push('halal');
    }
    const veg = profile.diet.includes('vegan') ? 'vegan' : profile.diet.includes('vegetarian') ? 'vegetarian' : null;
    if (veg) {
      const ok = PATTERNS.vegetarian.test(text);
      parts.push(ok ? 1 : 0.4);
      if (ok) matches.push(veg);
    }
    const spicy = PATTERNS.spicy.test(text);
    if (profile.spice === 'hot') {
      parts.push(spicy ? 1 : 0.6);
      if (spicy) matches.push('spice');
    } else if (profile.spice === 'none') {
      parts.push(spicy ? 0.1 : 0.8);
    } else if (profile.spice === 'mild') {
      parts.push(spicy ? 0.4 : 0.8);
    }
  }

  if (place.cost !== undefined && place.cost > 0) {
    const max = BUDGET_MAX_CNY[profile.budget];
    if (place.cost <= max) {
      parts.push(1);
      // "Matches your budget" only says something for a tight budget.
      if (profile.budget !== 'high') matches.push('budget');
    } else {
      parts.push(Math.max(0, 1 - (place.cost - max) / max));
    }
  }

  return { score: parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0.5, matches };
}

export function distanceScore(distanceM: number | undefined) {
  if (distanceM === undefined) return 0.5;
  if (distanceM <= DISTANCE_FULL_M) return 1;
  return Math.max(0, 1 - (distanceM - DISTANCE_FULL_M) / (DISTANCE_ZERO_M - DISTANCE_FULL_M));
}

/** Like ratio of a group, or null when the group is too small to use (or show). */
export function likeRatio(stat: GroupStat | undefined): number | null {
  if (!stat || stat.visitors < MIN_GROUP_SIZE) return null;
  return Math.min(1, stat.likes / stat.visitors);
}

/**
 * Scores and sorts `places` for the user, dropping places that conflict with their diet or allergies.
 * `proof` is keyed by place id (from get_place_social_proof); `myRatings` by place id (their confirmed visits).
 */
export function rankPlaces<T extends RankPlace>(
  places: T[],
  ctx: { profile: RankProfile; proof: Map<string, SocialProof>; myRatings: Map<string, number | null> }
): Ranked<T>[] {
  const w = RANKING_WEIGHTS;
  const ranked: (Ranked<T> & { distance: number })[] = [];

  for (const place of places) {
    if (conflictOf(place, ctx.profile)) continue;
    const proof = ctx.proof.get(place.id) ?? {};
    const country = likeRatio(proof.country);
    const region = likeRatio(proof.region);
    const fit = profileMatch(place, ctx.profile);
    const rating = place.rating ? Math.min(1, place.rating / 5) : 0.6;

    const signals = {
      country: country === null ? 0 : w.nationality * country,
      region: region === null ? 0 : w.region * region,
      profile: w.profile * fit.score,
    };
    let score = signals.country + signals.region + signals.profile + w.distance * distanceScore(place.distanceM) + w.amapRating * rating;
    if (ctx.myRatings.get(place.id) === -1) score -= w.dislikedByMe;

    ranked.push({ place, score, reason: reasonFor(place, proof, ctx.profile, signals, country, region, fit.matches), distance: place.distanceM ?? Infinity });
  }

  return ranked.sort((a, b) => b.score - a.score || a.distance - b.distance).map(({ distance: _, ...r }) => r);
}

/** The strongest signal that is worth saying out loud. */
function reasonFor(
  place: RankPlace,
  proof: SocialProof,
  profile: RankProfile,
  signals: { country: number; region: number; profile: number },
  country: number | null,
  region: number | null,
  matches: ProfileMatch[]
): Reason {
  const options: { value: number; reason: Reason }[] = [];
  if (country !== null && country >= REASON_MIN_LIKE_RATIO && proof.country && profile.nationality) {
    options.push({ value: signals.country, reason: { kind: 'country', count: proof.country.likes, nationality: profile.nationality } });
  }
  if (region !== null && region >= REASON_MIN_LIKE_RATIO && proof.region) {
    options.push({ value: signals.region, reason: { kind: 'region', count: proof.region.likes, region: proof.region.region, city: profile.city } });
  }
  if (matches.length) {
    // Only the part of the profile score that matched counts here, so a weak fit doesn't beat real people.
    options.push({ value: signals.profile * (matches.length / (matches.length + 1)), reason: { kind: 'profile', matches } });
  }
  const best = options.sort((a, b) => b.value - a.value)[0];
  if (best) return best.reason;
  if (place.rating && place.rating >= HIGH_RATING) return { kind: 'rating', rating: place.rating };
  return { kind: 'nearby' };
}
