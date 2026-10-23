import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { CategoryMeta, type Place } from '@/data/places';
import { wgs84ToGcj02 } from '@/lib/china-coords';
import type { Coords } from '@/lib/location';
import { useT } from '@/lib/i18n';

export type PlaceMapProps = {
  places: Place[];
  center: Coords;
  /** Span of the visible region in degrees when nothing is selected. */
  delta?: number;
  userLocation?: Coords | null;
  selectedId?: string;
  onSelect: (id: string) => void;
  /** Route to draw from the user to the selected place (GPS coordinates). */
  route?: { coords: Coords[]; approximate: boolean } | null;
  /** Height covered by UI at the bottom (the sheet), so fitted routes stay visible. */
  bottomInset?: number;
};

// Our data and GPS are WGS-84; the native map tiles in mainland China are GCJ-02.
const toMap = (p: Coords) => wgs84ToGcj02({ latitude: p.latitude, longitude: p.longitude });

export function PlaceMap({ places, center, delta = 0.25, selectedId, onSelect, route, bottomInset = 0 }: PlaceMapProps) {
  const t = useT();
  const mapRef = useRef<MapView>(null);
  const routeCoords = route?.coords.map(toMap);

  useEffect(() => {
    if (routeCoords && routeCoords.length > 1) {
      mapRef.current?.fitToCoordinates(routeCoords, {
        edgePadding: { top: 140, right: 48, bottom: bottomInset + 48, left: 48 },
        animated: true,
      });
      return;
    }
    const selected = places.find((p) => p.id === selectedId);
    const target = toMap(selected ?? center);
    mapRef.current?.animateToRegion(
      {
        ...target,
        latitudeDelta: selected ? 0.05 : delta,
        longitudeDelta: selected ? 0.05 : delta,
      },
      450
    );
    // routeCoords is derived from `route`, which is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, delta, places, selectedId, route, bottomInset]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={{ ...toMap(center), latitudeDelta: delta, longitudeDelta: delta }}
      showsUserLocation
      showsMyLocationButton={false}
      showsPointsOfInterests={false}>
      {routeCoords && routeCoords.length > 1 ? (
        <Polyline
          coordinates={routeCoords}
          strokeColor="#2576FF"
          strokeWidth={6}
          lineCap="round"
          lineJoin="round"
          lineDashPattern={route?.approximate ? [8, 10] : undefined}
        />
      ) : null}
      {places.map((p) => (
        <Marker
          key={p.id}
          coordinate={toMap(p)}
          title={t(p.name)}
          description={p.nameZh}
          pinColor={CategoryMeta[p.category].color}
          onPress={() => onSelect(p.id)}
        />
      ))}
    </MapView>
  );
}
