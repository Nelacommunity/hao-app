import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PlaceThumb, placeMeta } from '@/components/place-thumb';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import type { DietTag, Dish } from '@/data/food';
import { Cities } from '@/data/places';
import { distanceKm, formatDistance, type Coords, type useCurrentLocation } from '@/lib/location';
import { useT } from '@/lib/i18n';
import { usePlaces, type PlaceQuery } from '@/lib/places';

// What to search AMap for with each diet filter.
const DIET_KEYWORD: Record<DietTag, string> = { vegetarian: '素食', halal: '清真', spicy: '川菜', street: '小吃' };

/** Restaurants around the user, or in Beijing until the location is known. */
function foodQuery(here: Coords | null, q?: string): PlaceQuery {
  return here ? { near: here, radius: 5000, category: 'food', q } : { city: Cities[0].nameZh, category: 'food', q };
}

type Props = { location: ReturnType<typeof useCurrentLocation>; tag: DietTag | 'all' };

export function NearbyFood({ location, tag }: Props) {
  const t = useT();
  const here = location.coords;
  const search = usePlaces(location.status === 'loading' && !here ? null : foodQuery(here, tag === 'all' ? undefined : DIET_KEYWORD[tag]));
  const list = search.places;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{here ? t('Places to eat near you') : t('Places to eat')}</Text>
          <Text style={styles.subtitle}>{here ? t('Closest first') : t('Top picks in {city} · turn on location for nearby', { city: t(Cities[0].name) })}</Text>
        </View>
        {location.status === 'loading' || search.loading ? <ActivityIndicator color={Colors.red} /> : null}
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

      {search.error ? (
        <Text style={styles.empty}>{search.error}</Text>
      ) : !search.loading && list.length === 0 ? (
        <Text style={styles.empty}>{t('No restaurants found on AMap for this filter.')}</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
          {list.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => router.push({ pathname: '/place/[id]', params: { id: r.id } })}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel={here ? t('{name}, {distance} away', { name: r.name, distance: formatDistance(distanceKm(here, r)) }) : r.name}>
              <View>
                <PlaceThumb place={r} size={156} radius={Radius.md} style={styles.cardArt} />
                {here ? (
                  <View style={styles.distance}>
                    <Ionicons name="navigate" size={10} color="#2576FF" />
                    <Text style={styles.distanceText}>{formatDistance(distanceKm(here, r))}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {r.name}
              </Text>
              {r.name !== r.nameZh ? (
                <Text style={styles.nameZh} numberOfLines={1}>
                  {r.nameZh}
                </Text>
              ) : null}
              <Text style={styles.meta} numberOfLines={1}>
                {placeMeta(r, t('Restaurant'))}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** The closest restaurant AMap finds for a dish (searched only while its card is open). */
export function WhereToTry({ dish, here }: { dish: Dish; here: Coords | null }) {
  const t = useT();
  const { places, loading } = usePlaces(foodQuery(here, dish.nameZh));
  const spot = places[0];
  if (loading) return <ActivityIndicator color={Colors.red} style={{ alignSelf: 'flex-start' }} />;
  if (!spot) return null;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/place/[id]', params: { id: spot.id } })}
      style={({ pressed }) => [styles.tryRow, pressed && { opacity: 0.7 }]}
      accessibilityRole="link">
      <Ionicons name="location" size={14} color={Colors.red} />
      <Text style={styles.tryText} numberOfLines={1}>
        {t('Try it at')} <Text style={styles.tryName}>{spot.name}</Text>
        {here ? ` · ${formatDistance(distanceKm(here, spot))}` : ''}
      </Text>
      <Ionicons name="chevron-forward" size={14} color={Colors.muted} />
    </Pressable>
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
  cardArt: { height: 96, marginBottom: Spacing.sm },
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
  meta: { fontSize: 12, color: Colors.muted, marginTop: 6 },
  tryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.redSoft,
  },
  tryText: { flex: 1, fontSize: 13, color: Colors.inkSoft },
  tryName: { fontWeight: '800', color: Colors.ink },
});
