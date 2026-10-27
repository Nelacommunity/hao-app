// The digital twin ("Hao DNA") for API routes: load it, save what chats capture ("I love this", "I want
// to…"), and community picks — places people from the user's country actually went to and liked.
import type { SupabaseClient } from '@supabase/supabase-js';

import { applyTwinUpdates, dnaChanges, TWIN_COLUMNS, twinFromRow } from '@shared/ai/twin';
import type { PlacesCategory, TwinProfile, TwinUpdates } from '@shared/ai/types';
import { MIN_GROUP_SIZE } from '@shared/places/config';
import { conflictOf, type Reason } from '@shared/places/ranking';

import type { PlaceCardData } from '@/data/place-cards';
import { kindOf, placeFromRow, type Place } from '@/data/places';
import type { Database } from '@/lib/database.types';
import { adminClient } from '@/lib/server/admin';
import { placesById } from '@/lib/server/amap';
import { cachedPlacesById, withDistances } from '@/lib/server/place-cache';
import { localizePlaces, type PlaceLanguage } from '@/lib/server/place-i18n';
import { myRatings, savedIds } from '@/lib/server/places-db';

type Db = SupabaseClient<Database>;

export async function loadTwin(db: Db, userId: string): Promise<TwinProfile | null> {
  const { data } = await db.from('profiles').select(TWIN_COLUMNS).eq('id', userId).maybeSingle();
  return data ? twinFromRow(data) : null;
}

/**
 * Saves what the user just said about themselves (validated) and returns short lines describing the
 * change, for the "Saved to your Hao DNA" chip. Nothing to save: no lines, no write.
 */
export async function captureDna(db: Db, userId: string, updates: TwinUpdates | undefined): Promise<string[]> {
  if (!updates) return [];
  const before = await loadTwin(db, userId);
  if (!before) return [];
  const { profile: after, changed } = applyTwinUpdates(before, updates);
  if (!changed.length) return [];
  const { error } = await db
    .from('profiles')
    .update({
      nationality: after.nationality,
      home_city: after.home_city,
      city: after.city,
      traveller_type: after.traveller_type,
      preferences: after.preferences,
      loves: after.loves,
      wants: after.wants,
    })
    .eq('id', userId);
  if (error) {
    console.warn('[twin] could not save capture:', error.message);
    return [];
  }
  return dnaChanges(before, after);
}

// ─── Community picks ─────────────────────────────────────────────────────────

export type CommunityScope = 'nearby' | 'city' | 'anywhere';

/** How far "nearby" and "the city" reach, by kind of place. */
const NEARBY_KM: Record<'food' | 'hotel' | 'attraction', number> = { food: 5, hotel: 10, attraction: 30 };
const CITY_KM = 60;

const km = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

type StatRow = {
  visitor_count: number;
  like_count: number;
  places: { id: string; amap_poi_id: string | null; name: string; name_zh: string; category: string; lat: number; lng: number; address: string; tags: string[]; amap_rating: number | null };
};

export type CommunityPicksResult = {
  cards: PlaceCardData[];
  /** Why there are no cards, so the reply can say it honestly. */
  empty: 'no_nationality' | 'no_data' | null;
  nationality: string | null;
};

/**
 * Places people from the user's country (else their region) visited and liked, from the anonymous
 * community stats (groups of MIN_GROUP_SIZE or more only). `anywhere` is all of China: weekend and
 * holiday ideas. Places that clash with the user's diet or allergies are left out.
 */
