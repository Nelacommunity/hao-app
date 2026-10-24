// Place search and details from AMap (高德), so the key stays on the server.
//   ?ids=B000A8UIN8,B0FFG…                → those places (up to 10)
//   ?lat&lng[&radius]                      → around a GCJ-02 point, closest first
//   ?city=北京                              → in a city
// plus optional &category=landmark|nature|culture|market|food, &q=keywords and &page.
import { AllCategoryTypes, CategoryMeta, isCategory, isPlaceId } from '@/data/places';
import { authenticate } from '@/lib/server/api';
import { AmapError, placesById, searchAround, searchCity } from '@/lib/server/amap';
import { allow, tooMany } from '@/lib/server/rate-limit';

export async function GET(request: Request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: 'Please sign in to search places.' }, { status: 401 });
  if (!allow(`places:${user.id}`, 60)) return tooMany();

  const params = new URL(request.url).searchParams;
  const category = params.get('category');
  const types = isCategory(category) ? CategoryMeta[category].types : params.get('q') ? undefined : AllCategoryTypes;
  const keywords = params.get('q')?.trim().slice(0, 80) || undefined;
  const page = Math.min(8, Math.max(1, Number(params.get('page')) || 1));

  try {
    const ids = params.get('ids');
    if (ids) {
      const list = ids.split(',').filter(isPlaceId);
      if (!list.length) return Response.json({ error: 'Invalid ids' }, { status: 400 });
      return Response.json({ places: await placesById(list) });
    }

    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lng'));
    if (params.has('lat') && params.has('lng')) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return Response.json({ error: 'Invalid location' }, { status: 400 });
      }
      const radius = Math.min(50_000, Math.max(100, Number(params.get('radius')) || 5000));
      return Response.json({ places: await searchAround({ lat, lng, radius, types, keywords, page }) });
    }

    const city = params.get('city')?.trim().slice(0, 20);
    if (city) return Response.json({ places: await searchCity({ city, types, keywords, page }) });

    return Response.json({ error: 'Pass ids, lat and lng, or city' }, { status: 400 });
  } catch (e) {
    if (e instanceof AmapError) return Response.json({ error: e.message }, { status: 502 });
    console.error('AMap places error', e);
    return Response.json({ error: 'Place search is unavailable right now.' }, { status: 502 });
  }
}
