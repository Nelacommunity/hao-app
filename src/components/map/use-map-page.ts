import { useMemo, useState } from 'react';

import { leafletMapHtml, type MapState, type MapView } from '@/components/map/leaflet-html';
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

/** The AMap page plus the state and camera to push into it, shared by the native and web maps. */
export function useMapPage({ places, center, delta = 0.25, userLocation, selectedId, route, bottomInset = 0 }: PlaceMapProps) {
  const language = useTravellerLanguage();

  // The page is built once; later changes are pushed in.
  const [html] = useState(() =>
    leafletMapHtml({
      lat: center.latitude,
      lng: center.longitude,
      zoom: zoomFor(delta),
      labels: language.code.startsWith('zh') ? 'zh_cn' : 'en',
      accent: '#2576FF',
    })
  );

  const state = useMemo<MapState>(
    () => ({
      places: places.map((p) => ({
        id: p.id,
        lat: p.latitude,
        lng: p.longitude,
        color: CategoryMeta[p.category].color,
        name: p.name,
        selected: p.id === selectedId,
      })),
      user: userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null,
      route: route && route.coords.length > 1 ? { coords: route.coords.map(pair), approximate: route.approximate } : null,
    }),
    [places, selectedId, userLocation, route]
  );

  const view = useMemo<MapView>(() => {
    if (route && route.coords.length > 1) return { kind: 'fit', coords: route.coords.map(pair), bottom: bottomInset };
    const selected = places.find((p) => p.id === selectedId);
    const target = selected ?? center;
    return { kind: 'center', lat: target.latitude, lng: target.longitude, zoom: selected ? zoomFor(0.05) : zoomFor(delta) };
  }, [route, bottomInset, places, selectedId, center, delta]);

  return { html, state, view };
}
