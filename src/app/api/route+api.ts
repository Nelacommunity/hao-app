// Street routes with turn-by-turn steps from Mapbox. Coordinates are GCJ-02.
//   ?mode=foot|bike|car&from=lat,lng&to=lat,lng
import { authenticate } from '@/lib/server/api';
import { isRouteMode, MapboxError, route } from '@/lib/server/mapbox';
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

  try {
    return Response.json(await route(mode, from, to));
  } catch (e) {
    if (e instanceof MapboxError) return Response.json({ error: e.message }, { status: 502 });
    console.error('Mapbox route error', e);
    return Response.json({ error: 'Routing service unreachable' }, { status: 502 });
  }
}
