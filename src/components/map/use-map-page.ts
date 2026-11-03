import { useMemo, useState } from 'react';

import { mapboxMapHtml, type MapState, type MapView } from '@/components/map/mapbox-html';
import { getThemeMode } from '@/constants/theme';
import { CategoryMeta, type Place } from '@/data/places';
import { useTravellerLanguage } from '@/lib/language-store';
import { gcj02ToWgs84 } from '@/lib/china-coords';
import type { Coords } from '@/lib/location';

export type PlaceMapProps = {
  places: Place[];
  center: Coords;
  /** Span of the visible region in degrees when nothing is selected. */
  delta?: number;
  userLocation?: Coords | null;
  selectedId?: string;
  onSelect: (id: string) => void;
  /** Route to draw from the user to the selected place. */
  route?: { coords: Coords[]; approximate: boolean } | null;
  /** Height covered by UI at the bottom (the sheet), so fitted routes stay visible. */
  bottomInset?: number;
  /** Navigating: the camera follows the user, heading up. */
  follow?: { heading: number | null } | null;
};

// Everything the app holds (places, routes, the user's converted GPS fix) is GCJ-02, the system Chinese
// map data uses. Mapbox tiles are GPS (WGS-84), so points are shifted back before they go on the map.
const pair = (p: Coords): [number, number] => {
  const q = gcj02ToWgs84(p);
  return [q.latitude, q.longitude];
};
const point = (p: Coords) => {
  const q = gcj02ToWgs84(p);
  return { lat: q.latitude, lng: q.longitude };
};
const zoomFor = (delta: number) => Math.round(Math.log2(360 / delta) + 0.5);

// Mapbox public token (pk.…), labelled in the traveller's language.
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
// Languages Mapbox Standard can label in; Chinese readers get Simplified or Traditional, others English.
// https://docs.mapbox.com/help/troubleshooting/change-language/
const MAPBOX_LANGUAGES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'vi', 'id', 'th', 'tr', 'pl', 'uk', 'nl', 'sv'];

function mapLanguage(code: string) {
  if (code === 'zh' || code === 'zh-CN' || code === 'zh-Hans') return 'zh-Hans';
  if (code.startsWith('zh') || code === 'yue') return 'zh-Hant';
  const base = code.split('-')[0];
  return MAPBOX_LANGUAGES.includes(base) ? base : 'en';
}

/** The Mapbox page plus the state and camera to push into it, shared by the native and web maps. */
export function useMapPage({ places, center, delta = 0.25, userLocation, selectedId, route, bottomInset = 0, follow }: PlaceMapProps) {
  const language = useTravellerLanguage();

  // The page is built once; later changes are pushed in.
  const [html] = useState(() =>
    mapboxMapHtml({
      ...point(center),
      zoom: zoomFor(delta),
      accent: '#2576FF',
      // The page is rebuilt when the theme changes (the app redraws), so this follows it.
      dark: getThemeMode() === 'dark',
      token: MAPBOX_TOKEN,
      language: mapLanguage(language.code),
    })
  );

  const state = useMemo<MapState>(
    () => ({
      places: places.map((p) => ({
        id: p.id,
        ...point(p),
        color: CategoryMeta[p.category].color,
        emoji: CategoryMeta[p.category].emoji,
        name: p.name,
        selected: p.id === selectedId,
      })),
      user: userLocation ? point(userLocation) : null,
      route: route && route.coords.length > 1 ? { coords: route.coords.map(pair), approximate: route.approximate } : null,
    }),
    [places, selectedId, userLocation, route]
  );

  // The camera moves only when what it should show changes (a route, a selected place, a new centre),
  // not when search results arrive, so the user's own zoom and panning stay put.
  const selected = places.find((p) => p.id === selectedId);
  const selLat = selected?.latitude;
  const selLng = selected?.longitude;
  const followHeading = follow ? Math.round((follow.heading ?? -1) / 10) * 10 : null;
  const followAt = follow && userLocation ? userLocation : null;
  const view = useMemo<MapView>(() => {
    if (followAt) return { kind: 'follow', ...point(followAt), zoom: 17, bearing: followHeading !== null && followHeading >= 0 ? followHeading : null };
    if (route && route.coords.length > 1) return { kind: 'fit', coords: route.coords.map(pair), bottom: bottomInset };
    if (selLat !== undefined && selLng !== undefined) return { kind: 'center', ...point({ latitude: selLat, longitude: selLng }), zoom: zoomFor(0.05) };
    return { kind: 'center', ...point(center), zoom: zoomFor(delta) };
  }, [followAt, followHeading, route, bottomInset, selLat, selLng, center, delta]);

  return { html, state, view };
}
