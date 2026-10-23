import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { DietMeta, type DietTag } from '@/data/food';
import { Cities, Places, type Place } from '@/data/places';
import { distanceKm, formatDistance, type Coords, type useCurrentLocation } from '@/lib/location';
import { useT } from '@/lib/i18n';

export const Restaurants = Places.filter((p) => p.category === 'food');

/** Restaurants for the current filter, closest first when the location is known. */
export function nearbyRestaurants(here: Coords | null, tag: DietTag | 'all') {
  const list = Restaurants.filter((r) => tag === 'all' || r.tags?.includes(tag));
  return here ? [...list].sort((a, b) => distanceKm(here, a) - distanceKm(here, b)) : list;
}

/** The closest restaurant known for a dish, if any. */
export function whereToTry(dishId: string, here: Coords | null): Place | undefined {
  return nearbyRestaurants(here, 'all').find((r) => r.dishIds?.includes(dishId));
}

type Props = { location: ReturnType<typeof useCurrentLocation>; tag: DietTag | 'all' };

export function NearbyFood({ location, tag }: Props) {
  const t = useT();
  const here = location.coords;
  const list = nearbyRestaurants(here, tag);
  const nearest = here && list[0] ? distanceKm(here, list[0]) : null;
  // Far from every covered city: still useful, but say so.
  const far = nearest !== null && nearest > 100;
  const closestCity = here ? [...Cities].sort((a, b) => distanceKm(here, a) - distanceKm(here, b))[0] : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{here ? t('Places to eat near you') : t('Places to eat')}</Text>
          <Text style={styles.subtitle}>
            {!here
              ? t('Turn on location to sort by distance')
              : far && closestCity
                ? t('Closest Hao picks · {distance} to {city}', { distance: formatDistance(distanceKm(here, closestCity)), city: t(closestCity.name) })
                : t('Closest first')}
          </Text>
        </View>
        {location.status === 'loading' ? <ActivityIndicator color={Colors.red} /> : null}
      </View>

      {!here && location.status !== 'loading' ? (
        <Pressable
          onPress={location.status === 'denied' && !location.canAskAgain ? location.openSettings : location.request}
          style={({ pressed }) => [styles.prompt, pressed && { opacity: 0.85 }]}
          accessibilityRole="button">
          <View style={styles.promptIcon}>
            <Ionicons name="navigate" size={18} color="#2576FF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.promptTitle}>{location.status === 'denied' ? t('Location is off') : t('Find food near you')}</Text>
            <Text style={styles.promptBody}>
              {location.status === 'denied' && !location.canAskAgain
                ? t('Open Settings to allow location for Hao.')
                : t('Use my location to show the closest restaurants.')}
            </Text>
          </View>
          <Text style={styles.promptAction}>{location.status === 'denied' && !location.canAskAgain ? t('Settings') : t('Allow')}</Text>
        </Pressable>
      ) : null}

      {list.length === 0 ? (
        <Text style={styles.empty}>{t('No restaurants match this filter yet.')}</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
          {list.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => router.push({ pathname: '/place/[id]', params: { id: r.id } })}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel={here ? t('{name}, {distance} away', { name: t(r.name), distance: formatDistance(distanceKm(here, r)) }) : t(r.name)}>
              <View style={styles.cardArt}>
                <Text style={{ fontSize: 34 }}>{r.emoji}</Text>
                {here ? (
                  <View style={styles.distance}>
                    <Ionicons name="navigate" size={10} color="#2576FF" />
                    <Text style={styles.distanceText}>{formatDistance(distanceKm(here, r))}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {t(r.name)}
              </Text>
              <Text style={styles.nameZh} numberOfLines={1}>
                {r.nameZh}
              </Text>
              <View style={styles.metaRow}>
                <Ionicons name="star" size={11} color={Colors.gold} />
                <Text style={styles.meta}>
                  {r.rating} · {t(r.ticket)}
                </Text>
              </View>
              {r.tags?.filter((tag) => tag === 'halal' || tag === 'vegetarian').map((tag) => (
                <Text key={tag} style={styles.tag}>
                  {DietMeta[tag].emoji} {t(DietMeta[tag].label)}
                </Text>
              ))}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm, marginBottom: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md },
  title: { fontSize: 20, fontWeight: '800', color: Colors.ink },
  subtitle: { fontSize: 13, color: Colors.muted, marginTop: 1 },
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: '#E8F0FF',
  },
  promptIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  promptTitle: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  promptBody: { fontSize: 13, color: Colors.inkSoft, marginTop: 1 },
  promptAction: { fontSize: 14, fontWeight: '800', color: '#2576FF' },
  empty: { fontSize: 14, color: Colors.muted, paddingHorizontal: Spacing.md },
  cards: { gap: Spacing.md, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  card: { width: 172, backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.sm, ...Shadow },
  cardArt: {
    height: 84,
    borderRadius: Radius.md,
    backgroundColor: Colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  distance: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#fff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  distanceText: { fontSize: 11, fontWeight: '800', color: '#2576FF' },
  name: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  nameZh: { fontSize: 12, color: Colors.inkSoft, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 },
  meta: { fontSize: 12, color: Colors.muted },
  tag: { fontSize: 12, color: Colors.jade, fontWeight: '600', marginTop: 4 },
});