export async function communityPicks(
  db: Db,
  userId: string,
  o: { category: PlacesCategory | ''; scope: CommunityScope; location: { lat: number; lng: number } | null; cityCenter: { lat: number; lng: number } | null; language: PlaceLanguage | null; limit?: number }
): Promise<CommunityPicksResult> {
  const twin = await loadTwin(db, userId);
  const nationality = twin?.nationality ?? null;
  if (!twin || !nationality) return { cards: [], empty: 'no_nationality', nationality };
  const admin = adminClient();
  if (!admin) return { cards: [], empty: 'no_data', nationality };

  const category = o.category === 'hotel' || o.category === 'attraction' ? o.category : 'food';
  const select = 'visitor_count, like_count, places!inner(id, amap_poi_id, name, name_zh, category, lat, lng, address, tags, amap_rating)';
  // Raw stats are never readable by clients; the server reads them and only uses groups of 5+.
  const { data: country } = await admin
    .from('place_country_stats')
    .select(select)
    .eq('nationality', nationality)
    .eq('places.category', category)
    .gte('visitor_count', MIN_GROUP_SIZE)
    .order('like_count', { ascending: false })
    .limit(200);
  let rows: (StatRow & { scope: 'country' | 'region'; region: string | null })[] = ((country ?? []) as unknown as StatRow[]).map((r) => ({ ...r, scope: 'country', region: null }));

  // Too few from their own country: people from their region (e.g. East Africa) too.
  if (rows.length < 3) {
    const { data: group } = await admin.from('country_groups').select('region').eq('nationality', nationality).maybeSingle();
    if (group?.region) {
      const { data: region } = await admin
        .from('region_stats')
        .select(select)
        .eq('region', group.region)
        .eq('places.category', category)
        .gte('visitor_count', MIN_GROUP_SIZE)
        .order('like_count', { ascending: false })
        .limit(200);
      const seen = new Set(rows.map((r) => r.places.id));
      rows = rows.concat(((region ?? []) as unknown as StatRow[]).filter((r) => !seen.has(r.places.id)).map((r) => ({ ...r, scope: 'region' as const, region: group.region })));
    }
  }

  // Where to look. Without a position, "nearby" means the city, and without a city, anywhere.
  const center = o.location ?? o.cityCenter;
  const scope: CommunityScope = o.scope === 'anywhere' || !center ? 'anywhere' : o.location || o.scope === 'city' ? o.scope : 'city';
  const reach = scope === 'nearby' ? NEARBY_KM[category] : CITY_KM;
  const nearby = scope === 'anywhere' || !center ? rows : rows.filter((r) => km(center.lat, center.lng, r.places.lat, r.places.lng) <= reach);

  const fits = nearby
    .filter((r) => r.places.amap_poi_id && r.like_count > 0)
    .filter((r) => {
      const p = r.places;
      return !conflictOf({ id: p.id, name: p.name, nameZh: p.name_zh, kind: kindOf(placeFromRow(p).category), typeZh: '', tags: p.tags }, twin.preferences);
    })
    // Most liked first; ties by share of visitors who liked it.
    .sort((a, b) => b.like_count - a.like_count || b.like_count / b.visitor_count - a.like_count / a.visitor_count)
    .slice(0, o.limit ?? 6);
  if (!fits.length) return { cards: [], empty: 'no_data', nationality };

  // Fresh details and photos from AMap where possible; the stored row otherwise.
  const ids = fits.map((r) => r.places.amap_poi_id!);
  const fresh = await cachedPlacesById(ids, placesById).catch(() => [] as Place[]);
  let places = fits.map((r) => fresh.find((p) => p.id === r.places.amap_poi_id) ?? placeFromRow(r.places));
  if (o.location) places = withDistances(places, o.location.lat, o.location.lng, false);
  const [localized, ratings, saved] = await Promise.all([localizePlaces(places, o.language), myRatings(db), savedIds(db)]);

  const cards = fits.map((r, i) => {
    const reason: Reason =
      r.scope === 'country'
        ? { kind: 'country', count: r.like_count, nationality }
        : { kind: 'region', count: r.like_count, region: r.region!, city: scope === 'anywhere' ? null : twin.city };
    return { place: localized[i], placeId: r.places.id, reason, saved: saved.has(localized[i].id), myRating: ratings.get(localized[i].id) ?? null };
  });
  return { cards, empty: null, nationality };
}
