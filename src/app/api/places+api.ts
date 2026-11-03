// Place search and details from AMap (高德), so the key stays on the server.
//   ?ids=B000A8UIN8,B0FFG…                → those places (up to 10)
//   ?lat&lng[&radius]                      → around a GCJ-02 point, closest first
//   ?city=北京                              → in a city
// plus optional &lang=<app language code> (&langName for a custom language), &category=landmark|nature|culture|market|food, &q=keywords and &page.
// Results go through a shared cache (lib/server/place-cache) so AMap is asked as rarely as possible.
import { AllCategoryTypes, CategoryMeta, isCategory, isPlaceId, type Place } from '@/data/places';
import { authenticate } from '@/lib/server/api';
import { AmapError, placesById, searchAround, searchCity } from '@/lib/server/amap';
import { localizePlaces, placeLanguage } from '@/lib/server/place-i18n';
import { cachedPlacesById, cachedSearch, snapNearby, withDistances } from '@/lib/server/place-cache';
import { allow, tooMany } from '@/lib/server/rate-limit';

/** The traveller's language from ?lang (and ?langName for a custom one); null keeps AMap's English. */
const languageOf = (params: URLSearchParams) => placeLanguage(params.get('lang'), params.get('langName'));

export async function GET(request: Request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: 'Please sign in to search places.' }, { status: 401 });
  if (!allow(`places:${user.id}`, 60)) return tooMany();

  const params = new URL(request.url).searchParams;
  const category = params.get('category');
  const types = isCategory(category) ? CategoryMeta[category].types : params.get('q') ? undefined : AllCategoryTypes;
  const keywords = params.get('q')?.trim().slice(0, 80) || undefined;
  const page = Math.min(8, Math.max(1, Number(params.get('page')) || 1));
  const language = languageOf(params);
  const reply = async (places: Place[]) => Response.json({ places: await localizePlaces(places, language) });
  // Everything besides the area that changes AMap's answer, for the cache key.
  const what = `${isCategory(category) ? category : keywords ? '' : 'all'}:${keywords?.toLowerCase() ?? ''}:${page}`;

  try {
    const ids = params.get('ids');
    if (ids) {
      const list = ids.split(',').filter(isPlaceId);
      if (!list.length) return Response.json({ error: 'Invalid ids' }, { status: 400 });
      return reply(await cachedPlacesById(list, placesById));
    }

    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lng'));
    if (params.has('lat') && params.has('lng')) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return Response.json({ error: 'Invalid location' }, { status: 400 });
      }
      const radius = Math.min(50_000, Math.max(100, Number(params.get('radius')) || 5000));
      const cell = snapNearby(lat, lng, radius);
      const found = await cachedSearch(`around:${cell.cellKey}:${radius}:${what}`, () =>
        searchAround({ lat: cell.lat, lng: cell.lng, radius: cell.radius, types, keywords, page })
      );
      // Keyword searches are ranked by relevance; the rest closest first.
      return reply(withDistances(found, lat, lng, !keywords));
    }

    const city = params.get('city')?.trim().slice(0, 20);
    if (city) {
      return reply(await cachedSearch(`city:${city}:${what}`, () => searchCity({ city, types, keywords, page })));
    }

    return Response.json({ error: 'Pass ids, lat and lng, or city' }, { status: 400 });
  } catch (e) {
    if (e instanceof AmapError) return Response.json({ error: e.message }, { status: 502 });
    console.error('AMap places error', e);
    return Response.json({ error: 'Place search is unavailable right now.' }, { status: 502 });
  }
}
