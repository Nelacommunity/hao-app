// public.places and community stats for API routes. Places are written with the secret key (clients
// can only read them); stats are read only through get_place_social_proof. Everything about the user
// (profile, visits, saved places) is read with their own JWT, so row-level security applies.
import type { SupabaseClient } from '@supabase/supabase-js';

import { parsePreferences } from '@shared/ai/preferences';
import type { Preferences } from '@shared/ai/types';
import type { SocialProof } from '@shared/places/ranking';

import { kindOf, type Place } from '@/data/places';
import type { Database } from '@/lib/database.types';
import { adminClient } from '@/lib/server/admin';

type Db = SupabaseClient<Database>;

/**
 * Stores AMap places in public.places (new ones added, names and ratings refreshed) and returns
 * AMap id → places.id. Empty if the server has no secret key configured.
 */
export async function upsertPlaces(list: Place[]): Promise<Map<string, string>> {
  const db = adminClient();
  const ids = new Map<string, string>();
  const unique = [...new Map(list.map((p) => [p.id, p])).values()];
  if (!db || !unique.length) return ids;
  const { data, error } = await db
    .from('places')
    .upsert(
      unique.map((p) => ({
        amap_poi_id: p.id,
        name: p.name.slice(0, 200),
        name_zh: p.nameZh.slice(0, 200),
        category: kindOf(p.category),
        lat: p.latitude,
        lng: p.longitude,
        address: (p.addressZh || p.address).slice(0, 400),
        tags: p.tags.slice(0, 20),
        amap_rating: p.rating ?? null,
      })),
      { onConflict: 'amap_poi_id' }
    )
    .select('id, amap_poi_id');
  if (error) console.warn('[places] could not store places:', error.message);
  for (const row of data ?? []) if (row.amap_poi_id) ids.set(row.amap_poi_id, row.id);
  return ids;
}

export type UserPlaceProfile = {
  nationality: string | null;
  region: string | null;
  city: string | null;
  university: string | null;
  preferences: Preferences | null;
  /** What they love, from their Hao DNA. */
  loves: string[];
};

export async function loadPlaceProfile(db: Db, userId: string): Promise<UserPlaceProfile> {
  const { data } = await db.from('profiles').select('nationality, city, university, preferences, loves').eq('id', userId).maybeSingle();
  const nationality = data?.nationality ?? null;
  const { data: group } = nationality
    ? await db.from('country_groups').select('region').eq('nationality', nationality).maybeSingle()
    : { data: null };
  return {
    nationality,
    region: group?.region ?? null,
    city: data?.city ?? null,
    university: data?.university ?? null,
    preferences: parsePreferences(data?.preferences),
    loves: data?.loves ?? [],
  };
}

/** Community counts for these places (by AMap id), from people of `nationality` and its region. */
export async function socialProof(placeIds: Map<string, string>, nationality: string | null): Promise<Map<string, SocialProof>> {
  const out = new Map<string, SocialProof>();
  const db = adminClient();
  if (!db || !nationality || !placeIds.size) return out;
  const amapByUuid = new Map([...placeIds].map(([amap, uuid]) => [uuid, amap]));
  const { data, error } = await db.rpc('get_place_social_proof', { place_ids: [...placeIds.values()], nationality });
  if (error) console.warn('[places] could not read social proof:', error.message);
  for (const row of data ?? []) {
    const amap = amapByUuid.get(row.place_id);
    if (!amap) continue;
    const entry = out.get(amap) ?? {};
    const stat = { visitors: row.visitor_count, likes: row.like_count, dislikes: row.dislike_count };
    if (row.scope === 'country') entry.country = stat;
    else if (row.region) entry.region = { ...stat, region: row.region };
    out.set(amap, entry);
  }
  return out;
}

/** The user's confirmed ratings, keyed by AMap id. */
export async function myRatings(db: Db): Promise<Map<string, number | null>> {
  const { data } = await db.from('visits').select('rating, places(amap_poi_id)').eq('status', 'confirmed').limit(1000);
  const out = new Map<string, number | null>();
  for (const row of data ?? []) {
    const amap = row.places?.amap_poi_id;
    if (amap) out.set(amap, row.rating);
  }
  return out;
}

/** AMap ids on the user's "Want to go" list. */
export async function savedIds(db: Db): Promise<Set<string>> {
  const { data } = await db.from('saved_places').select('place_id').limit(1000);
  return new Set((data ?? []).map((r) => r.place_id));
}
