import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { MapEvent } from '@/components/map/mapbox-html';
import { useMapPage, type PlaceMapProps } from '@/components/map/use-map-page';

export type { PlaceMapProps };

// Mapbox GL JS in a WebView on iOS and Android: needs no Google Play services or native map SDK, and
// runs in Expo Go.
export function PlaceMap(props: PlaceMapProps) {
  const { places, onSelect } = props;
  const { html, state, view } = useMapPage(props);
  const webRef = useRef<WebView<object>>(null);
  const [ready, setReady] = useState(false);

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
    <WebView<object>
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
