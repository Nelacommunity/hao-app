import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { wgs84ToGcj02 } from '@/lib/china-coords';

export type Coords = { latitude: number; longitude: number };
export type LocationStatus = 'unknown' | 'loading' | 'granted' | 'denied';

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

/**
 * Current position, asked for only when the user wants it (or already granted earlier). Returned in
 * GCJ-02 like AMap's places, routes and tiles, so distances and the map dot line up in China.
 */
export function useCurrentLocation({ askOnMount = false }: { askOnMount?: boolean } = {}) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<LocationStatus>('unknown');
  const [canAskAgain, setCanAskAgain] = useState(true);

  const read = useCallback(async () => {
    setStatus('loading');
    // The last known fix is instant; refine it with a fresh reading.
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    if (last) setCoords(wgs84ToGcj02({ latitude: last.coords.latitude, longitude: last.coords.longitude }));
    try {
      const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords(wgs84ToGcj02({ latitude: fresh.coords.latitude, longitude: fresh.coords.longitude }));
    } catch {
      // Keep the last known fix if a fresh one isn't available (e.g. indoors).
    }
    setStatus('granted');
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

  const openSettings = useCallback(() => Linking.openSettings(), []);

  return { coords, status, canAskAgain, request, openSettings };
}
