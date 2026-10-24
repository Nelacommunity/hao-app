// The city the user is in right now, from GPS (AMap reverse geocoding), so nobody has to type it.
// POST { location: { lat, lng } (GCJ-02) } → { city: "Hangzhou" | null, cityZh: "杭州市" | null }
import { authenticate } from '@/lib/server/api';
import { AmapError, cityAt } from '@/lib/server/amap';
import { cityInEnglish } from '@/lib/server/china-cities';
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
    const cityZh = await cityAt(location.lat, location.lng);
    return Response.json({ city: cityZh ? cityInEnglish(cityZh) : null, cityZh });
  } catch (e) {
    if (e instanceof AmapError) return Response.json({ error: e.message }, { status: 502 });
    console.error('where error', e);
    return Response.json({ error: 'Could not find your city.' }, { status: 500 });
  }
}
