// search-places: AMap results ranked for the signed-in user by what people from their country and
// region liked, their diet, budget and spice preferences, distance and rating.
// POST { query?, category?: food|attraction|shop|service, location?: { lat, lng } (GCJ-02), city?, filters?, lang?, langName? }
//   → { cards: PlaceCardData[], community: boolean, needs_location: boolean }
import type { PlacesCategory, PlacesFilter } from '@shared/ai/types';
import { PLACES_CATEGORIES, PLACES_FILTERS } from '@shared/ai/prompts';

import { authenticate } from '@/lib/server/api';
import { AmapError } from '@/lib/server/amap';
import { userClient } from '@/lib/server/memory';
import { placeLanguage } from '@/lib/server/place-i18n';
import { allow, tooMany } from '@/lib/server/rate-limit';
import { parseLocation, searchPlaces } from '@/lib/server/search-places';

type Body = {
  query?: unknown;
  category?: unknown;
  location?: unknown;
  city?: unknown;
  filters?: unknown;
  lang?: unknown;
  langName?: unknown;
};

export async function POST(request: Request) {
  const user = await authenticate(request);
  const db = userClient(request);
  if (!user || !db) return Response.json({ error: 'Please sign in to search places.' }, { status: 401 });
  if (!allow(`places:${user.id}`, 60)) return tooMany();

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const result = await searchPlaces(db, user.id, {
      query: typeof body.query === 'string' ? body.query.slice(0, 60) : undefined,
      category: PLACES_CATEGORIES.includes(body.category as string) ? (body.category as PlacesCategory) : 'food',
      location: parseLocation(body.location),
      city: typeof body.city === 'string' ? body.city : null,
      filters: Array.isArray(body.filters) ? body.filters.filter((f): f is PlacesFilter => PLACES_FILTERS.includes(f)) : [],
      language: placeLanguage(body.lang, body.langName),
    });
    return Response.json({ cards: result.cards, community: result.community, needs_location: result.needsLocation });
  } catch (e) {
    if (e instanceof AmapError) return Response.json({ error: e.message }, { status: 502 });
    console.error('search-places error', e);
    return Response.json({ error: 'Place search is unavailable right now.' }, { status: 502 });
  }
}
