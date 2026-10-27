import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

import type { Maneuver, RouteStep } from '@shared/places/route';

import { tx } from '@/lib/i18n';
import { distanceKm, type Coords } from '@/lib/location';
import { supabase } from '@/lib/supabase';

export type TravelMode = 'foot' | 'bike' | 'car';

export type Route = {
  mode: TravelMode;
  coords: Coords[];
  distanceM: number;
  durationS: number;
  /** True when no routing service was reachable and this is a straight-line estimate. */
  approximate: boolean;
  /** Turn-by-turn steps; `start` indexes into `coords`. */
  steps: RouteStep[];
};

export const TravelModes: { mode: TravelMode; label: string; icon: 'walk' | 'bicycle' | 'car' }[] = [
  { mode: 'foot', label: tx('Walk'), icon: 'walk' },
  { mode: 'bike', label: tx('Bike'), icon: 'bicycle' },
  { mode: 'car', label: tx('Drive'), icon: 'car' },
];

const ALL_MODES: TravelMode[] = ['foot', 'bike', 'car'];

// Typical city speeds for the offline estimate (km/h) and a detour factor for streets vs a straight line.
const SPEED_KMH: Record<TravelMode, number> = { foot: 4.8, bike: 14, car: 25 };
const DETOUR = 1.3;
const MAX_ROUTED_KM: Record<TravelMode, number> = { foot: 40, bike: 80, car: 400 };

