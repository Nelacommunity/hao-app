// My Places: everywhere you've eaten, visited and stayed in China, and where you want to go next.
// Visits come from Hao (navigation, voice rooms, chat) or are added here; each one can be reviewed
// with a rating, tags and a few words.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddPlaceSheet } from '@/components/add-place-sheet';
import { ChatColors } from '@/components/chat-ui';
import { formatVisitDate, openPlace, RatingIcon } from '@/components/place-card';
import { PlaceMap } from '@/components/place-map';
import { PlaceThumb, placeMeta } from '@/components/place-thumb';
import { TagChip, VisitConfirmCard } from '@/components/visit-confirm-card';
import { VisitSheet } from '@/components/visit-sheet';
import { Colors, Radius, Shadow, Spacing, themed } from '@/constants/theme';
import { CategoryMeta, Cities, type IconName, type Place } from '@/data/places';
import { useAuth } from '@/lib/auth';
import { tx, useT } from '@/lib/i18n';
import { useCurrentLocation } from '@/lib/location';
import { navigateTo } from '@/lib/place-actions';
import { cachePlace, fetchPlacesById } from '@/lib/places';
import { fetchSavedPlaceIds, setPlaceSaved } from '@/lib/saved-places';
import { fetchPendingVisits, fetchVisits, inGroup, isPlacesGroup, logVisit, type PlacesGroup, type VisitCardData } from '@/lib/visits';

type Tab = 'visited' | 'want';

const FILTERS: { group: PlacesGroup; label: string; icon: IconName }[] = [
  { group: 'all', label: tx('All'), icon: 'apps' },
  { group: 'food', label: tx('Food'), icon: 'restaurant' },
  { group: 'places', label: tx('Places'), icon: 'camera' },
  { group: 'hotels', label: tx('Hotels'), icon: 'bed' },
];

type Item = { kind: 'visit'; visit: VisitCardData } | { kind: 'want'; place: Place };
type Section = { title: string; data: Item[] };

const monthOf = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'long', year: 'numeric' });

