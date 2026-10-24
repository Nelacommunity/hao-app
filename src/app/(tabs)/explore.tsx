import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInUp,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryTiles } from '@/components/category-tiles';
import { PlaceMap } from '@/components/place-map';
import { PlaceThumb, placeMeta } from '@/components/place-thumb';
import { RouteCard } from '@/components/route-card';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { CategoryMeta, Cities, type CityId, type Place, type PlaceCategory } from '@/data/places';
import { useDirections, type TravelMode } from '@/lib/directions';
import { distanceKm, formatDistance, useCurrentLocation } from '@/lib/location';
import { useT } from '@/lib/i18n';
import { getCachedPlace, usePlaces } from '@/lib/places';

type Area = CityId | 'nearby';

/** The Explore city a place is in, when it's one of them (AMap gives e.g. 北京市). */
const cityOf = (place: Place): CityId | undefined => Cities.find((c) => place.cityZh.startsWith(c.nameZh))?.id;

const COLLAPSED = 76; // handle + title row: the whole map stays visible
const SPRING = { damping: 22, stiffness: 200, mass: 0.8 };

export default function ExploreScreen() {
  const t = useT();
  const [area, setArea] = useState<Area>('beijing');
  const [category, setCategory] = useState<PlaceCategory | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string>();
  const [menuOpen, setMenuOpen] = useState(false);
  // Bumped on "locate me" so the map re-centres even if the position hasn't changed.
  const [recenter, setRecenter] = useState(0);
  const location = useCurrentLocation();
  const here = location.coords;
  const insets = useSafeAreaInsets();

  // Pull-up sheet: collapsed (map only), half, or full (just below the area dropdown).
  const [screenHeight, setScreenHeight] = useState(0);
  const half = Math.round(screenHeight * 0.45);
  const full = Math.max(half, screenHeight - insets.top - 92);
  const sheetHeight = useSharedValue(COLLAPSED);
  const dragStart = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (!screenHeight) sheetHeight.set(Math.round(h * 0.45));
    setScreenHeight(h);
  };

  const pan = Gesture.Pan()
    .onBegin(() => {
      dragStart.value = sheetHeight.value;
    })
    .onUpdate((e) => {
      sheetHeight.value = Math.min(full, Math.max(COLLAPSED, dragStart.value - e.translationY));
    })
    .onEnd((e) => {
      // Project the flick so a quick swipe moves a whole step.
      const projected = sheetHeight.value - e.velocityY * 0.18;
      const target = [COLLAPSED, half, full].reduce((best, p) => (Math.abs(p - projected) < Math.abs(best - projected) ? p : best));
      sheetHeight.value = withSpring(target, SPRING);
    });
  const tap = Gesture.Tap().onEnd(() => {
    sheetHeight.value = withSpring(sheetHeight.value < half - 8 ? half : COLLAPSED, SPRING);
  });
  const sheetGesture = Gesture.Race(pan, tap);

  const sheetStyle = useAnimatedStyle(() => ({ height: sheetHeight.value }));
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(sheetHeight.value, [COLLAPSED, half], [0, 180], Extrapolation.CLAMP)}deg` }],
  }));
  // The list fades out as the sheet closes, so the collapsed bar shows only its title.
  const contentStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: interpolate(sheetHeight.value, [COLLAPSED, COLLAPSED + 60], [0, 1], Extrapolation.CLAMP),
  }));
  const locateStyle = useAnimatedStyle(() => ({
    bottom: sheetHeight.value + 12,
    opacity: interpolate(sheetHeight.value, [half, half + 80], [1, 0], Extrapolation.CLAMP),
  }));

  // Tapping a place shows the way there from the user's location.
  const [mode, setMode] = useState<TravelMode>('foot');
  const selectedPlace = (selectedId && getCachedPlace(selectedId)) || null;
  const directions = useDirections(selectedPlace ? here : null, selectedPlace);
  const activeRoute = selectedPlace && here ? (directions.routes[mode] ?? null) : null;

  const selectPlace = (id: string) => {
    const place = getCachedPlace(id);
    setSelectedId(id);
    // Walk for short trips, drive for longer ones; the user can switch.
    if (place && here) setMode(distanceKm(here, place) < 1.5 ? 'foot' : 'car');
    if (sheetHeight.get() < half - 8) sheetHeight.set(withSpring(half, SPRING));
  };

  // "Directions" on a place page opens this tab with ?route=<placeId>.
  const params = useLocalSearchParams<{ route?: string }>();
  const [handledRoute, setHandledRoute] = useState<string | undefined>();
  if (params.route && params.route !== handledRoute) {
    setHandledRoute(params.route);
    const place = getCachedPlace(params.route);
    if (place) {
      setSelectedId(place.id);
      setArea(cityOf(place) ?? (here ? 'nearby' : area));
      setCategory('all');
      if (here) setMode(distanceKm(here, place) < 1.5 ? 'foot' : 'car');
    }
  }

  const city = area === 'nearby' ? null : (Cities.find((c) => c.id === area) ?? Cities[0]);

  // Live from AMap: around the user (closest first) or the city's top places.
  const cat = category === 'all' ? undefined : category;
  const search = usePlaces(area === 'nearby' ? (here ? { near: here, radius: 5000, category: cat } : null) : { city: city!.nameZh, category: cat });
  const places = useMemo(
    // Keep the selected place on the map even when it isn't in the current results.
    () => (selectedPlace && !search.places.some((p) => p.id === selectedPlace.id) ? [selectedPlace, ...search.places] : search.places),
    [search.places, selectedPlace]
  );

  const center = useMemo(() => {
    if (area === 'nearby' && here) return { ...here, _r: recenter };
    const c = city ?? Cities[0];
    return { latitude: c.latitude, longitude: c.longitude, _r: recenter };
  }, [area, here, city, recenter]);

  const chooseArea = async (next: Area) => {
    setMenuOpen(false);
    setSelectedId(undefined);
    if (next === 'nearby' && location.status !== 'granted') {
      const ok = await location.request();
      if (!ok) return;
    }
    setArea(next);
  };

  const locateMe = async () => {
    if (location.status !== 'granted' && !(await location.request())) return;
    setSelectedId(undefined);
    setArea('nearby');
    setRecenter((n) => n + 1);
  };

  const label = area === 'nearby' ? t('Near me') : `${t(city!.name)} ${city!.nameZh}`;

  return (
    <View style={styles.container} onLayout={onLayout}>
      <View style={StyleSheet.absoluteFill}>
        <PlaceMap
          places={places}
          center={center}
          delta={area === 'nearby' ? 0.12 : 0.25}
          userLocation={here}
          route={activeRoute}
          bottomInset={half}
          selectedId={selectedId}
          onSelect={selectPlace}
        />

        {menuOpen ? (
          <Animated.View entering={FadeIn.duration(150)} style={StyleSheet.absoluteFill}>
            <Pressable style={styles.scrim} onPress={() => setMenuOpen(false)} accessibilityLabel={t('Close menu')} />
          </Animated.View>
        ) : null}

        <SafeAreaView edges={['top']} style={styles.overlay} pointerEvents="box-none">
          <Pressable
            onPress={() => setMenuOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: menuOpen }}
            accessibilityLabel={t('Area: {area}. Change area', { area: label })}
            style={({ pressed }) => [styles.dropdown, menuOpen && styles.dropdownOpen, pressed && { opacity: 0.9 }]}>
            <View style={[styles.dropdownIcon, area === 'nearby' && { backgroundColor: '#E8F0FF' }]}>
              <Ionicons name={area === 'nearby' ? 'navigate' : 'location'} size={16} color={area === 'nearby' ? '#2576FF' : Colors.red} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dropdownLabel}>{t('Exploring')}</Text>
              <Text style={styles.dropdownValue} numberOfLines={1}>
                {label}
              </Text>
            </View>
            <Ionicons name={menuOpen ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.inkSoft} />
          </Pressable>

          {menuOpen ? (
            <Animated.View entering={FadeInUp.duration(180)} style={styles.menu}>
              <MenuRow
                icon="navigate"
                iconColor="#2576FF"
                iconBg="#E8F0FF"
                title={t('Near me')}
                subtitle={
                  location.status === 'denied'
                    ? t('Location is off. Tap to allow.')
                    : here
                      ? t('All places, closest first')
                      : t('Use my current location')
                }
                selected={area === 'nearby'}
                onPress={() =>
                  location.status === 'denied' && !location.canAskAgain ? location.openSettings() : chooseArea('nearby')
                }
              />
              <View style={styles.menuDivider} />
              {Cities.map((c) => (
                <MenuRow
                  key={c.id}
                  icon="business"
                  iconColor={Colors.red}
                  iconBg={Colors.redSoft}
                  title={`${t(c.name)}  ${c.nameZh}`}
                  subtitle={here ? t('{distance} away', { distance: formatDistance(distanceKm(here, c)) }) : t('Top places on AMap')}
                  selected={area === c.id}
                  onPress={() => chooseArea(c.id)}
                />
              ))}
            </Animated.View>
          ) : null}
        </SafeAreaView>

      </View>

      <Animated.View style={[styles.locateWrap, locateStyle]}>
        <Pressable
          onPress={locateMe}
          style={({ pressed }) => [styles.locate, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={t('Show my location')}>
          {location.status === 'loading' ? (
            <ActivityIndicator size="small" color="#2576FF" />
          ) : (
            <Ionicons name={area === 'nearby' && here ? 'locate' : 'locate-outline'} size={22} color="#2576FF" />
          )}
        </Pressable>
      </Animated.View>

      <Animated.View style={[styles.sheet, sheetStyle]}>
        <GestureDetector gesture={sheetGesture}>
          <View style={styles.sheetHeader} accessibilityRole="button" accessibilityLabel={t('Show or hide the places list')}>
            <View style={styles.handle} />
            {selectedPlace ? null : (
              <View style={styles.sheetTitleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>{area === 'nearby' ? t('Places near you') : t('Places in {city}', { city: t(city!.name) })}</Text>
                  <Text style={styles.sheetSub}>
                    {search.loading ? t('Searching AMap…') : places.length === 1 ? t('1 place') : t('{count} places', { count: places.length })}
                    {category !== 'all' ? ` · ${t(CategoryMeta[category].label)}` : ''}
                  </Text>
                </View>
                <Animated.View style={[styles.sheetToggle, chevronStyle]}>
                  <Ionicons name="chevron-up" size={18} color={Colors.ink} />
                </Animated.View>
              </View>
            )}
          </View>
        </GestureDetector>
        {selectedPlace ? (
          <RouteCard
            place={selectedPlace}
            location={location}
            routes={directions.routes}
            mode={mode}
            onModeChange={setMode}
            onClose={() => setSelectedId(undefined)}
          />
        ) : (
          <Animated.View style={contentStyle}>
            <View style={styles.catTiles}>
              <CategoryTiles value={category} onChange={setCategory} />
            </View>

            {location.status === 'denied' && area === 'nearby' ? (
              <Text style={styles.notice}>{t('Location access is off, so places can’t be sorted by distance.')}</Text>
            ) : null}

            <ScrollView contentContainerStyle={styles.list}>
              {search.loading ? (
                <ActivityIndicator color={Colors.red} style={{ marginTop: Spacing.lg }} />
              ) : search.error ? (
                <Text style={styles.empty}>{search.error}</Text>
              ) : places.length === 0 ? (
                <Text style={styles.empty}>{t('No places found here. Try another filter.')}</Text>
              ) : (
                places.map((p) => {
                  const active = p.id === selectedId;
                  const away = here ? formatDistance(distanceKm(here, p)) : null;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => selectPlace(p.id)}
                      style={[styles.placeRow, active && styles.placeRowActive]}>
                      <PlaceThumb place={p} size={52} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.placeName} numberOfLines={1}>
                          {p.name}
                        </Text>
                        {p.name !== p.nameZh ? (
                          <Text style={styles.placeZh} numberOfLines={1}>
                            {p.nameZh}
                          </Text>
                        ) : null}
                        <View style={styles.metaRow}>
                          <Text style={styles.meta} numberOfLines={1}>
                            {placeMeta(p, t(CategoryMeta[p.category].label))}
                          </Text>
                          {away ? (
                            <View style={styles.distance}>
                              <Ionicons name="navigate" size={10} color="#2576FF" />
                              <Text style={styles.distanceText}>{away}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <Pressable
                        onPress={() => router.push({ pathname: '/place/[id]', params: { id: p.id } })}
                        hitSlop={8}
                        style={styles.go}>
                        <Ionicons name="chevron-forward" size={18} color="#fff" />
                      </Pressable>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

function MenuRow({
  icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  selected,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.menuRow, selected && styles.menuRowSelected, pressed && { opacity: 0.7 }]}>
      <View style={[styles.menuIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSub}>{subtitle}</Text>
      </View>
      {selected ? <Ionicons name="checkmark" size={20} color={Colors.red} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  scrim: { flex: 1, backgroundColor: 'rgba(27,26,31,0.25)' },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    paddingLeft: 8,
    paddingRight: Spacing.md,
    paddingVertical: 8,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    ...Shadow,
  },
  dropdownOpen: { borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  dropdownIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: Colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  dropdownLabel: { fontSize: 11, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  dropdownValue: { fontSize: 16, fontWeight: '800', color: Colors.ink },
  menu: {
    marginHorizontal: Spacing.md,
    marginTop: 6,
    padding: 6,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    ...Shadow,
    elevation: 10,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: 10, borderRadius: Radius.md },
  menuRowSelected: { backgroundColor: Colors.paper },
  menuIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  menuTitle: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  menuSub: { fontSize: 12, color: Colors.muted, marginTop: 1 },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.line, marginVertical: 4, marginHorizontal: 10 },
  locateWrap: { position: 'absolute', right: Spacing.md },
  locate: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    backgroundColor: Colors.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#3B1A10',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  sheetHeader: { paddingBottom: Spacing.sm },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.line,
    marginTop: Spacing.sm,
  },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: Colors.ink },
  sheetSub: { fontSize: 13, color: Colors.muted, marginTop: 1 },
  sheetToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catTiles: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  notice: { fontSize: 13, color: Colors.inkSoft, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.sm },
  empty: { textAlign: 'center', color: Colors.muted, marginTop: Spacing.lg },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  placeRowActive: { borderColor: Colors.red },
  placeName: { fontSize: 16, fontWeight: '700', color: Colors.ink },
  placeZh: { fontSize: 13, color: Colors.inkSoft },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  meta: { fontSize: 12, color: Colors.muted },
  distance: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#E8F0FF', paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radius.pill, marginLeft: 2 },
  distanceText: { fontSize: 11, fontWeight: '700', color: '#2576FF' },
  go: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    backgroundColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
