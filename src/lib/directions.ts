import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { tx } from '@/lib/i18n';
import { distanceKm, type Coords } from '@/lib/location';

export type TravelMode = 'foot' | 'bike' | 'car';

export type Route = {
  mode: TravelMode;
  coords: Coords[];
  distanceM: number;
  durationS: number;
  /** True when no routing service was reachable and this is a straight-line estimate. */
  approximate: boolean;
};

export const TravelModes: { mode: TravelMode; label: string; icon: 'walk' | 'bicycle' | 'car' }[] = [
  { mode: 'foot', label: tx('Walk'), icon: 'walk' },
  { mode: 'bike', label: tx('Bike'), icon: 'bicycle' },
  { mode: 'car', label: tx('Drive'), icon: 'car' },
];

// Typical city speeds for the offline estimate (km/h) and a detour factor for streets vs a straight line.
const SPEED_KMH: Record<TravelMode, number> = { foot: 4.8, bike: 14, car: 25 };
const DETOUR = 1.3;
const MAX_ROUTED_KM: Record<TravelMode, number> = { foot: 40, bike: 80, car: 400 };

const OSRM = 'https://routing.openstreetmap.de';

type OsrmResponse = {
  code: string;
  routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
};

async function fetchJson(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as OsrmResponse;
  } finally {
    clearTimeout(timer);
  }
}

function estimate(from: Coords, to: Coords, mode: TravelMode): Route {
  const km = distanceKm(from, to) * DETOUR;
  return { mode, coords: [from, to], distanceM: km * 1000, durationS: (km / SPEED_KMH[mode]) * 3600, approximate: true };
}

/**
 * Street route from OpenStreetMap data. Phones in mainland China may not reach the public server,
 * so it falls back to the app's own /api/route proxy, then to a straight-line estimate.
 */
export async function getRoute(from: Coords, to: Coords, mode: TravelMode): Promise<Route> {
  if (distanceKm(from, to) > MAX_ROUTED_KM[mode]) return estimate(from, to, mode);
  const path = `${from.longitude.toFixed(6)},${from.latitude.toFixed(6)};${to.longitude.toFixed(6)},${to.latitude.toFixed(6)}`;
  const sources = [
    `${OSRM}/routed-${mode}/route/v1/driving/${path}?overview=full&geometries=geojson`,
    `/api/route?mode=${mode}&path=${encodeURIComponent(path)}`,
  ];
  for (const url of sources) {
    try {
      const data = await fetchJson(url, 7000);
      const route = data.routes?.[0];
      if (data.code !== 'Ok' || !route) continue;
      return {
        mode,
        coords: route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
        distanceM: route.distance,
        durationS: route.duration,
        approximate: false,
      };
    } catch {
      // Try the next source.
    }
  }
  return estimate(from, to, mode);
}

export function formatDuration(seconds: number) {
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatMeters(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

/** Routes for all modes from `from` to `to`, refetched only when either end moves by ~100 m. */
export function useDirections(from: Coords | null, to: Coords | null) {
  const key = from && to ? [from.latitude, from.longitude, to.latitude, to.longitude].map((n) => n.toFixed(3)).join(',') : null;
  const [result, setResult] = useState<{ key: string; routes: Partial<Record<TravelMode, Route>> } | null>(null);

  useEffect(() => {
    if (!key || !from || !to) return;
    let cancelled = false;
    for (const { mode } of TravelModes) {
      getRoute(from, to, mode).then((route) => {
        if (cancelled) return;
        setResult((prev) => ({ key, routes: { ...(prev?.key === key ? prev.routes : {}), [mode]: route } }));
      });
    }
    return () => {
      cancelled = true;
    };
    // `key` captures every change to the endpoints that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const routes = result && result.key === key ? result.routes : {};
  return { routes, loading: !!key && Object.keys(routes).length < TravelModes.length };
}

// ─── Hand-off to a navigation app for turn-by-turn ───────────────────────────
const AMAP_MODE: Record<TravelMode, string> = { foot: 'walk', bike: 'ride', car: 'car' };
const APPLE_FLAG: Record<TravelMode, string> = { foot: 'w', bike: 'w', car: 'd' };
const GOOGLE_MODE: Record<TravelMode, string> = { foot: 'walking', bike: 'bicycling', car: 'driving' };

export type MapsApp = 'amap' | 'apple' | 'google';

export const MapsApps: { app: MapsApp; label: string }[] = [
  { app: 'amap', label: 'Amap 高德地图' },
  ...(Platform.OS === 'ios' ? [{ app: 'apple' as const, label: 'Apple Maps' }] : []),
  { app: 'google', label: 'Google Maps' },
];

/** Amap's universal link opens the app when installed (best in mainland China), otherwise its web map. */
export function openInMaps(app: MapsApp, to: Coords & { name: string }, mode: TravelMode) {
  const name = encodeURIComponent(to.name);
  const url = {
    amap: `https://uri.amap.com/navigation?to=${to.longitude},${to.latitude},${name}&mode=${AMAP_MODE[mode]}&coordinate=wgs84&callnative=1&src=hao`,
    apple: `http://maps.apple.com/?daddr=${to.latitude},${to.longitude}&q=${name}&dirflg=${APPLE_FLAG[mode]}`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${to.latitude},${to.longitude}&travelmode=${GOOGLE_MODE[mode]}`,
  }[app];
  return Linking.openURL(url);
}
