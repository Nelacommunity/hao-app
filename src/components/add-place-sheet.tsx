// Add a place to My Places by hand: search AMap by name (near you, or in your city), then mark it as
// somewhere you've been or stayed, or save it to Want to go.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatColors } from '@/components/chat-ui';
import { PlaceThumb, placeMeta } from '@/components/place-thumb';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { CategoryMeta, Cities, type Place, type PlaceCategory } from '@/data/places';
import { useT } from '@/lib/i18n';
import type { Coords } from '@/lib/location';
import { fetchPlaces } from '@/lib/places';
import type { PlacesGroup } from '@/lib/visits';

type Props = {
  visible: boolean;
  /** The filter the user is looking at, so "Add" on Hotels searches hotels. */
  group: PlacesGroup;
  here: Coords | null;
  /** Fallback when location is off (the profile's city, in English or Chinese). */
  city: string | null;
  onBeen: (place: Place) => void;
  onWant: (place: Place) => void;
  onClose: () => void;
};

const CATEGORY_FOR: Partial<Record<PlacesGroup, PlaceCategory>> = { food: 'food', hotels: 'hotel' };

/** A city AMap understands: one of ours by English or Chinese name, else what the user typed. */
const amapCity = (city: string | null) => {
  const known = Cities.find((c) => c.name.toLowerCase() === city?.toLowerCase() || c.nameZh === city);
  return known?.nameZh ?? city ?? Cities[0].nameZh;
};

export function AddPlaceSheet({ visible, group, here, city, onBeen, onWant, onClose }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, 'been' | 'want'>>({});
  const category = CATEGORY_FOR[group];

  // Search as the user types, a moment after they stop.
  useEffect(() => {
    const q = query.trim();
    if (!visible || q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const search = here ? { near: here, radius: 30_000, q, category } : { city: amapCity(city), q, category };
      fetchPlaces(search).then(
        (list) => {
          if (cancelled) return;
          setResults(list);
          setError(null);
        },
        (e: Error) => !cancelled && setError(e.message)
      );
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, visible, here, city, category]);

  const close = () => {
    setQuery('');
    setResults(null);
    setDone({});
    onClose();
  };

  const searching = query.trim().length >= 2 && results === null && !error;
  const hotels = group === 'hotels';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{hotels ? t('Add a hotel') : t('Add a place')}</Text>
          <Pressable onPress={close} hitSlop={10} accessibilityLabel={t('Close')}>
            <Ionicons name="close" size={24} color={Colors.ink} />
          </Pressable>
        </View>
        <Text style={styles.body}>
          {hotels ? t('Find where you’re staying or stayed, then review it.') : t('Find a place you’ve been or want to go. Names in English or Chinese both work.')}
        </Text>

        <View style={styles.search}>
          <Ionicons name="search" size={16} color={Colors.muted} />
          <TextInput
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setResults(null);
            }}
            placeholder={hotels ? t('Hotel name, e.g. Hilton or 如家') : t('Search places')}
            placeholderTextColor={Colors.muted}
            style={styles.input}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching ? <ActivityIndicator size="small" color={Colors.muted} /> : null}
        </View>
        <Text style={styles.where}>
          {here ? t('Searching within 30 km of you') : t('Searching in {city}', { city: city ?? t(Cities[0].name) })}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <FlatList
          data={results ?? []}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl, gap: 8 }}
          ListEmptyComponent={
            results && query.trim().length >= 2 ? <Text style={styles.empty}>{t('No matches. Try the Chinese name or a shorter search.')}</Text> : undefined
          }
          renderItem={({ item }) => {
            const state = done[item.id];
            const stay = item.category === 'hotel';
            return (
              <View style={styles.row}>
                <PlaceThumb place={item} size={52} radius={14} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.nameZh !== item.name ? (
                    <Text style={styles.zh} numberOfLines={1}>
                      {item.nameZh}
                    </Text>
                  ) : null}
                  <Text style={styles.meta} numberOfLines={1}>
                    {placeMeta(item, t(CategoryMeta[item.category].label))}
                  </Text>
                  {state ? (
                    <View style={styles.added}>
                      <Ionicons name="checkmark-circle" size={15} color={Colors.jade} />
                      <Text style={styles.addedText}>{state === 'been' ? t('Added to Visited') : t('Saved to Want to go')}</Text>
                    </View>
                  ) : (
                    <View style={styles.actions}>
                      <Pressable
                        onPress={() => {
                          setDone((d) => ({ ...d, [item.id]: 'been' }));
                          onBeen(item);
                        }}
                        style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                        <Text style={[styles.btnText, { color: '#fff' }]}>{stay ? t('Stayed here') : t('Been here')}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setDone((d) => ({ ...d, [item.id]: 'want' }));
                          onWant(item);
                        }}
                        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
                        <Ionicons name="bookmark-outline" size={14} color={Colors.ink} />
                        <Text style={styles.btnText}>{t('Want to go')}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  pressed: { opacity: 0.8 },
  container: { flex: 1, backgroundColor: Colors.paper, paddingTop: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md },
  title: { fontSize: 22, fontWeight: '800', color: Colors.ink },
  body: { fontSize: 14, lineHeight: 20, color: Colors.inkSoft, paddingHorizontal: Spacing.md, marginTop: 4 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    paddingHorizontal: 12,
    height: 46,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  input: { flex: 1, fontSize: 16, color: Colors.ink },
  where: { fontSize: 12, color: Colors.muted, paddingHorizontal: Spacing.md, marginTop: 6, marginBottom: Spacing.sm },
  error: { fontSize: 13, color: Colors.redDark, paddingHorizontal: Spacing.md },
  empty: { fontSize: 14, color: ChatColors.soft, textAlign: 'center', marginTop: Spacing.lg },
  row: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 18, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line },
  name: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  zh: { fontSize: 13, color: Colors.inkSoft },
  meta: { fontSize: 12, color: Colors.muted },
  actions: { flexDirection: 'row', gap: 6, marginTop: 6 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 32, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.line },
  btnPrimary: { backgroundColor: Colors.jade, borderColor: Colors.jade },
  btnText: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  added: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  addedText: { fontSize: 13, fontWeight: '600', color: Colors.jade },
}));