export default function MyPlacesScreen() {
  const t = useT();
  const { profile } = useAuth();
  const here = useCurrentLocation().coords;
  const { width } = useWindowDimensions();

  // Other screens open a filter directly: /my-places?filter=food.
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const [group, setGroup] = useState<PlacesGroup>(isPlacesGroup(filter) ? filter : 'all');
  const [appliedFilter, setAppliedFilter] = useState(filter);
  if (filter !== appliedFilter) {
    setAppliedFilter(filter);
    if (isPlacesGroup(filter)) setGroup(filter);
  }

  const [tab, setTab] = useState<Tab>('visited');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [query, setQuery] = useState('');
  const [visits, setVisits] = useState<VisitCardData[] | null>(null);
  const [pending, setPending] = useState<VisitCardData[]>([]);
  const [wanted, setWanted] = useState<Place[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<VisitCardData | null>(null);
  const [adding, setAdding] = useState(false);
  // Added with "Been here" while the add sheet was open: its review opens when the sheet closes.
  const [reviewNext, setReviewNext] = useState<VisitCardData | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    fetchVisits()
      .then(async (list) => {
        if (cancelled) return;
        setVisits(list);
        setError(null);
        // Stored places have no photos; add AMap's.
        const details = await fetchPlacesById(list.map((v) => v.place.id)).catch(() => []);
        const byId = new Map(details.map((p) => [p.id, p]));
        if (!cancelled && byId.size) setVisits(list.map((v) => (byId.has(v.place.id) ? { ...v, place: { ...byId.get(v.place.id)!, distanceM: undefined } } : v)));
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    fetchPendingVisits()
      .then((list) => !cancelled && setPending(list))
      .catch(() => {});
    fetchSavedPlaceIds()
      .then(fetchPlacesById)
      .then((places) => !cancelled && setWanted(places))
      .catch(() => !cancelled && setWanted([]));
    return () => {
      cancelled = true;
    };
  }, []);
  useFocusEffect(load);

  const visitedIds = useMemo(() => new Set((visits ?? []).map((v) => v.place.id)), [visits]);
  const q = query.trim().toLowerCase();
  const matches = useCallback((p: Place) => !q || p.name.toLowerCase().includes(q) || p.nameZh.includes(q), [q]);
  const groupVisits = useMemo(() => (visits ?? []).filter((v) => inGroup(v.place, group)), [visits, group]);
  const groupWanted = useMemo(() => (wanted ?? []).filter((p) => !visitedIds.has(p.id) && inGroup(p, group)), [wanted, visitedIds, group]);
  const shownVisits = groupVisits.filter((v) => matches(v.place));
  const shownWanted = groupWanted.filter(matches);
  const shownPending = pending.filter((v) => inGroup(v.place, group));
  const loved = groupVisits.filter((v) => v.rating === 1).length;

  const sections = useMemo<Section[]>(() => {
    if (tab === 'want') return shownWanted.length ? [{ title: '', data: shownWanted.map((p) => ({ kind: 'want' as const, place: p })) }] : [];
    const byMonth = new Map<string, VisitCardData[]>();
    for (const v of shownVisits) byMonth.set(monthOf(v.visitedAt), [...(byMonth.get(monthOf(v.visitedAt)) ?? []), v]);
    return [...byMonth].map(([title, list]) => ({ title, data: list.map((v) => ({ kind: 'visit' as const, visit: v })) }));
  }, [tab, shownVisits, shownWanted]);

  const counts = (g: PlacesGroup) => (visits ?? []).filter((v) => inGroup(v.place, g)).length;
  const loading = visits === null || wanted === null;
  const empty = tab === 'visited' ? groupVisits.length === 0 : groupWanted.length === 0;
  const mapPlaces = tab === 'visited' ? shownVisits.map((v) => v.place) : shownWanted;

  const addBeen = async (place: Place) => {
    try {
      const visit = await logVisit({ placeId: place.id, source: 'manual', status: 'confirmed' });
      const full = { ...visit, place: { ...place, distanceM: undefined } };
      setVisits((list) => [full, ...(list ?? []).filter((v) => v.place.id !== place.id)]);
      setWanted((list) => list?.filter((p) => p.id !== place.id) ?? null);
      setReviewNext(full);
      setTab('visited');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const addWant = (place: Place) => {
    cachePlace(place);
    setWanted((list) => [place, ...(list ?? []).filter((p) => p.id !== place.id)]);
    setPlaceSaved(place.id, true).catch((e: Error) => setError(e.message));
  };

  const removeWanted = (place: Place) => {
    setWanted((list) => list?.filter((p) => p.id !== place.id) ?? null);
    setPlaceSaved(place.id, false).catch(() => {});
  };

  const header = (
    <View style={{ gap: Spacing.md }}>
      <View style={styles.stats}>
        <Stat value={groupVisits.length} label={group === 'hotels' ? t('Stayed') : t('Visited')} icon="footsteps" color={Colors.jade} onPress={() => setTab('visited')} />
        <Stat value={loved} label={t('Loved')} icon="heart" color={Colors.red} onPress={() => setTab('visited')} />
        <Stat value={groupWanted.length} label={t('Want to go')} icon="bookmark" color={Colors.goldText} onPress={() => setTab('want')} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.bleed}>
        {FILTERS.map((f) => {
          const on = f.group === group;
          const n = counts(f.group);
          return (
            <Pressable key={f.group} onPress={() => setGroup(f.group)} style={[styles.filter, on && styles.filterOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Ionicons name={f.icon} size={15} color={on ? '#fff' : Colors.inkSoft} />
              <Text style={[styles.filterText, on && { color: '#fff' }]}>{t(f.label)}</Text>
              {n ? <Text style={[styles.filterCount, on && { color: 'rgba(255,255,255,0.75)' }]}>{n}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {shownPending.length ? (
        <View style={{ gap: Spacing.sm }}>
          <Text style={styles.sectionLabel}>{t('To review · {count}', { count: shownPending.length })}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.pendingRow}>
            {shownPending.map((v) => (
              <View key={v.visitId} style={{ width: Math.min(340, width - 56) }}>
                <VisitConfirmCard
                  data={v}
                  onChange={(next) => {
                    // Keep the answered card a moment so the user sees it worked.
                    setTimeout(() => {
                      setPending((list) => list.filter((p) => p.visitId !== next.visitId));
                      if (next.status === 'confirmed') load();
                    }, 1200);
                  }}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.segment} accessibilityRole="tablist">
        {(['visited', 'want'] as const).map((id) => (
          <Pressable key={id} onPress={() => setTab(id)} style={[styles.segmentBtn, tab === id && styles.segmentOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === id }}>
            <Text style={[styles.segmentText, tab === id && styles.segmentTextOn]}>
              {id === 'visited' ? (group === 'hotels' ? t('Stayed') : t('Visited')) : t('Want to go')}
            </Text>
          </Pressable>
        ))}
      </View>

      {(tab === 'visited' ? groupVisits.length : groupWanted.length) > 5 ? (
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={Colors.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder={t('Search my places')} placeholderTextColor={Colors.muted} style={styles.searchInput} autoCorrect={false} />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel={t('Clear')}>
              <Ionicons name="close-circle" size={16} color={Colors.muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>我的足迹 · {t('Your China')}</Text>
          <Text style={styles.title}>{t('My Places')}</Text>
        </View>
        <View style={styles.viewToggle} accessibilityRole="tablist">
          {(['list', 'map'] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setView(v)}
              style={[styles.viewBtn, view === v && styles.viewBtnOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: view === v }}
              accessibilityLabel={v === 'list' ? t('List') : t('Map')}>
              <Ionicons name={v === 'list' ? 'list' : 'map'} size={16} color={view === v ? '#fff' : Colors.ink} />
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => setAdding(true)} style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={t('Add a place')}>
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.red} style={{ marginTop: Spacing.xl }} />
      ) : view === 'map' ? (
        <View style={{ flex: 1, paddingHorizontal: Spacing.md, gap: Spacing.md }}>
          {header}
          {mapPlaces.length ? (
            <View style={styles.mapWrap}>
              <PlaceMap
                places={mapPlaces}
                center={mapPlaces[0] ?? here ?? Cities[0]}
                delta={0.1}
                userLocation={here}
                onSelect={(id) => {
                  const visit = shownVisits.find((v) => v.place.id === id);
                  if (tab === 'visited' && visit) setOpen(visit);
                  else {
                    const place = shownWanted.find((p) => p.id === id);
                    if (place) openPlace(place);
                  }
                }}
              />
            </View>
          ) : (
            <EmptyState group={group} tab={tab} onAdd={() => setAdding(true)} />
          )}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => (item.kind === 'visit' ? item.visit.visitId : item.place.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={header}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (section.title ? <Text style={styles.month}>{section.title}</Text> : null)}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            empty ? <EmptyState group={group} tab={tab} onAdd={() => setAdding(true)} /> : <Text style={styles.noMatch}>{t('Nothing matches “{query}”.', { query })}</Text>
          }
          renderItem={({ item, index }) =>
            item.kind === 'visit' ? (
              <VisitRow visit={item.visit} index={index} onPress={() => setOpen(item.visit)} />
            ) : (
              <WantRow place={item.place} index={index} onBeen={() => addBeen(item.place)} onRemove={() => removeWanted(item.place)} />
            )
          }
        />
      )}

      <VisitSheet
        key={open?.visitId}
        visit={open}
        onClose={() => setOpen(null)}
        onChange={(next) => {
          setOpen(next);
          setVisits((list) => list?.map((v) => (v.visitId === next.visitId ? next : v)) ?? null);
        }}
        onDeleted={(id) => {
          setOpen(null);
          setVisits((list) => list?.filter((v) => v.visitId !== id) ?? null);
        }}
      />
      <AddPlaceSheet
        visible={adding}
        group={group}
        here={here}
        city={profile?.city ?? null}
        onBeen={addBeen}
        onWant={addWant}
        onClose={() => {
          setAdding(false);
          if (reviewNext) {
            // Let the add sheet finish closing before the review sheet opens.
            setTimeout(() => setOpen(reviewNext), 450);
            setReviewNext(null);
          }
        }}
      />
    </SafeAreaView>
  );
}

function Stat({ value, label, icon, color, onPress }: { value: number; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.stat, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${value} ${label}`}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function VisitRow({ visit, index, onPress }: { visit: VisitCardData; index: number; onPress: () => void }) {
  const t = useT();
  const { place } = visit;
  const meta = CategoryMeta[place.category];
  return (
    <Animated.View entering={FadeIn.delay(Math.min(index, 8) * 35)}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button" accessibilityHint={t('Open your review')}>
        <View>
          <PlaceThumb place={place} size={68} radius={16} />
          {visit.rating !== null ? (
            <View style={styles.ratingBadge}>
              <RatingIcon rating={visit.rating} size={14} />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.rowName} numberOfLines={1}>
            {place.name}
          </Text>
          {place.nameZh !== place.name ? (
            <Text style={styles.rowZh} numberOfLines={1}>
              {place.nameZh}
            </Text>
          ) : null}
          <View style={styles.rowMetaLine}>
            <Ionicons name={meta.icon} size={13} color={meta.color} />
            <Text style={styles.rowMeta} numberOfLines={1}>
              {t(meta.short)} · {formatVisitDate(visit.visitedAt)}
            </Text>
          </View>
          {visit.note ? (
            <Text style={styles.review} numberOfLines={2}>
              “{visit.note}”
            </Text>
          ) : visit.tags.length ? (
            <View style={styles.rowTags}>
              {visit.tags.slice(0, 3).map((tag) => (
                <TagChip key={tag} tag={tag} />
              ))}
            </View>
          ) : (
            <Text style={styles.writeReview}>{t('Write a review')}</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
      </Pressable>
    </Animated.View>
  );
}

function WantRow({ place, index, onBeen, onRemove }: { place: Place; index: number; onBeen: () => void; onRemove: () => void }) {
  const t = useT();
  return (
    <Animated.View entering={FadeIn.delay(Math.min(index, 8) * 35)} style={styles.row}>
      <Pressable onPress={() => openPlace(place)} style={styles.wantMain} accessibilityRole="button">
        <PlaceThumb place={place} size={68} radius={16} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.rowName} numberOfLines={1}>
            {place.name}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {placeMeta(place, t(CategoryMeta[place.category].label))}
          </Text>
          <View style={styles.wantActions}>
            <Pressable onPress={() => navigateTo(place)} style={[styles.chip, styles.chipDark]} hitSlop={4}>
              <Ionicons name="navigate" size={12} color="#fff" />
              <Text style={[styles.chipText, { color: '#fff' }]}>{t('Navigate')}</Text>
            </Pressable>
            <Pressable onPress={onBeen} style={styles.chip} hitSlop={4}>
              <Ionicons name="checkmark" size={12} color={Colors.jade} />
              <Text style={styles.chipText}>{place.category === 'hotel' ? t('Stayed here') : t('I went')}</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={t('Remove from Want to go')}>
        <Ionicons name="bookmark" size={20} color={Colors.gold} />
      </Pressable>
    </Animated.View>
  );
}

const EMPTY: Record<PlacesGroup, { icon: IconName; title: string; body: string; prompt: string }> = {
  all: {
    icon: 'map',
    title: tx('Places you visit with Hao will appear here'),
    body: tx('Navigate somewhere, talk to staff with Hao, or tell Hao where you went. You can also add places yourself.'),
    prompt: tx('What should I see around here?'),
  },
  food: {
    icon: 'restaurant',
    title: tx('Your food diary starts here'),
    body: tx('Restaurants you try show up here with your rating and review.'),
    prompt: tx('Find me good food near me'),
  },
  places: {
    icon: 'camera',
    title: tx('No sights yet'),
    body: tx('Temples, museums, parks and markets you visit will be collected here.'),
    prompt: tx('What sights should I see around here?'),
  },
  hotels: {
    icon: 'bed',
    title: tx('Keep track of where you stay'),
    body: tx('Add your hotel or hostel and review it: room, location, staff.'),
    prompt: tx('Find me a good hotel nearby'),
  },
};

function EmptyState({ group, tab, onAdd }: { group: PlacesGroup; tab: Tab; onAdd: () => void }) {
  const t = useT();
  const e = EMPTY[group];
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={styles.empty}>
      <View style={styles.emptyArt}>
        <Ionicons name={tab === 'want' ? 'bookmark' : e.icon} size={42} color={Colors.goldText} />
      </View>
      <Text style={styles.emptyTitle}>{tab === 'want' ? t('Nothing saved yet') : t(e.title)}</Text>
      <Text style={styles.emptyBody}>{tab === 'want' ? t('Tap the bookmark on any place card to save it for later.') : t(e.body)}</Text>
      <View style={styles.emptyActions}>
        <Pressable onPress={onAdd} style={({ pressed }) => [styles.emptyBtn, styles.emptyBtnLight, pressed && styles.pressed]} accessibilityRole="button">
          <Ionicons name="add" size={16} color={Colors.ink} />
          <Text style={[styles.emptyBtnText, { color: Colors.ink }]}>{group === 'hotels' ? t('Add a hotel') : t('Add a place')}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.navigate({ pathname: '/translate', params: { mode: 'places' } })}
          style={({ pressed }) => [styles.emptyBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityHint={t(e.prompt)}>
          <Ionicons name="sparkles" size={16} color="#fff" />
          <Text style={styles.emptyBtnText}>{t('Ask Hao')}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  pressed: { opacity: 0.85 },
  bleed: { marginHorizontal: -Spacing.md },
  topBar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  eyebrow: { fontSize: 12, fontWeight: '700', color: Colors.red, letterSpacing: 0.5 },
  title: { fontSize: 30, fontWeight: '800', color: Colors.ink, letterSpacing: -0.5 },
  viewToggle: { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.line, padding: 3 },
  viewBtn: { width: 38, height: 32, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  viewBtnOn: { backgroundColor: Colors.strong },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center', ...Shadow },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, padding: 12, borderRadius: 18, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line, gap: 2 },
  statValue: { fontSize: 24, fontWeight: '800', color: Colors.ink, marginTop: 4 },
  statLabel: { fontSize: 12, fontWeight: '600', color: Colors.inkSoft },
  filters: { gap: 8, paddingHorizontal: Spacing.md },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: Radius.pill,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  filterOn: { backgroundColor: Colors.strong, borderColor: Colors.strong },
  filterText: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  filterCount: { fontSize: 13, fontWeight: '700', color: Colors.muted },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.inkSoft },
  pendingRow: { gap: 10, paddingHorizontal: Spacing.md },
  segment: { flexDirection: 'row', padding: 4, borderRadius: Radius.pill, backgroundColor: ChatColors.userBubble },
  segmentBtn: { flex: 1, height: 36, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: Colors.card, ...Shadow, shadowOpacity: 0.06 },
  segmentText: { fontSize: 14, fontWeight: '700', color: Colors.inkSoft },
  segmentTextOn: { color: Colors.ink },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 42, borderRadius: Radius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line },
  searchInput: { flex: 1, fontSize: 15, color: Colors.ink },
  error: { color: Colors.redDark, fontSize: 13 },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },
  month: { fontSize: 13, fontWeight: '800', color: Colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  noMatch: { fontSize: 14, color: Colors.inkSoft, textAlign: 'center', marginTop: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line },
  ratingBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: { fontSize: 16, fontWeight: '700', color: Colors.ink },
  rowZh: { fontSize: 13, color: Colors.inkSoft },
  rowMeta: { fontSize: 13, color: Colors.inkSoft, flexShrink: 1 },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  review: { fontSize: 13, lineHeight: 18, fontStyle: 'italic', color: ChatColors.text },
  writeReview: { fontSize: 13, fontWeight: '600', color: Colors.red },
  rowTags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  wantMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  wantActions: { flexDirection: 'row', gap: 6, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.line },
  chipDark: { backgroundColor: Colors.strong, borderColor: Colors.strong },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.ink },
  mapWrap: { flex: 1, marginBottom: Spacing.md, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: Colors.line },
  empty: { alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, gap: 10 },
  emptyArt: { width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.goldSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 19, fontWeight: '800', color: Colors.ink, textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 20, color: Colors.inkSoft, textAlign: 'center' },
  emptyActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, height: 46, borderRadius: Radius.pill, backgroundColor: Colors.red },
  emptyBtnLight: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line },
  emptyBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
}));
