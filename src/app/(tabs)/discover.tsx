import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Share, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReelCard } from '@/components/reel-card';
import { buildFeed, type ReelCard as Card } from '@/lib/discover';
import { useT } from '@/lib/i18n';
import { useTravellerLanguage } from '@/lib/language-store';
import { toggleLike, useLikes } from '@/lib/likes';
import { fetchSavedPlaceIds, setPlaceSaved } from '@/lib/saved-places';

const HEADER = 44;

/** Discover: full-screen cards to swipe through, like reels. A new mix of places, food and culture every day. */
export default function DiscoverScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const language = useTravellerLanguage();
  const likes = useLikes();
  const [height, setHeight] = useState(0);
  const [day, setDay] = useState(() => new Date().toDateString());
  const [saved, setSaved] = useState<Set<string>>(new Set());

  // A fresh feed when the date changes (checked whenever the tab comes back into view).
  useFocusEffect(
    useCallback(() => {
      setDay(new Date().toDateString());
    }, [])
  );
  const feed = useMemo(() => buildFeed(new Date(day)), [day]);

  useEffect(() => {
    fetchSavedPlaceIds()
      .then((ids) => setSaved(new Set(ids)))
      .catch(() => {});
  }, []);

  const locale = language.code.startsWith('custom:') ? 'en-US' : language.speech;
  const onLayout = (e: LayoutChangeEvent) => setHeight(Math.round(e.nativeEvent.layout.height));

  const isLiked = useCallback((card: Card) => (card.kind === 'place' ? saved.has(card.place.id) : likes.has(card.id)), [likes, saved]);

  const like = (card: Card) => {
    if (card.kind !== 'place') return toggleLike(card.id);
    const id = card.place.id;
    const next = !saved.has(id);
    setSaved((s) => {
      const copy = new Set(s);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
    setPlaceSaved(id, next).catch(() =>
      setSaved((s) => {
        const copy = new Set(s);
        if (next) copy.delete(id);
        else copy.add(id);
        return copy;
      })
    );
  };

  const share = (card: Card) => {
    const text = shareText(card, t);
    if (text) Share.share({ message: `${text}\n\n— ${t('Shared from Hao, your China companion')}` }).catch(() => {});
  };

  return (
    <View style={styles.container} onLayout={onLayout}>
      {focused ? <StatusBar style="light" /> : null}
      {height > 0 ? (
        <FlatList
          data={feed}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <ReelCard
              card={item}
              height={height}
              topInset={insets.top + HEADER}
              liked={isLiked(item)}
              onLike={() => like(item)}
              onShare={() => share(item)}
              onOpen={item.kind === 'place' ? () => router.push({ pathname: '/place/[id]', params: { id: item.place.id } }) : undefined}
              locale={locale}
            />
          )}
          pagingEnabled
          snapToInterval={height}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          initialNumToRender={2}
          windowSize={5}
          maxToRenderPerBatch={3}
          removeClippedSubviews
        />
      ) : null}

      <View pointerEvents="none" style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Text style={styles.headerTitle}>{t('Discover')}</Text>
      </View>
    </View>
  );
}

function shareText(card: Card, t: ReturnType<typeof useT>) {
  switch (card.kind) {
    case 'place':
      return `${t(card.place.name)} · ${card.place.nameZh}\n${t(card.place.description)}`;
    case 'dish':
      return `${t(card.dish.name)} · ${card.dish.nameZh}\n${t(card.dish.description)}`;
    case 'culture':
      return `${t(card.item.title)} · ${card.item.zh}\n${t(card.item.body)}`;
    case 'festival':
      return `${t(card.item.name)} · ${card.item.zh}\n${t(card.item.body)}`;
    case 'phrase':
      return `${card.phrase.zh} (${card.phrase.pinyin}) — ${t(card.phrase.en)}`;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', height: undefined },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
