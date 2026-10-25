// Street routes with turn-by-turn steps: AMap (高德) in mainland China, Mapbox elsewhere and when AMap
// can't route. Coordinates are GCJ-02.
//   ?mode=foot|bike|car&from=lat,lng&to=lat,lng
import { authenticate } from '@/lib/server/api';
import { AmapError, isRouteMode, route } from '@/lib/server/amap';
import { hasMapbox, mapboxRoute } from '@/lib/server/mapbox';
import { allow, tooMany } from '@/lib/server/rate-limit';

const POINT = /^(-?\d{1,2}\.\d{1,8}),(-?\d{1,3}\.\d{1,8})$/;

function point(value: string | null) {
  const m = value?.match(POINT);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

export async function GET(request: Request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: 'Please sign in to get directions.' }, { status: 401 });
  if (!allow(`route:${user.id}`, 60)) return tooMany();

  const params = new URL(request.url).searchParams;
  const mode = params.get('mode') ?? '';
  const from = point(params.get('from'));
  const to = point(params.get('to'));
  if (!isRouteMode(mode) || !from || !to) return Response.json({ error: 'Invalid mode, from or to' }, { status: 400 });

  // AMap only covers mainland China (and Hong Kong/Macau); outside it, go straight to Mapbox.
  const inChina = (p: { lat: number; lng: number }) => p.lng > 73.5 && p.lng < 135.1 && p.lat > 18 && p.lat < 53.6;
  if (hasMapbox() && !(inChina(from) && inChina(to))) {
    try {
      return Response.json(await mapboxRoute(mode, from, to));
    } catch (e) {
      console.error('Mapbox route error', e);
    }
  }
  try {
    return Response.json(await route(mode, from, to));
  } catch (e) {
    if (hasMapbox()) {
      try {
        return Response.json(await mapboxRoute(mode, from, to));
      } catch (fallback) {
        console.error('Mapbox route error', fallback);
      }
    }
    if (e instanceof AmapError) return Response.json({ error: e.message }, { status: 502 });
    console.error('AMap route error', e);
    return Response.json({ error: 'Routing service unreachable' }, { status: 502 });
  }
}
