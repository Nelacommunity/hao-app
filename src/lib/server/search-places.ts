// search_places: AMap search → store in public.places → community stats and the user's profile →
// ranked place cards with one reason line each. Used by /api/search-places and the Places chat.
import type { SupabaseClient } from '@supabase/supabase-js';

import type { PlacesCategory, PlacesFilter } from '@shared/ai/types';
import { Countries, RegionLabels } from '@shared/places/countries';
import { rankPlaces, type RankPlace, type RankProfile, type Reason } from '@shared/places/ranking';

import type { PlaceCardData } from '@/data/place-cards';
import { CategoryMeta, kindOf, type Place } from '@/data/places';
import type { Database } from '@/lib/database.types';
import { searchAround, searchCity } from '@/lib/server/amap';
import { localizePlaces, type PlaceLanguage } from '@/lib/server/place-i18n';
import { cachedSearch, snapNearby, withDistances } from '@/lib/server/place-cache';
import { loadPlaceProfile, myRatings, savedIds, socialProof, upsertPlaces } from '@/lib/server/places-db';

export type SearchPlacesInput = {
  query?: string;
  category?: PlacesCategory | '';
  /** GCJ-02 position of the user. */
  location?: { lat: number; lng: number } | null;
  /** Search a city (or area) instead of around the user. */
  city?: string | null;
  filters?: PlacesFilter[];
  language: PlaceLanguage | null;
  limit?: number;
};

export type SearchPlacesResult = {
  cards: PlaceCardData[];
  /** At least one card is backed by people from the user's country or region. */
  community: boolean;
  needsLocation: boolean;
};

/** AMap POI type codes for each kind of place (高德POI分类编码). */
const TYPES: Record<PlacesCategory, string> = {
  food: CategoryMeta.food.types,
  attraction: [CategoryMeta.landmark.types, CategoryMeta.nature.types, CategoryMeta.culture.types].join('|'),
  shop: CategoryMeta.market.types,
  // 生活服务 (phone shops, post, laundry…), 金融保险服务 (banks/ATMs), 医疗保健服务 (pharmacies, clinics).
  service: '070000|160000|090000',
  hotel: CategoryMeta.hotel.types,
};

/** Food within a short walk; sights are worth a trip. */
const RADIUS: Record<PlacesCategory, number> = { food: 2000, attraction: 15_000, shop: 5000, service: 3000, hotel: 5000 };

const FILTER_KEYWORDS: Partial<Record<PlacesFilter, string>> = { halal: '清真', vegetarian: '素食' };

/** A GCJ-02 point from a request body, or null if missing or invalid. */
export function parseLocation(value: unknown): { lat: number; lng: number } | null {
  const v = value as { lat?: unknown; lng?: unknown } | null | undefined;
  const lat = Number(v?.lat);
  const lng = Number(v?.lng);
  if (!v || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** A reason line in English, for the model writing the reply (the app shows its own translated line). */
export function reasonText(reason: Reason) {
  switch (reason.kind) {
    case 'country':
      return `liked by ${reason.count} people from ${Countries[reason.nationality] ?? reason.nationality}`;
    case 'region':
      return `popular with ${RegionLabels[reason.region] ?? reason.region} students${reason.city ? ` in ${reason.city}` : ''}`;
    case 'profile':
      return `matches the traveller's ${reason.matches.join(' and ')} preferences`;
    case 'rating':
      return `highly rated (${reason.rating})`;
    case 'nearby':
      return 'nearby';
  }
}

const toRankPlace = (p: Place): RankPlace & { source: Place } => ({
  id: p.id,
  name: p.name,
  nameZh: p.nameZh,
  kind: kindOf(p.category),
  typeZh: p.typeZh,
  type: p.type,
  tags: p.tags,
  cost: p.cost,
  rating: p.rating,
  distanceM: p.distanceM,
  source: p,
});

export async function searchPlaces(db: SupabaseClient<Database>, userId: string, input: SearchPlacesInput): Promise<SearchPlacesResult> {
  const category: PlacesCategory = input.category || 'food';
  const filters = input.filters ?? [];
  const keywords = [input.query?.trim(), ...filters.map((f) => FILTER_KEYWORDS[f])].filter(Boolean).join(' ').slice(0, 80) || undefined;
  // A keyword search finds the named thing anywhere; types keep a plain search to the category.
  const types = keywords && input.query?.trim() ? undefined : TYPES[category];
  const what = `places:${category}:${keywords?.toLowerCase() ?? ''}`;

  // 1. AMap (through the shared cache).
  let found: Place[];
  const location = input.location;
  if (input.city) {
    const city = input.city.slice(0, 20);
    found = await cachedSearch(`city:${city}:${what}:1`, () => searchCity({ city, types, keywords, page: 1 }));
  } else if (location) {
    const radius = RADIUS[category];
    const cell = snapNearby(location.lat, location.lng, radius);
    found = await cachedSearch(`around:${cell.cellKey}:${radius}:${what}:1`, () =>
      searchAround({ lat: cell.lat, lng: cell.lng, radius: cell.radius, types, keywords, page: 1 })
    );
    found = withDistances(found, location.lat, location.lng, false);
  } else {
    return { cards: [], community: false, needsLocation: true };
  }

  // 2–3. Store the candidates, then load the user's profile, visits, saved list and community stats.
  const [placeIds, profile, ratings, saved] = await Promise.all([upsertPlaces(found), loadPlaceProfile(db, userId), myRatings(db), savedIds(db)]);
  const proof = await socialProof(placeIds, profile.nationality);

  // 4. Score. What the user asked for in this message overrides their saved preferences.
  const prefs = profile.preferences;
  const diet = new Set(prefs?.diet ?? []);
  if (filters.includes('halal')) diet.add('halal');
  if (filters.includes('vegetarian')) diet.add('vegetarian');
  const rankProfile: RankProfile = {
    nationality: profile.nationality,
    region: profile.region,
    city: profile.city,
    diet: [...diet],
    allergies: prefs?.allergies ?? [],
    spice: filters.includes('spicy') ? 'hot' : filters.includes('not_spicy') ? 'none' : (prefs?.spice ?? 'medium'),
    budget: filters.includes('cheap') ? 'low' : (prefs?.budget ?? 'medium'),
  };
  const ranked = rankPlaces(found.map(toRankPlace), { profile: rankProfile, proof, myRatings: ratings }).slice(0, input.limit ?? 6);

  // 5. Cards in the traveller's language.
  const localized = await localizePlaces(
    ranked.map((r) => r.place.source),
    input.language
  );
  const cards = ranked.map((r, i) => ({
    place: localized[i],
    placeId: placeIds.get(r.place.id) ?? null,
    reason: r.reason,
    saved: saved.has(r.place.id),
    myRating: ratings.get(r.place.id) ?? null,
  }));
  return { cards, community: cards.some((c) => c.reason.kind === 'country' || c.reason.kind === 'region'), needsLocation: false };
}
