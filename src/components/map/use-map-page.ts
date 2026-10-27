import Constants from 'expo-constants';
import { useMemo, useState } from 'react';

import { amapMapHtml } from '@/components/map/amap-html';
import { leafletMapHtml, type MapPageOptions, type MapState, type MapView } from '@/components/map/leaflet-html';
import { mapboxMapHtml } from '@/components/map/mapbox-html';
import { getThemeMode } from '@/constants/theme';
import { CategoryMeta, type Place } from '@/data/places';
import { useTravellerLanguage } from '@/lib/language-store';
import { gcj02ToWgs84 } from '@/lib/china-coords';
import type { Coords } from '@/lib/location';
import { webBaseUrl } from '@/lib/rooms/session';

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

type Engine = 'mapbox' | 'amap';

// Everything the app holds (AMap places and routes, the user's converted GPS fix) is GCJ-02, the system
// AMap's tiles use, so points go onto AMap unchanged. Mapbox tiles are GPS (WGS-84): points are shifted back.
const toMap = (engine: Engine, p: Coords) => (engine === 'mapbox' ? gcj02ToWgs84(p) : p);
const pairOn = (engine: Engine) => (p: Coords): [number, number] => {
  const q = toMap(engine, p);
  return [q.latitude, q.longitude];
};
const pointOn = (engine: Engine, p: Coords) => {
  const q = toMap(engine, p);
  return { lat: q.latitude, lng: q.longitude };
};
const zoomFor = (delta: number) => Math.round(Math.log2(360 / delta) + 0.5);

// AMap JS API key (Web端). Its security code stays on the server: the map calls AMap through our proxy
// (src/app/api/_AMapService). Without the key, or a server to reach, the map falls back to AMap's raster
// tiles drawn with Leaflet.
const JS_KEY = process.env.EXPO_PUBLIC_AMAP_JS_KEY;

/** Where the map page reaches the AMap proxy: the same server as the API routes. */
function amapServiceHost() {
  const origin = webBaseUrl() || (Constants.expoConfig?.extra?.router?.origin as string | undefined) || '';
  return origin ? `${origin.replace(/\/+$/, '')}/api/_AMapService` : '';
}
// The vector map shows other languages only once AMap grants the key multilingual permission (工单).
const MULTILINGUAL = process.env.EXPO_PUBLIC_AMAP_MULTILINGUAL === 'true';

// Mapbox public token (pk.…): travellers who don't read Chinese get Mapbox, labelled in their language.
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
// Languages Mapbox Standard can label in; others get English.
// https://docs.mapbox.com/help/troubleshooting/change-language/
const MAPBOX_LANGUAGES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'vi', 'id', 'th', 'tr', 'pl', 'uk', 'nl', 'sv'];


/** Chinese readers keep AMap (best Chinese labels and coverage); everyone else gets Mapbox when it's configured. */
function engineFor(code: string): Engine {
  return MAPBOX_TOKEN && !vectorLanguage(code).startsWith('zh') ? 'mapbox' : 'amap';
}

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
function mapHtml(options: MapPageOptions, languageCode: string, engine: Engine) {
  if (engine === 'mapbox' && MAPBOX_TOKEN) {
    const base = languageCode.split('-')[0];
    return mapboxMapHtml({ ...options, token: MAPBOX_TOKEN, language: MAPBOX_LANGUAGES.includes(base) ? base : 'en' });
  }
  const vector = vectorLanguage(languageCode);
  const serviceHost = amapServiceHost();
  if (JS_KEY && serviceHost && (MULTILINGUAL || vector.startsWith('zh'))) {
    // Without the permission, Traditional Chinese readers get the Simplified map.
    const labels = MULTILINGUAL ? vector : 'zh';
    return amapMapHtml({ ...options, key: JS_KEY, serviceHost, languageCode: labels });
  }
  return leafletMapHtml(options);
}

/** The map page (Mapbox or AMap) plus the state and camera to push into it, shared by the native and web maps. */
export function useMapPage({ places, center, delta = 0.25, userLocation, selectedId, route, bottomInset = 0, follow }: PlaceMapProps) {
  const language = useTravellerLanguage();
  // Fixed for the page's life, like the page itself.
  const [engine] = useState(() => engineFor(language.code));

  // The page is built once; later changes are pushed in.
  const [html] = useState(() =>
    mapHtml(
      {
        ...pointOn(engine, center),
        zoom: zoomFor(delta),
        labels: vectorLanguage(language.code).startsWith('zh') ? 'zh_cn' : 'en',
        accent: '#2576FF',
        // The page is rebuilt when the theme changes (the app redraws), so this follows it.
        dark: getThemeMode() === 'dark',
      },
      language.code,
      engine
    )
  );

  const state = useMemo<MapState>(
    () => ({
      places: places.map((p) => ({
        id: p.id,
        ...pointOn(engine, p),
        color: CategoryMeta[p.category].color,
        emoji: CategoryMeta[p.category].emoji,
        name: p.name,
        selected: p.id === selectedId,
      })),
      user: userLocation ? pointOn(engine, userLocation) : null,
      route: route && route.coords.length > 1 ? { coords: route.coords.map(pairOn(engine)), approximate: route.approximate } : null,
    }),
    [engine, places, selectedId, userLocation, route]
  );

  // The camera moves only when what it should show changes (a route, a selected place, a new centre),
  // not when search results arrive, so the user's own zoom and panning stay put.
  const selected = places.find((p) => p.id === selectedId);
  const selLat = selected?.latitude;
  const selLng = selected?.longitude;
  const followHeading = follow ? Math.round((follow.heading ?? -1) / 10) * 10 : null;
  const followAt = follow && userLocation ? userLocation : null;
  const view = useMemo<MapView>(() => {
    if (followAt) return { kind: 'follow', ...pointOn(engine, followAt), zoom: 17, bearing: followHeading !== null && followHeading >= 0 ? followHeading : null };
    if (route && route.coords.length > 1) return { kind: 'fit', coords: route.coords.map(pairOn(engine)), bottom: bottomInset };
    if (selLat !== undefined && selLng !== undefined) return { kind: 'center', ...pointOn(engine, { latitude: selLat, longitude: selLng }), zoom: zoomFor(0.05) };
    return { kind: 'center', ...pointOn(engine, center), zoom: zoomFor(delta) };
  }, [engine, followAt, followHeading, route, bottomInset, selLat, selLng, center, delta]);

  return { html, state, view };
}