async function fetchRoute(params: URLSearchParams, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch(`/api/route?${params}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { coords: [number, number][]; distanceM: number; durationS: number; steps?: RouteStep[] };
  } finally {
    clearTimeout(timer);
  }
}

function estimate(from: Coords, to: Coords, mode: TravelMode): Route {
  const km = distanceKm(from, to) * DETOUR;
  const steps: RouteStep[] = [
    { maneuver: 'depart', road: '', distanceM: km * 1000, start: 0 },
    { maneuver: 'arrive', road: '', distanceM: 0, start: 1 },
  ];
  return { mode, coords: [from, to], distanceM: km * 1000, durationS: (km / SPEED_KMH[mode]) * 3600, approximate: true, steps };
}

/** Street route (GCJ-02, like the places) from AMap or Mapbox, or a straight-line estimate when neither is reachable. */
export async function getRoute(from: Coords, to: Coords, mode: TravelMode): Promise<Route> {
  if (distanceKm(from, to) > MAX_ROUTED_KM[mode]) return estimate(from, to, mode);
  const point = (c: Coords) => `${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`;
  try {
    const route = await fetchRoute(new URLSearchParams({ mode, from: point(from), to: point(to) }), 8000);
    if (route.coords.length < 2) return estimate(from, to, mode);
    return {
      mode,
      coords: route.coords.map(([latitude, longitude]) => ({ latitude, longitude })),
      distanceM: route.distanceM,
      durationS: route.durationS,
      approximate: false,
      steps: route.steps?.length ? route.steps : estimate(from, to, mode).steps.map((st, i) => (i ? { ...st, start: route.coords.length - 1 } : st)),
    };
  } catch {
    return estimate(from, to, mode);
  }
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

/** Routes for `modes` (all by default) from `from` to `to`, refetched only when either end moves by ~100 m. */
export function useDirections(from: Coords | null, to: Coords | null, modes: TravelMode[] = ALL_MODES) {
  const wanted = modes.join(',');
  const key = from && to ? [from.latitude, from.longitude, to.latitude, to.longitude].map((n) => n.toFixed(3)).join(',') + wanted : null;
  const [result, setResult] = useState<{ key: string; routes: Partial<Record<TravelMode, Route>> } | null>(null);

  useEffect(() => {
    if (!key || !from || !to) return;
    let cancelled = false;
    for (const mode of wanted.split(',') as TravelMode[]) {
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
  return { routes, loading: !!key && Object.keys(routes).length < modes.length };
}

// ─── In-app navigation ───────────────────────────────────────────────────────

/** How each manoeuvre is said, in English; the app translates it. */
export const ManeuverText: Record<Maneuver, string> = {
  depart: tx('Head off'),
  straight: tx('Continue straight'),
  left: tx('Turn left'),
  right: tx('Turn right'),
  'slight-left': tx('Bear left'),
  'slight-right': tx('Bear right'),
  'sharp-left': tx('Turn sharp left'),
  'sharp-right': tx('Turn sharp right'),
  'keep-left': tx('Keep left'),
  'keep-right': tx('Keep right'),
  uturn: tx('Make a U-turn'),
  roundabout: tx('Take the roundabout'),
  arrive: tx('Arrive at your destination'),
};

export type NavProgress = {
  /** Metres from the user to the nearest point of the route. */
  offRouteM: number;
  remainingM: number;
  remainingS: number;
  /** The next manoeuvre ahead, and how far away it is. */
  next: RouteStep | null;
  nextInM: number;
  /** The road the user is on now. */
  currentRoad: string;
  arrived: boolean;
};

const metres = (a: Coords, b: Coords) => distanceKm(a, b) * 1000;

/** Where the user is along `route`: what's next, how far, and whether they've strayed from it. */
export function navProgress(route: Route, here: Coords, destination: Coords): NavProgress {
  const pts = route.coords;
  // Nearest point on the line (vertex or along a segment), in a flat local projection: fine at city scale.
  const kx = Math.cos((here.latitude * Math.PI) / 180) * 111_320;
  const ky = 110_540;
  let best = { d: Infinity, seg: 0, t: 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i].longitude * kx, ay = pts[i].latitude * ky;
    const bx = pts[i + 1].longitude * kx, by = pts[i + 1].latitude * ky;
    const px = here.longitude * kx, py = here.latitude * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d < best.d) best = { d, seg: i, t };
  }
  if (pts.length < 2) best = { d: pts.length ? metres(here, pts[0]) : 0, seg: 0, t: 0 };

  // Distance left: the rest of the current segment, then every later one.
  let remainingM = pts.length > 1 ? metres(pts[best.seg], pts[best.seg + 1]) * (1 - best.t) : 0;
  const along: number[] = new Array(pts.length).fill(0); // metres from the user to each later vertex
  for (let i = best.seg + 1; i < pts.length; i++) {
    along[i] = i === best.seg + 1 ? remainingM : along[i - 1] + metres(pts[i - 1], pts[i]);
  }
  for (let i = best.seg + 2; i < pts.length; i++) remainingM += metres(pts[i - 1], pts[i]);

  const next = route.steps.find((st) => st.start > best.seg) ?? null;
  const current = [...route.steps].reverse().find((st) => st.start <= best.seg);
  const toEnd = metres(here, destination);
  return {
    offRouteM: best.d,
    remainingM,
    remainingS: route.distanceM > 0 ? route.durationS * Math.min(1, remainingM / route.distanceM) : 0,
    next,
    nextInM: next ? along[next.start] || metres(here, pts[next.start]) : remainingM,
    currentRoad: current?.road ?? '',
    arrived: toEnd < 30 || remainingM < 20,
  };
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

/** Amap's universal link opens the app when installed (best in mainland China), otherwise its web map. `to` is GCJ-02. */
export function openInMaps(app: MapsApp, to: Coords & { name: string }, mode: TravelMode) {
  const name = encodeURIComponent(to.name);
  const url = {
    amap: `https://uri.amap.com/navigation?to=${to.longitude},${to.latitude},${name}&mode=${AMAP_MODE[mode]}&coordinate=gaode&callnative=1&src=hao`,
    apple: `http://maps.apple.com/?daddr=${to.latitude},${to.longitude}&q=${name}&dirflg=${APPLE_FLAG[mode]}`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${to.latitude},${to.longitude}&travelmode=${GOOGLE_MODE[mode]}`,
  }[app];
  return Linking.openURL(url);
}
