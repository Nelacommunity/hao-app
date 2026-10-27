import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { wgs84ToGcj02 } from '@/lib/china-coords';

export type Coords = { latitude: number; longitude: number };
export type LocationStatus = 'unknown' | 'loading' | 'granted' | 'denied' | 'unavailable';

/** Great-circle distance in kilometres. */
export function distanceKm(a: Coords, b: Coords) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

const toGcj = (p: Location.LocationObject): Coords => wgs84ToGcj02({ latitude: p.coords.latitude, longitude: p.coords.longitude });

/**
 * Current position, asked for only when the user wants it (or already granted earlier). Returned in
 * GCJ-02 like AMap's places, routes and tiles, so distances and the map dot line up in China.
 * `watch` keeps it live (the blue dot, navigation); `precise` asks for GPS-level accuracy while it does.
 * Status 'unavailable': allowed, but the phone can't get a fix (location services off, no signal).
 */
export function useCurrentLocation({ askOnMount = false, watch = false, precise = false }: { askOnMount?: boolean; watch?: boolean; precise?: boolean } = {}) {
  const [coords, setCoords] = useState<Coords | null>(null);
  /** Direction of travel in degrees from north, when moving; null otherwise. */
  const [heading, setHeading] = useState<number | null>(null);
  const [status, setStatus] = useState<LocationStatus>('unknown');
  const [canAskAgain, setCanAskAgain] = useState(true);

  const read = useCallback(async () => {
    setStatus('loading');
    let services = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!services && Platform.OS === 'android') {
      // Android can switch location on from a system dialog, without leaving the app.
      await Location.enableNetworkProviderAsync().catch(() => {});
      services = await Location.hasServicesEnabledAsync().catch(() => false);
    }
    if (!services) {
      setStatus('unavailable');
      return;
    }
    // A recent last known fix is instant; refine it with a fresh reading. Neither may hang: a phone indoors
    // or still warming up its GPS can take minutes, so each try is time-boxed and falls back to a coarser one.
    let found = false;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 }).catch(() => null);
    if (last) {
      found = true;
      setCoords(toGcj(last));
    }
    for (const [accuracy, ms] of [
      [Location.Accuracy.Balanced, 10_000],
      [Location.Accuracy.Low, 8_000],
    ] as const) {
      try {
        setCoords(toGcj(await withTimeout(Location.getCurrentPositionAsync({ accuracy }), ms)));
        found = true;
        break;
      } catch {
        // Try the next, coarser reading.
      }
    }
    setStatus(found ? 'granted' : 'unavailable');
  }, []);

  const request = useCallback(async (): Promise<boolean> => {
    const permission = await Location.requestForegroundPermissionsAsync();
    setCanAskAgain(permission.canAskAgain);
    if (!permission.granted) {
      setStatus('denied');
      return false;
    }
    await read();
    return true;
  }, [read]);

  // If permission was granted before, show the location straight away. Screens built around the
  // user's position (askOnMount) ask once when opened; others wait until the user wants it.
  useEffect(() => {
    let cancelled = false;
    Location.getForegroundPermissionsAsync().then((permission) => {
      if (cancelled) return;
      setCanAskAgain(permission.canAskAgain);
      if (permission.granted) read();
      else if (askOnMount && permission.canAskAgain) request();
      // Already refused for good: say so, so the screen can fall back (other screens keep 'unknown').
      else if (askOnMount) setStatus('denied');
    });
    return () => {
      cancelled = true;
    };
  }, [read, request, askOnMount]);

  // Live updates once allowed. A watch also recovers from 'unavailable' as soon as the phone gets a fix.
  const allowed = status === 'granted' || status === 'unavailable';
  useEffect(() => {
    if (!watch || !allowed) return;
    let sub: Location.LocationSubscription | null = null;
    let stopped = false;
    Location.watchPositionAsync(
      precise
        ? { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 1000 }
        : { accuracy: Location.Accuracy.Balanced, distanceInterval: 15 },
      (p) => {
        setCoords(toGcj(p));
        setStatus('granted');
        // Heading is only meaningful while moving.
        const h = p.coords.heading;
        setHeading(h != null && h >= 0 && (p.coords.speed ?? 0) > 0.5 ? h : null);
      }
    )
      .then((s) => (stopped ? s.remove() : (sub = s)))
      .catch(() => {});
    return () => {
      stopped = true;
      sub?.remove();
    };
  }, [watch, precise, allowed]);

  const openSettings = useCallback(() => Linking.openSettings(), []);

  return { coords, heading, status, canAskAgain, request, openSettings };
}
