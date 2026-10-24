// Creating visits for API routes. The place is looked up on AMap by id (never trusted from the
// client), stored in public.places with the secret key, and the visit is written with the user's JWT.
import type { SupabaseClient } from '@supabase/supabase-js';

import { VISIT_TAGS } from '@shared/places/config';

import type { VisitCardData } from '@/data/place-cards';
import { isPlaceId, type Place } from '@/data/places';
import type { Database } from '@/lib/database.types';
import { placesById, searchAround, searchCity } from '@/lib/server/amap';
import { cachedPlacesById, cachedSearch, snapNearby } from '@/lib/server/place-cache';
import { upsertPlaces } from '@/lib/server/places-db';

type Db = SupabaseClient<Database>;
export type VisitSource = VisitCardData['source'];

export const isVisitSource = (v: unknown): v is VisitSource => v === 'navigation' || v === 'voice_room' || v === 'chat' || v === 'manual';
export const cleanVisitTags = (tags: unknown) =>
  (Array.isArray(tags) ? tags : []).filter((t): t is string => (VISIT_TAGS as readonly string[]).includes(t as string)).slice(0, 5);

export async function placeByAmapId(amapId: string): Promise<Place | null> {
  if (!isPlaceId(amapId)) return null;
  const [place] = await cachedPlacesById([amapId], placesById);
  return place ?? null;
}

/** The best AMap match for a place the user named in chat, near them or in a city. */
export async function placeByName(name: string, where: { location?: { lat: number; lng: number } | null; city?: string | null }): Promise<Place | null> {
  const keywords = name.trim().slice(0, 60);
  if (!keywords) return null;
  if (where.location) {
    const cell = snapNearby(where.location.lat, where.location.lng, 10_000);
    const list = await cachedSearch(`around:${cell.cellKey}:10000:name:${keywords.toLowerCase()}:1`, () =>
      searchAround({ lat: cell.lat, lng: cell.lng, radius: cell.radius, keywords, page: 1 })
    );
    return list[0] ?? null;
  }
  if (where.city) {
    const city = where.city.slice(0, 20);
    const list = await cachedSearch(`city:${city}:name:${keywords.toLowerCase()}:1`, () => searchCity({ city, keywords, page: 1 }));
    return list[0] ?? null;
  }
  return null;
}

type NewVisit = {
  place: Place;
  source: VisitSource;
  status?: 'pending' | 'confirmed';
  rating?: number | null;
  tags?: string[];
  note?: string | null;
};

/**
 * Adds a visit. A pending question for the same place is reused instead of asking twice; a manual
 * confirmed visit to a place already confirmed updates that row (one confirmed visit per place).
 */
export async function createVisit(db: Db, input: NewVisit): Promise<VisitCardData | null> {
  const ids = await upsertPlaces([input.place]);
  const placeId = ids.get(input.place.id);
  if (!placeId) throw new Error('Could not store the place. Is SUPABASE_SECRET_KEY set on the server?');
  const status = input.status ?? 'pending';
  const rating = input.rating === 1 || input.rating === -1 || input.rating === 0 ? input.rating : null;
  const tags = cleanVisitTags(input.tags);

  const existing = await db
    .from('visits')
    .select('id, status, rating, tags, note, visited_at, source')
    .eq('place_id', placeId)
    .eq('status', status)
    .maybeSingle();

  let row = existing.data;
  if (row && status === 'confirmed') {
    const { data, error } = await db.rpc('confirm_visit', { visit_id: row.id, visit_rating: rating, visit_tags: tags });
    if (error) throw error;
    const { error: dateError } = await db.from('visits').update({ visited_at: new Date().toISOString() }).eq('id', data.id);
    if (dateError) throw dateError;
    row = { ...data, visited_at: new Date().toISOString() };
  } else if (row) {
    // Already waiting for an answer: keep any new rating or tags the user just gave.
    if (rating !== null || tags.length) {
      const { data } = await db
        .from('visits')
        .update({ rating: rating ?? row.rating, tags: [...new Set([...row.tags, ...tags])] })
        .eq('id', row.id)
        .select('id, status, rating, tags, note, visited_at, source')
        .single();
      if (data) row = data;
    }
  } else {
    const { data, error } = await db
      .from('visits')
      .insert({ place_id: placeId, source: input.source, status, rating, tags, note: input.note?.slice(0, 1000) || null })
      .select('id, status, rating, tags, note, visited_at, source')
      .single();
    if (error) throw error;
    row = data;
  }

  return {
    visitId: row.id,
    place: input.place,
    status: row.status as VisitCardData['status'],
    rating: row.rating,
    tags: row.tags,
    note: row.note,
    visitedAt: row.visited_at,
    source: row.source as VisitSource,
  };
}
