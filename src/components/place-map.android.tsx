import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { leafletMapHtml, type MapEvent, type MapState, type MapView } from '@/components/map/leaflet-html';
import type { PlaceMapProps } from '@/components/place-map';
import { CategoryMeta } from '@/data/places';
import { wgs84ToGcj02 } from '@/lib/china-coords';
import { useT } from '@/lib/i18n';
import { useTravellerLanguage } from '@/lib/language-store';
import type { Coords } from '@/lib/location';

export type { PlaceMapProps };

// Same contract as the iOS map, but drawn with Leaflet + Amap tiles in a WebView: Google Maps (what
// react-native-maps uses on Android) needs Google Play services and an API key, and doesn't load in
// mainland China. Our data and GPS are WGS-84; Amap tiles are GCJ-02.
const toMap = (p: Coords): [number, number] => {
  const c = wgs84ToGcj02({ latitude: p.latitude, longitude: p.longitude });
  return [c.latitude, c.longitude];
};
const zoomFor = (delta: number) => Math.round(Math.log2(360 / delta) + 0.5);

export function PlaceMap({ places, center, delta = 0.25, userLocation, selectedId, onSelect, route, bottomInset = 0 }: PlaceMapProps) {
  const t = useT();
  const language = useTravellerLanguage();
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  // The page is built once; later changes are pushed in with injectJavaScript.
  const [html] = useState(() => {
    const [lat, lng] = toMap(center);
    return leafletMapHtml({ lat, lng, zoom: zoomFor(delta), labels: language.code.startsWith('zh') ? 'zh_cn' : 'en', accent: '#2576FF' });
  });

  const state = useMemo<MapState>(
    () => ({
      places: places.map((p) => {
        const [lat, lng] = toMap(p);
        return { id: p.id, lat, lng, color: CategoryMeta[p.category].color, name: t(p.name), selected: p.id === selectedId };
      }),
      user: userLocation ? (([lat, lng]) => ({ lat, lng }))(toMap(userLocation)) : null,
      route: route && route.coords.length > 1 ? { coords: route.coords.map(toMap), approximate: route.approximate } : null,
    }),
    [places, selectedId, userLocation, route, t]
  );

  const view = useMemo<MapView>(() => {
    if (route && route.coords.length > 1) return { kind: 'fit', coords: route.coords.map(toMap), bottom: bottomInset };
    const selected = places.find((p) => p.id === selectedId);
    const [lat, lng] = toMap(selected ?? center);
    return { kind: 'center', lat, lng, zoom: selected ? zoomFor(0.05) : zoomFor(delta) };
  }, [route, bottomInset, places, selectedId, center, delta]);

  useEffect(() => {
    if (ready) webRef.current?.injectJavaScript(`window.haoState(${JSON.stringify(state)});true;`);
  }, [ready, state]);

  useEffect(() => {
    if (ready) webRef.current?.injectJavaScript(`window.haoView(${JSON.stringify(view)});true;`);
  }, [ready, view]);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: MapEvent;
    try {
      msg = JSON.parse(e.nativeEvent.data) as MapEvent;
    } catch {
      return;
    }
    if (msg.type === 'ready') setReady(true);
    else if (msg.type === 'select' && places.some((p) => p.id === msg.id)) onSelect(msg.id);
  };

  return (
    <WebView
      ref={webRef}
      style={StyleSheet.absoluteFill}
      originWhitelist={['*']}
      source={{ html, baseUrl: 'https://localhost/' }}
      onMessage={onMessage}
      // The page never navigates; block anything that tries (e.g. a tapped attribution link).
      onShouldStartLoadWithRequest={(req) => req.url === 'https://localhost/' || req.url.startsWith('about:')}
      setSupportMultipleWindows={false}
      overScrollMode="never"
      androidLayerType="hardware"
      cacheEnabled
    />
  );
}
