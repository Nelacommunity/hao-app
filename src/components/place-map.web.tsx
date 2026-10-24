import { useEffect, useRef, useState } from 'react';

import type { MapEvent, MapState, MapView } from '@/components/map/leaflet-html';
import { useMapPage, type PlaceMapProps } from '@/components/map/use-map-page';

export type { PlaceMapProps };

type MapWindow = Window & { haoState?: (s: MapState) => void; haoView?: (v: MapView) => void };

// The same AMap (高德) page as the phone apps, in an iframe. srcdoc keeps it same-origin, so the app
// calls its functions directly; it posts its events back to this window.
export function PlaceMap(props: PlaceMapProps) {
  const { places, onSelect } = props;
  const { html, state, view } = useMapPage(props);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const page = () => frameRef.current?.contentWindow as MapWindow | null | undefined;

  useEffect(() => {
    if (ready) page()?.haoState?.(state);
  }, [ready, state]);

  useEffect(() => {
    if (ready) page()?.haoView?.(view);
  }, [ready, view]);

  useEffect(() => {
    const onMessage = (e: MessageEvent<{ hao?: string }>) => {
      if (e.source !== frameRef.current?.contentWindow || typeof e.data?.hao !== 'string') return;
      const msg = JSON.parse(e.data.hao) as MapEvent;
      if (msg.type === 'ready') setReady(true);
      else if (msg.type === 'select' && places.some((p) => p.id === msg.id)) onSelect(msg.id);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [places, onSelect]);

  return (
    <iframe
      ref={frameRef}
      srcDoc={html}
      title="Map"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
    />
  );
}
