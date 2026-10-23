import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { Colors, Radius } from '@/constants/theme';
import { CategoryMeta } from '@/data/places';

import type { PlaceMapProps } from './place-map';
import { useT } from '@/lib/i18n';

// react-native-maps has no web support, so the web build shows a stylised pin board.
export function PlaceMap({ places, center, userLocation, selectedId, onSelect, route }: PlaceMapProps) {
  const t = useT();
  // With a route, frame the route itself; otherwise frame all places.
  const framed = route && route.coords.length > 1 ? route.coords : [...places, center];
  const lats = framed.map((p) => p.latitude);
  const lngs = framed.map((p) => p.longitude);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  const x = (lng: number) => 15 + ((lng - minLng) / (maxLng - minLng || 1)) * 70;
  const y = (lat: number) => 15 + (1 - (lat - minLat) / (maxLat - minLat || 1)) * 40;
  const pos = (lat: number, lng: number) => ({ left: `${x(lng)}%` as const, top: `${y(lat)}%` as const });

  return (
    <View style={[StyleSheet.absoluteFill, styles.board]}>
      {[...Array(8)].map((_, i) => (
        <View key={`h${i}`} style={[styles.gridH, { top: `${i * 14}%` }]} />
      ))}
      {[...Array(8)].map((_, i) => (
        <View key={`v${i}`} style={[styles.gridV, { left: `${i * 14}%` }]} />
      ))}
      <View style={styles.river} />
      {route && route.coords.length > 1 ? (
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" pointerEvents="none">
          <Polyline
            points={route.coords.map((c) => `${x(c.longitude)},${y(c.latitude)}`).join(' ')}
            fill="none"
            stroke="#2576FF"
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={route.approximate ? '8 10' : undefined}
            vectorEffect="non-scaling-stroke"
          />
        </Svg>
      ) : null}
      {userLocation ? (
        <View style={[styles.user, pos(userLocation.latitude, userLocation.longitude)]} pointerEvents="none">
          <View style={styles.userHalo} />
          <View style={styles.userDot} />
        </View>
      ) : null}
      {places.map((p) => {
        const active = p.id === selectedId;
        return (
          <Pressable
            key={p.id}
            onPress={() => onSelect(p.id)}
            style={[styles.pin, pos(p.latitude, p.longitude), active && styles.pinActive]}>
            <View
              style={[
                styles.pinDot,
                { backgroundColor: CategoryMeta[p.category].color },
                active && { transform: [{ scale: 1.25 }] },
              ]}>
              <Text style={{ fontSize: 16 }}>{p.emoji}</Text>
            </View>
            {active ? <Text style={styles.pinLabel}>{t(p.name)}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    backgroundColor: '#EEF2E6',
    overflow: 'hidden',
  },
  gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#DCE3D0' },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#DCE3D0' },
  river: {
    position: 'absolute',
    top: '40%',
    left: '-10%',
    width: '130%',
    height: 28,
    backgroundColor: '#CFE3F1',
    transform: [{ rotate: '-12deg' }],
  },
  pin: {
    position: 'absolute',
    alignItems: 'center',
    marginLeft: -18,
    marginTop: -18,
  },
  pinActive: { zIndex: 2 },
  user: { position: 'absolute', width: 40, height: 40, marginLeft: -20, marginTop: -20, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  userHalo: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(37,118,255,0.18)' },
  userDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#2576FF', borderWidth: 3, borderColor: '#fff' },
  pinDot: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  pinLabel: {
    marginTop: 4,
    backgroundColor: Colors.ink,
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
});
