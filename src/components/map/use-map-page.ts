import { useMemo, useState } from 'react';

import { amapMapHtml } from '@/components/map/amap-html';
import { leafletMapHtml, type MapPageOptions, type MapState, type MapView } from '@/components/map/leaflet-html';
import { getThemeMode } from '@/constants/theme';
import { CategoryMeta, type Place } from '@/data/places';
import { useTravellerLanguage } from '@/lib/language-store';
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
};

// Everything the app holds (AMap places and routes, the user's converted GPS fix) is already
// GCJ-02, the system AMap's tiles use, so points go onto the map unchanged.
const pair = (p: Coords): [number, number] => [p.latitude, p.longitude];
const zoomFor = (delta: number) => Math.round(Math.log2(360 / delta) + 0.5);

// AMap JS API key (Web端) and its security code. Without them the map falls back to AMap's raster
// tiles drawn with Leaflet.
const JS_KEY = process.env.EXPO_PUBLIC_AMAP_JS_KEY;
const SECURITY_CODE = process.env.EXPO_PUBLIC_AMAP_SECURITY_CODE;
// The vector map shows other languages only once AMap grants the key multilingual permission (工单).
const MULTILINGUAL = process.env.EXPO_PUBLIC_AMAP_MULTILINGUAL === 'true';

// Languages the vector map can label in (JS API 2.0 `languageCode`); others get English.
// https://lbs.amap.com/api/javascript-api-v2/guide/map/englishmap
const VECTOR_LANGUAGES = ['es', 'pt', 'fr', 'de', 'th', 'ja', 'ko', 'ar', 'tr', 'it', 'ru', 'ms', 'id', 'vi'];

function vectorLanguage(code: string) {
  if (code === 'zh' || code === 'zh-CN') return 'zh';
  if (code.startsWith('zh') || code === 'yue') return 'zh-Hant';
  const base = code.split('-')[0];
  return VECTOR_LANGUAGES.includes(base) ? base : 'en';
}

/**
 * The vector AMap when it can label in the traveller's language; otherwise the raster tiles, which
 * AMap draws in English for free (better than vector labels a traveller can't read).
 */
function mapHtml(options: MapPageOptions, languageCode: string) {
  const vector = vectorLanguage(languageCode);
  if (JS_KEY && SECURITY_CODE && (MULTILINGUAL || vector.startsWith('zh'))) {
    // Without the permission, Traditional Chinese readers get the Simplified map.
    const labels = MULTILINGUAL ? vector : 'zh';
    return amapMapHtml({ ...options, key: JS_KEY, securityCode: SECURITY_CODE, languageCode: labels });
  }
  return leafletMapHtml(options);
}

/** The AMap page plus the state and camera to push into it, shared by the native and web maps. */
export function useMapPage({ places, center, delta = 0.25, userLocation, selectedId, route, bottomInset = 0 }: PlaceMapProps) {
  const language = useTravellerLanguage();

  // The page is built once; later changes are pushed in.
  const [html] = useState(() =>
    mapHtml(
      {
        lat: center.latitude,
        lng: center.longitude,
        zoom: zoomFor(delta),
        labels: vectorLanguage(language.code).startsWith('zh') ? 'zh_cn' : 'en',
        accent: '#2576FF',
        // The page is rebuilt when the theme changes (the app redraws), so this follows it.
        dark: getThemeMode() === 'dark',
      },
      language.code
    )
  );

  const state = useMemo<MapState>(
    () => ({
      places: places.map((p) => ({
        id: p.id,
        lat: p.latitude,
        lng: p.longitude,
        color: CategoryMeta[p.category].color,
        emoji: CategoryMeta[p.category].emoji,
        name: p.name,
        selected: p.id === selectedId,
      })),
      user: userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null,
      route: route && route.coords.length > 1 ? { coords: route.coords.map(pair), approximate: route.approximate } : null,
    }),
    [places, selectedId, userLocation, route]
  );

  // The camera moves only when what it should show changes (a route, a selected place, a new centre),
  // not when search results arrive, so the user's own zoom and panning stay put.
  const selected = places.find((p) => p.id === selectedId);
  const selLat = selected?.latitude;
  const selLng = selected?.longitude;
  const view = useMemo<MapView>(() => {
    if (route && route.coords.length > 1) return { kind: 'fit', coords: route.coords.map(pair), bottom: bottomInset };
    if (selLat !== undefined && selLng !== undefined) return { kind: 'center', lat: selLat, lng: selLng, zoom: zoomFor(0.05) };
    return { kind: 'center', lat: center.latitude, lng: center.longitude, zoom: zoomFor(delta) };
  }, [route, bottomInset, selLat, selLng, center, delta]);

  return { html, state, view };
}
