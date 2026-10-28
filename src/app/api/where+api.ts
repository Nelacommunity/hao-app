// The city the user is in right now, from GPS (Mapbox reverse geocoding), so nobody has to type it.
// POST { location: { lat, lng } (GCJ-02) } → { city: "Hangzhou" | null, cityZh: "杭州市" | null, areaZh: "浙江省杭州市上城区" | null }
// (areaZh is what the SOS sheet reads out to an operator).
import { authenticate } from '@/lib/server/api';
import { cityInEnglish } from '@/lib/server/china-cities';
import { MapboxError, placeAt } from '@/lib/server/mapbox';
import { allow, tooMany } from '@/lib/server/rate-limit';
import { parseLocation } from '@/lib/server/search-places';

export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: 'Please sign in.' }, { status: 401 });
  if (!allow(`where:${user.id}`, 10)) return tooMany();
  const body = await request.json().catch(() => ({}));
  const location = parseLocation(body.location);
  if (!location) return Response.json({ error: 'Send { location: { lat, lng } }' }, { status: 400 });
  try {
    const { city: cityZh, area: areaZh } = await placeAt(location.lat, location.lng);
    return Response.json({ city: cityZh ? cityInEnglish(cityZh) : null, cityZh, areaZh });
  } catch (e) {
    if (e instanceof MapboxError) return Response.json({ error: e.message }, { status: 502 });
    console.error('where error', e);
    return Response.json({ error: 'Could not find your city.' }, { status: 500 });
  }
}
