// Mapbox Directions for API routes: street routes outside mainland China, and the fallback when AMap
// can't route. Mapbox works in GPS (WGS-84); the app works in GCJ-02, so points are converted both ways.
// Docs: https://docs.mapbox.com/api/navigation/directions/
import type { Maneuver, RouteResult, RouteStep } from '@shared/places/route';

import { gcj02ToWgs84, wgs84ToGcj02 } from '@/lib/china-coords';
import type { RouteMode } from '@/lib/server/amap';

const PROFILE: Record<RouteMode, string> = { foot: 'walking', bike: 'cycling', car: 'driving' };

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

export const hasMapbox = () => !!process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

/** Street route between two GCJ-02 points, in the same shape as AMap's. */
export async function mapboxRoute(mode: RouteMode, from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteResult> {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (!token) throw new Error('Mapbox is not configured');
  const wgs = (p: { lat: number; lng: number }) => gcj02ToWgs84({ latitude: p.lat, longitude: p.lng });
  const a = wgs(from);
  const b = wgs(to);
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${PROFILE[mode]}/${a.longitude},${a.latitude};${b.longitude},${b.latitude}` +
    `?geometries=geojson&steps=true&overview=false&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox Directions failed (${res.status})`);
  const data = (await res.json()) as { routes?: MapboxRoute[] };
  const route = data.routes?.[0];
  if (!route) throw new Error('Mapbox found no route');

  const coords: [number, number][] = [];
  const steps: RouteStep[] = [];
  for (const step of route.legs.flatMap((l) => l.steps)) {
    steps.push({ maneuver: maneuverOf(step.maneuver.type, step.maneuver.modifier), road: step.name ?? '', distanceM: step.distance, start: coords.length });
    for (const [lng, lat] of step.geometry.coordinates) {
      const p = wgs84ToGcj02({ latitude: lat, longitude: lng });
      coords.push([p.latitude, p.longitude]);
    }
  }
  return { coords, distanceM: route.distance, durationS: route.duration, steps, source: 'mapbox' };
}
