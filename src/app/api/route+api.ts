// Street-routing proxy for phones that can't reach the public OpenStreetMap router directly (common in mainland China).
const MODES = new Set(['foot', 'bike', 'car']);
const PATH = /^-?\d{1,3}\.\d{1,8},-?\d{1,2}\.\d{1,8};-?\d{1,3}\.\d{1,8},-?\d{1,2}\.\d{1,8}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') ?? '';
  const path = url.searchParams.get('path') ?? '';
  if (!MODES.has(mode) || !PATH.test(path)) return Response.json({ error: 'Invalid mode or path' }, { status: 400 });
  try {
    const upstream = await fetch(`https://routing.openstreetmap.de/routed-${mode}/route/v1/driving/${path}?overview=full&geometries=geojson`, {
      signal: AbortSignal.timeout(8000),
    });
    return Response.json(await upstream.json(), { status: upstream.status });
  } catch {
    return Response.json({ error: 'Routing service unreachable' }, { status: 502 });
  }
}
