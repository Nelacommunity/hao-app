// AMap (高德) Web Service calls for API routes only. AMAP_KEY stays on the server.
// Docs: https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch
import { categoryOf, type Place } from '@/data/places';

const BASE = 'https://restapi.amap.com';

export class AmapError extends Error {}

// AMap sends an empty array instead of an empty string for missing text fields.
type Text = string | string[] | undefined;
const text = (v: Text) => (typeof v === 'string' ? v.trim() : '');

type AmapPoi = {
  id: string;
  name: string;
  type: Text;
  typecode: Text;
  address: Text;
  location: string;
  pname: Text;
  cityname: Text;
  adname: Text;
  distance?: Text;
  business?: {
    rating?: Text;
    cost?: Text;
    opentime_today?: Text;
    opentime_week?: Text;
    tel?: Text;
    tag?: Text;
    keytag?: Text;
    rectag?: Text;
  };
  photos?: { url?: Text }[];
};

export async function amap<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
  const key = process.env.AMAP_KEY;
  if (!key) throw new AmapError('AMAP_KEY is not set. Add your AMap Web Service key to .env and restart Expo.');
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  url.searchParams.set('key', key);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const json = (await res.json()) as T & { status?: string; info?: string; infocode?: string };
  if (json.status !== '1') throw new AmapError(`AMap error: ${json.info ?? res.status} (${json.infocode ?? '?'})`);
  return json;
}

function toPlace(poi: AmapPoi, en?: AmapPoi): Place {
  const [longitude, latitude] = poi.location.split(',').map(Number);
  const b = poi.business ?? {};
  const rating = Number(text(b.rating));
  const cost = Number(text(b.cost));
  const tags = [text(b.tag), text(b.rectag), text(b.keytag)]
    .flatMap((s) => s.split(/[,;，、]/))
    .map((s) => s.trim())
    .filter((s, i, all) => s && all.indexOf(s) === i)
    .slice(0, 8);
  const enName = en ? text(en.name) : '';
  const enAddress = en ? text(en.address) : '';
  return {
    id: poi.id,
    name: enName || poi.name,
    nameZh: poi.name,
    address: enAddress || text(poi.address),
    addressZh: [text(poi.cityname), text(poi.adname), text(poi.address)].filter(Boolean).join(''),
    cityZh: text(poi.cityname),
    districtZh: text(poi.adname),
    category: categoryOf(text(poi.typecode)),
    typeZh: text(poi.type).split('|')[0].split(';').pop() ?? '',
    latitude,
    longitude,
    rating: rating > 0 ? rating : undefined,
    cost: cost > 0 ? cost : undefined,
    hours: text(b.opentime_today) || text(b.opentime_week) || undefined,
    tel: text(b.tel).split(';')[0] || undefined,
    tags,
    // iOS release builds only load https images.
    photos: (poi.photos ?? []).map((p) => text(p.url).replace(/^http:\/\//, 'https://')).filter(Boolean).slice(0, 6),
    distanceM: text(poi.distance) ? Number(text(poi.distance)) : undefined,
  };
}

/**
 * Runs one AMap place query in Chinese (full details) and English (names and addresses for
 * travellers) at the same time. The English half is optional: if it fails, names stay Chinese.
 */
async function query(path: string, params: Record<string, string | undefined>) {
  const [zh, en] = await Promise.all([
    amap<{ pois?: AmapPoi[] }>(path, { ...params, show_fields: 'business,photos' }),
    amap<{ pois?: AmapPoi[] }>(path, { ...params, langCode: 'en' }).catch(() => null),
  ]);
  const english = new Map((en?.pois ?? []).map((p) => [p.id, p]));
  return (zh.pois ?? []).filter((p) => p.location).map((p) => toPlace(p, english.get(p.id)));
}

const lngLat = (lat: number, lng: number) => `${lng.toFixed(6)},${lat.toFixed(6)}`;

export function searchAround(o: { lat: number; lng: number; radius: number; types?: string; keywords?: string; page: number }) {
  return query('/v5/place/around', {
    location: lngLat(o.lat, o.lng),
    radius: String(o.radius),
    types: o.types,
    keywords: o.keywords,
    // Distance order only works with types; a keyword search ranks by relevance.
    sortrule: o.keywords ? 'weight' : 'distance',
    page_size: '25',
    page_num: String(o.page),
  });
}

export function searchCity(o: { city: string; types?: string; keywords?: string; page: number }) {
  return query('/v5/place/text', {
    region: o.city,
    city_limit: 'true',
    types: o.types,
    keywords: o.keywords,
    page_size: '25',
    page_num: String(o.page),
  });
}

/** Up to 10 places by AMap id. */
export function placesById(ids: string[]) {
  return query('/v5/place/detail', { id: ids.slice(0, 10).join('|') });
}

// ─── Routes ──────────────────────────────────────────────────────────────────

type AmapStep = { step_distance?: Text; polyline?: Text; cost?: { duration?: Text } };
type AmapPath = { distance?: Text; cost?: { duration?: Text }; steps?: AmapStep[] };

const ROUTE_PATH = { foot: 'walking', bike: 'bicycling', car: 'driving' } as const;
export type RouteMode = keyof typeof ROUTE_PATH;
export const isRouteMode = (v: string): v is RouteMode => v in ROUTE_PATH;

/** Street route between two GCJ-02 points, as [lat, lng] pairs. */
export async function route(mode: RouteMode, from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const data = await amap<{ route?: { paths?: AmapPath[] } }>(`/v5/direction/${ROUTE_PATH[mode]}`, {
    origin: lngLat(from.lat, from.lng),
    destination: lngLat(to.lat, to.lng),
    show_fields: 'cost,polyline',
  });
  const path = data.route?.paths?.[0];
  if (!path) throw new AmapError('AMap found no route');
  const steps = path.steps ?? [];
  // Polylines are "lng,lat;lng,lat"; read them as a flat list of numbers to be safe.
  const coords: [number, number][] = [];
  for (const step of steps) {
    const nums = text(step.polyline).split(/[;,]/).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) coords.push([nums[i + 1], nums[i]]);
  }
  const stepSeconds = steps.reduce((sum, s) => sum + (Number(text(s.cost?.duration)) || 0), 0);
  return {
    coords,
    distanceM: Number(text(path.distance)) || 0,
    durationS: Number(text(path.cost?.duration)) || stepSeconds,
  };
}
