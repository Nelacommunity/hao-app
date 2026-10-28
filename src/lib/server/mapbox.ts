// Mapbox for API routes: street routes (Directions) and the city at a point (Geocoding). Mapbox works in
// GPS (WGS-84); the app works in GCJ-02, so points are converted both ways.
// Docs: https://docs.mapbox.com/api/navigation/directions/ and https://docs.mapbox.com/api/search/geocoding/
import type { Maneuver, RouteResult, RouteStep } from '@shared/places/route';

import { gcj02ToWgs84, wgs84ToGcj02 } from '@/lib/china-coords';

export class MapboxError extends Error {}

const PROFILE = { foot: 'walking', bike: 'cycling', car: 'driving' } as const;
export type RouteMode = keyof typeof PROFILE;
export const isRouteMode = (v: string): v is RouteMode => v in PROFILE;

function token() {
  const value = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (!value) throw new MapboxError('EXPO_PUBLIC_MAPBOX_TOKEN is not set. Add your Mapbox token to .env and restart Expo.');
  return value;
}

const wgs = (p: { lat: number; lng: number }) => gcj02ToWgs84({ latitude: p.lat, longitude: p.lng });

type MapboxStep = { distance: number; name?: string; maneuver: { type: string; modifier?: string }; geometry: { coordinates: [number, number][] } };
type MapboxRoute = { distance: number; duration: number; legs: { steps: MapboxStep[] }[] };

function maneuverOf(type: string, modifier = ''): Maneuver {
  if (type === 'depart') return 'depart';
  if (type === 'arrive') return 'arrive';
  if (type.includes('roundabout') || type === 'rotary') return 'roundabout';
  if (modifier === 'uturn') return 'uturn';
  if (type === 'fork' || type === 'merge' || type === 'off ramp' || type === 'on ramp') {
    if (modifier.includes('left')) return 'keep-left';
    if (modifier.includes('right')) return 'keep-right';
  }
  const turns: Record<string, Maneuver> = {
    left: 'left', right: 'right', 'slight left': 'slight-left', 'slight right': 'slight-right', 'sharp left': 'sharp-left', 'sharp right': 'sharp-right',
  };
  return turns[modifier] ?? 'straight';
}

/** Street route between two GCJ-02 points, as [lat, lng] pairs (GCJ-02), with turn-by-turn steps. */
export async function route(mode: RouteMode, from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteResult> {
  const a = wgs(from);
  const b = wgs(to);
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${PROFILE[mode]}/${a.longitude},${a.latitude};${b.longitude},${b.latitude}` +
    `?geometries=geojson&steps=true&overview=false&access_token=${encodeURIComponent(token())}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new MapboxError(`Mapbox Directions failed (${res.status})`);
  const data = (await res.json()) as { routes?: MapboxRoute[] };
  const best = data.routes?.[0];
  if (!best) throw new MapboxError('Mapbox found no route');

  const coords: [number, number][] = [];
  const steps: RouteStep[] = [];
  for (const step of best.legs.flatMap((l) => l.steps)) {
    steps.push({ maneuver: maneuverOf(step.maneuver.type, step.maneuver.modifier), road: step.name ?? '', distanceM: step.distance, start: coords.length });
    for (const [lng, lat] of step.geometry.coordinates) {
      const p = wgs84ToGcj02({ latitude: lat, longitude: lng });
      coords.push([p.latitude, p.longitude]);
    }
  }
  return { coords, distanceM: best.distance, durationS: best.duration, steps, source: 'mapbox' };
}

/**
 * Where a GCJ-02 point is, in Chinese: the city (e.g. 北京市; municipalities are their own city) and the most
 * precise area Mapbox knows in China, usually the district (北京市东城区). Both null outside China.
 */
export async function placeAt(lat: number, lng: number): Promise<{ city: string | null; area: string | null }> {
  const p = wgs({ lat, lng });
  const url =
    `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${p.longitude.toFixed(6)}&latitude=${p.latitude.toFixed(6)}` +
    `&types=address,street,locality,place,region&language=zh&access_token=${encodeURIComponent(token())}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new MapboxError(`Mapbox Geocoding failed (${res.status})`);
  type Feature = { properties: { feature_type: string; name: string; full_address?: string; context?: { country?: { country_code?: string } } } };
  const features = ((await res.json()) as { features?: Feature[] }).features ?? [];
  if (!features.some((f) => f.properties.context?.country?.country_code?.toUpperCase() === 'CN')) return { city: null, area: null };
  const of = (type: string) => features.find((f) => f.properties.feature_type === type);
  const city = (of('place') ?? of('region'))?.properties.name || null;
  const precise = features[0]?.properties.full_address?.replace(/^中华人民共和国/, '') || null;
  return { city, area: precise };
}
