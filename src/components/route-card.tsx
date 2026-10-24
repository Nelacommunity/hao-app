import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { PlaceThumb } from '@/components/place-thumb';
import type { Place } from '@/data/places';
import {
  formatDuration,
  formatMeters,
  MapsApps,
  openInMaps,
  TravelModes,
  type Route,
  type TravelMode,
} from '@/lib/directions';
import type { useCurrentLocation } from '@/lib/location';
import { requestRide } from '@/lib/place-actions';
import { tx, useT } from '@/lib/i18n';

const BLUE = '#2576FF';
const MODE_DISTANCE: Record<TravelMode, string> = {
  foot: tx('{distance} walk from you'),
  bike: tx('{distance} by bike from you'),
  car: tx('{distance} by car from you'),
};

type Props = {
  place: Place;
  location: ReturnType<typeof useCurrentLocation>;
  routes: Partial<Record<TravelMode, Route>>;
  mode: TravelMode;
  onModeChange: (mode: TravelMode) => void;
  onClose: () => void;
  /** False when the screen shows the place's name itself (Explore's draggable sheet header). */
  showHeader?: boolean;
};

export function RouteCard({ place, location, routes, mode, onModeChange, onClose, showHeader = true }: Props) {
  const t = useT();
  const route = routes[mode];

  const go = () => {
    const target = { latitude: place.latitude, longitude: place.longitude, name: place.nameZh };
    // Alert has no buttons on web, so open Amap's web map directly there.
    if (Platform.OS === 'web' || MapsApps.length === 1) return openInMaps('amap', target, mode);
    Alert.alert(t('Navigate with'), place.name === place.nameZh ? place.nameZh : `${place.name} · ${place.nameZh}`, [
      ...MapsApps.map(({ app, label }) => ({ text: label, onPress: () => openInMaps(app, target, mode) })),
      { text: t('Cancel'), style: 'cancel' as const },
    ]);
  };

  const ride = () => {
    // Alert has no buttons on web; Amap's web map has no taxi, so there's nothing better to offer.
    if (Platform.OS === 'web') return requestRide('amap', place);
    Alert.alert(t('Get a ride'), t('For DiDi, the address is copied in Chinese: paste it as your destination.'), [
      { text: 'DiDi 滴滴出行', onPress: () => requestRide('didi', place) },
      { text: t('Amap taxi · 高德打车'), onPress: () => requestRide('amap', place) },
      { text: t('Cancel'), style: 'cancel' as const },
    ]);
  };

  return (
    <View style={styles.card}>
      {showHeader ? (
      <View style={styles.header}>
        <PlaceThumb place={place} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {place.name}
          </Text>
          <Text style={styles.nameZh} numberOfLines={1}>
            {place.nameZh}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel={t('Close directions')}>
          <Ionicons name="close" size={18} color={Colors.ink} />
        </Pressable>
      </View>
      ) : null}

      {!location.coords ? (
        <Pressable
          onPress={location.status === 'denied' && !location.canAskAgain ? location.openSettings : location.request}
          style={({ pressed }) => [styles.prompt, pressed && { opacity: 0.85 }]}
          accessibilityRole="button">
          {location.status === 'loading' ? <ActivityIndicator color={BLUE} /> : <Ionicons name="navigate" size={18} color={BLUE} />}
          <Text style={styles.promptText}>
            {location.status === 'denied' && !location.canAskAgain
              ? t('Allow location in Settings to see the way there')
              : t('Use my location to show the way there')}
          </Text>
        </Pressable>
      ) : (
        <>
          <View style={styles.modes} accessibilityRole="tablist">
            {TravelModes.map((m) => {
              const r = routes[m.mode];
              const active = m.mode === mode;
              return (
                <Pressable
                  key={m.mode}
                  onPress={() => onModeChange(m.mode)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={r ? `${t(m.label)}, ${formatDuration(r.durationS)}` : t(m.label)}
                  style={[styles.mode, active && styles.modeActive]}>
                  <Ionicons name={m.icon} size={16} color={active ? '#fff' : Colors.inkSoft} />
                  {r ? (
                    <Text style={[styles.modeTime, active && { color: '#fff' }]}>{formatDuration(r.durationS)}</Text>
                  ) : (
                    <ActivityIndicator size="small" color={active ? '#fff' : Colors.muted} />
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.summary}>
            {route ? (
              <>
                <Text style={styles.duration}>{formatDuration(route.durationS)}</Text>
                <Text style={styles.distance}>{t(MODE_DISTANCE[mode], { distance: formatMeters(route.distanceM) })}</Text>
                {route.approximate ? (
                  <Text style={styles.estimate}>{t('Estimated: street route unavailable, line shows the direction.')}</Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.distance}>{t('Finding the best route…')}</Text>
            )}
          </View>
        </>
      )}

      <View style={styles.actions}>
        <Pressable onPress={go} style={({ pressed }) => [styles.goBtn, pressed && styles.pressed]} accessibilityRole="button">
          <Ionicons name="navigate" size={18} color="#fff" />
          <Text style={styles.goText}>{t('Go')}</Text>
        </Pressable>
        <Pressable onPress={ride} style={({ pressed }) => [styles.rideBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={t('Get a ride with DiDi or Amap')}>
          <Ionicons name="car" size={18} color={Colors.ink} />
          <Text style={styles.detailsText}>{t('Ride')}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })}
          style={({ pressed }) => [styles.detailsBtn, pressed && styles.pressed]}
          accessibilityRole="button">
          <Text style={styles.detailsText}>{t('Details')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  card: { paddingHorizontal: Spacing.md, gap: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  name: { fontSize: 18, fontWeight: '800', color: Colors.ink },
  nameZh: { fontSize: 13, color: Colors.inkSoft, marginTop: 1 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.blueSoft,
  },
  promptText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.ink },
  modes: { flexDirection: 'row', gap: 6 },
  mode: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: Radius.pill,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  modeActive: { backgroundColor: BLUE, borderColor: BLUE },
  modeTime: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  summary: { gap: 2 },
  duration: { fontSize: 28, fontWeight: '800', color: Colors.ink, letterSpacing: -0.5 },
  distance: { fontSize: 14, color: Colors.inkSoft },
  estimate: { fontSize: 12, color: Colors.goldText, marginTop: 4 },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  goBtn: {
    flex: 1,
    height: 50,
    borderRadius: Radius.pill,
    backgroundColor: BLUE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  goText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  rideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    height: 50,
    borderRadius: Radius.pill,
    backgroundColor: Colors.goldSoft,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  detailsBtn: {
    paddingHorizontal: Spacing.lg,
    height: 50,
    borderRadius: Radius.pill,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsText: { color: Colors.ink, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
}));
