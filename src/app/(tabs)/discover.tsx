import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ListViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { subjectTopics } from '@shared/stories/ranking';
import type { StoryAction } from '@shared/stories/schema';

import { PhraseCard, PlaceCard } from '@/components/discover-cards';
import { DiscoverRail, GuideCaption } from '@/components/discover-rail';
import { StoryView } from '@/components/story-view';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { culturePlaces, fetchLikes, itemKey, mixFeed, phraseOfTheDay, setLiked, shareItem, useHaoGuide, type DiscoverItem } from '@/lib/discover';
import { useT } from '@/lib/i18n';
import { useTravellerLanguage } from '@/lib/language-store';
import { useCurrentLocation } from '@/lib/location';
import { navigateTo } from '@/lib/place-actions';
import { fetchSavedPlaceIds, setPlaceSaved } from '@/lib/saved-places';
import { ASK_MORE, openChatWith, PRACTICE, runStoryAction } from '@/lib/story-actions';
import {
  cachedFeed,
  chinaDay,
  fetchSavedStoryIds,
  flushStoryEvents,
  loadFeed,
  logStoryEvent,
  muteTopic,
  preloadImages,
  removeFromCachedFeed,
  setStorySaved,
  type Story,
} from '@/lib/stories';

const HEADER = 44;
const END = { kind: 'end', id: 'end' } as const;
type Item = DiscoverItem | typeof END;
/** How long to wait for a location fix before loading the feed for the profile city instead. */
const LOCATION_WAIT_MS = 1500;

/**
 * Discover: today's AI stories mixed with real AMap places and a phrase of the day, one per screen; swipe up
 * for the next. Every item can be explained aloud by Hao, liked, saved and shared.
 */
export default function DiscoverScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const language = useTravellerLanguage();
  const location = useCurrentLocation();
  const [height, setHeight] = useState(0);
  const [day, setDay] = useState(chinaDay);
  const [stories, setStories] = useState<Story[] | null>(() => cachedFeed()?.stories ?? null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<Story | null>(null);
  const [waited, setWaited] = useState(false);
  const [feedCity, setFeedCity] = useState<string | null>(() => cachedFeed()?.city ?? null);
  const [places, setPlaces] = useState<DiscoverItem[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<Set<string>>(new Set());
  const [likes, setLikes] = useState<{ counts: Record<string, number>; mine: Set<string> }>({ counts: {}, mine: new Set() });
  const guide = useHaoGuide();
  const listRef = useRef<FlatList<Item>>(null);

  // A new set when the China date changes (checked whenever the tab comes back into view).
  useFocusEffect(
    useCallback(() => {
      setDay(chinaDay());
      return () => void flushStoryEvents();
    }, []),
  );

  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), LOCATION_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  const ready = waited || !!location.coords || location.status === 'denied' || location.status === 'unavailable';
  const coords = ready ? location.coords : null;
  const languageCode = language.code.startsWith('custom:') ? 'en' : language.code.split('-')[0];

  const load = useCallback(
    (refresh = false) => {
      loadFeed({ language: languageCode, location: coords, refresh })
        .then(({ feed, offline }) => {
          setError(null);
          setStories(feed.stories);
          setFeedCity(feed.city || null);
          setOffline(offline);
        })
        .catch((e) => setError(e instanceof Error ? e.message : t('Something went wrong')));
    },
    // Coordinates only matter for the first load of the day; the set then stays the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [languageCode, ready, t],
  );

  useEffect(() => {
    if (ready) load();
  }, [day, ready, load]);

  useEffect(() => {
    fetchSavedStoryIds()
      .then((ids) => setSaved(new Set(ids)))
      .catch(() => {});
    fetchSavedPlaceIds()
      .then((ids) => setSavedPlaces(new Set(ids)))
      .catch(() => {});
  }, []);

  // Real cultural places and landmarks from AMap, around the user or in the feed's city.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    culturePlaces({ near: coords, city: feedCity }).then((list) => !cancelled && setPlaces(list));
    return () => {
      cancelled = true;
    };
    // Like the stories, the places are picked once per day and area.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, feedCity, day]);

  const feed = useMemo(() => mixFeed(stories ?? [], places, phraseOfTheDay(day)), [stories, places, day]);
  const hasFeed = stories !== null || places.length > 0;
  const items: Item[] = useMemo(() => (hasFeed ? [...feed, END] : []), [feed, hasFeed]);

  // Like counts (everyone) and the user's own likes, for what's in the feed.
  const feedKeys = feed.map(itemKey).join('|');
  useEffect(() => {
    if (!feedKeys) return;
    fetchLikes(feedKeys.split('|'))
      .then(setLikes)
      .catch(() => {});
  }, [feedKeys]);

  // ─── What the user does with each story ───────────────────────────────────
  const visit = useRef<{
    id: string;
    since: number;
    lastSlide: number;
    slides: number;
    completed: boolean;
  } | null>(null);

  /** Swiping away before the last slide counts as a skip; leaving the tab or opening an action doesn't. */
  const leaveStory = useCallback((swiped: boolean) => {
    const v = visit.current;
    if (!v) return;
    if (swiped && !v.completed)
      logStoryEvent(v.id, 'skip', {
        slide: v.lastSlide,
        dwellMs: Date.now() - v.since,
      });
    visit.current = null;
  }, []);

  const enterStory = useCallback(
    (index: number) => {
      const item = items[index];
      const story = item?.kind === 'story' ? item.story : undefined;
      if (visit.current && visit.current.id === story?.id) return;
      leaveStory(true);
      if (!story) return;
      visit.current = {
        id: story.id,
        since: Date.now(),
        lastSlide: 0,
        slides: story.slides.length,
        completed: false,
      };
      logStoryEvent(story.id, 'view', { slide: 0 });
      // The next two stories' pictures load while this one is read.
      preloadImages(
        items
          .slice(index + 1, index + 3)
          .flatMap((i) => (i.kind === 'story' ? [i.story] : [])),
      );
    },
    [leaveStory, items],
  );

  useEffect(() => {
    if (focused) enterStory(active);
    else leaveStory(false);
  }, [focused, active, enterStory, leaveStory]);

  // Hao stops talking when the user swipes to another item or leaves the tab.
  const { stop: stopGuide } = guide;
  useEffect(() => stopGuide(), [active, focused, stopGuide]);

  const onSlideChange = useCallback((story: Story, slide: number) => {
    const v = visit.current;
    if (!v || v.id !== story.id) return;
    v.lastSlide = Math.max(v.lastSlide, slide);
    if (!v.completed && slide === v.slides - 1) {
      v.completed = true;
      logStoryEvent(story.id, 'complete', {
        slide,
        dwellMs: Date.now() - v.since,
      });
    }
  }, []);

  const onViewable = useCallback(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first?.index !== undefined && first.index !== null) setActive(first.index);
  }, []);

  const scrollTo = (index: number) => {
    if (index < 0 || index >= items.length) return;
    listRef.current?.scrollToIndex({ index, animated: true });
  };

  // ─── Actions and the menu ─────────────────────────────────────────────────
  const onAction = (story: Story, action: StoryAction) => {
    if (action.kind === 'save_place') {
      runStoryAction(story, action, t).catch(() => {});
      return;
    }
    leaveStory(false);
    runStoryAction(story, action, t).catch(() => {});
  };

  const drop = (keep: (s: Story) => boolean) => {
    setStories((list) => list?.filter(keep) ?? list);
    removeFromCachedFeed(keep);
  };

  const toggleSave = (story: Story) => {
    const next = !saved.has(story.id);
    setSaved((s) => {
      const copy = new Set(s);
      if (next) copy.add(story.id);
      else copy.delete(story.id);
      return copy;
    });
    setStorySaved(story.id, next).catch(() =>
      setSaved((s) => {
        const copy = new Set(s);
        if (next) copy.delete(story.id);
        else copy.add(story.id);
        return copy;
      }),
    );
  };

  const hide = (story: Story) => {
    visit.current = null;
    logStoryEvent(story.id, 'hide');
    drop((s) => s.id !== story.id);
  };

  const notInterested = (story: Story) => {
    const topic = subjectTopics(story.topics)[0];
    visit.current = null;
    logStoryEvent(story.id, 'hide');
    if (!topic) return drop((s) => s.id !== story.id);
    muteTopic(topic).catch(() => {});
    drop((s) => s.id !== story.id && !s.topics.includes(topic));
  };

  const toggleLike = (item: DiscoverItem) => {
    const key = itemKey(item);
    const next = !likes.mine.has(key);
    const apply = (on: boolean) =>
      setLikes((l) => {
        const mine = new Set(l.mine);
        if (on) mine.add(key);
        else mine.delete(key);
        return { mine, counts: { ...l.counts, [key]: Math.max(0, (l.counts[key] ?? 0) + (on ? 1 : -1)) } };
      });
    apply(next);
    setLiked(key, next).catch(() => apply(!next));
  };

  const togglePlaceSaved = (id: string) => {
    const next = !savedPlaces.has(id);
    const apply = (on: boolean) =>
      setSavedPlaces((s) => {
        const copy = new Set(s);
        if (on) copy.add(id);
        else copy.delete(id);
        return copy;
      });
    apply(next);
    setPlaceSaved(id, next).catch(() => apply(!next));
  };

  /** "Ask Hao more" from the voice guide: the chat, with this item as the question. */
  const askMore = (item: DiscoverItem) => {
    guide.stop();
    if (item.kind === 'story') return openChatWith({ mode: 'guide', ask: t(ASK_MORE, { title: item.story.title }), storyId: item.story.id });
    if (item.kind === 'place') return openChatWith({ mode: 'places', ask: t('Tell me about {place} ({zh}). Is it worth a visit?', { place: item.place.name, zh: item.place.nameZh }) });
    openChatWith({ mode: 'guide', ask: t(PRACTICE, { zh: item.phrase.zh, pinyin: item.phrase.pinyin, en: t(item.phrase.en) }) });
  };

  const rail = (item: DiscoverItem) => {
    const key = itemKey(item);
    const speaking = guide.state?.key === key ? guide.state.status : null;
    return (
      <DiscoverRail
        guide={speaking === 'loading' ? 'loading' : speaking === 'speaking' ? 'speaking' : 'idle'}
        liked={likes.mine.has(key)}
        likes={likes.counts[key] ?? 0}
        saved={item.kind === 'story' ? saved.has(item.story.id) : item.kind === 'place' ? savedPlaces.has(item.place.id) : undefined}
        onGuide={() => (speaking === 'loading' || speaking === 'speaking' ? guide.stop() : guide.play(item))}
        onLike={() => toggleLike(item)}
        onSave={item.kind === 'story' ? () => toggleSave(item.story) : item.kind === 'place' ? () => togglePlaceSaved(item.place.id) : undefined}
        onShare={() => shareItem(item, t)}
      />
    );
  };

  const onLayout = (e: LayoutChangeEvent) => setHeight(Math.round(e.nativeEvent.layout.height));
  const topInset = insets.top + HEADER;
  const onStory = items.length > 0 && active < items.length - 1;
  const activeItem = onStory ? (items[active] as DiscoverItem) : null;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {/* Stories are full-screen pictures (light text on dark); the end and loading screens follow the theme. */}
      {focused ? <StatusBar style={onStory ? 'light' : 'auto'} /> : null}

      {!hasFeed ? (
        <View style={styles.center}>
          {error ? (
            <>
              <Text style={styles.endTitle}>{t('Discover could not load')}</Text>
              <Text style={styles.endBody}>{error}</Text>
              <Pressable onPress={() => load(true)} style={styles.endButton} accessibilityRole="button">
                <Text style={styles.endButtonText}>{t('Try again')}</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color={Colors.inkSoft} accessibilityLabel={t('Loading')} />
          )}
        </View>
      ) : height > 0 ? (
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) =>
            item.kind === 'end' ? (
              <CaughtUp height={height} empty={!feed.length} />
            ) : item.kind === 'place' ? (
              <PlaceCard
                place={item.place}
                height={height}
                topInset={topInset}
                active={focused && index === active}
                rail={rail(item)}
                onDirections={() => navigateTo(item.place)}
                onAsk={() => askMore(item)}
                onDetails={() => router.push({ pathname: '/place/[id]', params: { id: item.place.id } })}
              />
            ) : item.kind === 'phrase' ? (
              <PhraseCard
                phrase={item.phrase}
                group={item.group}
                height={height}
                topInset={topInset}
                active={focused && index === active}
                rail={rail(item)}
                onPractice={() => askMore(item)}
              />
            ) : (
              <StoryView
                story={item.story}
                height={height}
                topInset={topInset}
                active={focused && index === active}
                onNextStory={() => scrollTo(index + 1)}
                onPrevStory={() => scrollTo(index - 1)}
                onSlideChange={(slide) => onSlideChange(item.story, slide)}
                onAction={(action) => onAction(item.story, action)}
                onMenu={() => setMenuFor(item.story)}
                rail={rail(item)}
              />
            )
          }
          pagingEnabled
          snapToInterval={height}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: height,
            offset: height * index,
            index,
          })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          initialNumToRender={2}
          windowSize={5}
          maxToRenderPerBatch={3}
          removeClippedSubviews
        />
      ) : null}

      <View pointerEvents="none" style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Text style={[styles.headerTitle, !onStory && styles.headerTitlePlain]} accessibilityRole="header">
          {t('Discover')}
        </Text>
        {offline ? <Text style={styles.offline}>{t('Offline · saved stories from earlier')}</Text> : null}
      </View>

      {activeItem ? (
        <GuideCaption
          state={guide.state?.key === itemKey(activeItem) ? guide.state : null}
          top={topInset + 44}
          onStop={guide.stop}
          onReplay={guide.replay}
          onAsk={() => askMore(activeItem)}
        />
      ) : null}

      <StoryMenu
        story={menuFor}
        saved={!!menuFor && saved.has(menuFor.id)}
        onClose={() => setMenuFor(null)}
        onSave={() => menuFor && toggleSave(menuFor)}
        onHide={() => menuFor && hide(menuFor)}
        onMute={() => menuFor && notInterested(menuFor)}
      />
    </View>
  );
}

/** The end of the day's set. No infinite scroll: back to chat, and a new set tomorrow. */
function CaughtUp({ height, empty }: { height: number; empty: boolean }) {
  const t = useT();
  return (
    <View style={[styles.center, { height }]}>
      <Ionicons name="checkmark-circle" size={64} color={Colors.gold} />
      <Text style={styles.endTitle} accessibilityRole="header">
        {empty ? t('No stories yet today') : t('You’re all caught up for today')}
      </Text>
      <Text style={styles.endBody}>{t('New stories arrive tomorrow. Ask Hao anything in the meantime.')}</Text>
      <Pressable onPress={() => router.navigate('/translate')} style={styles.endButton} accessibilityRole="button">
        <Ionicons name="chatbubbles" size={18} color="#fff" />
        <Text style={styles.endButtonText}>{t('Back to chat')}</Text>
      </Pressable>
    </View>
  );
}

function StoryMenu(props: {
  story: Story | null;
  saved: boolean;
  onClose: () => void;
  onSave: () => void;
  onHide: () => void;
  onMute: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const hasTopic = !!props.story && subjectTopics(props.story.topics).length > 0;
  const options: {
    key: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    run: () => void;
  }[] = [
    {
      key: 'save',
      icon: props.saved ? 'bookmark' : 'bookmark-outline',
      label: props.saved ? t('Unsave') : t('Save'),
      run: props.onSave,
    },
    {
      key: 'hide',
      icon: 'eye-off-outline',
      label: t('Hide this'),
      run: props.onHide,
    },
    ...(hasTopic
      ? [
          {
            key: 'mute',
            icon: 'remove-circle-outline' as const,
            label: t('Not interested in this topic'),
            run: props.onMute,
          },
        ]
      : []),
  ];
  return (
    <Modal visible={!!props.story} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.backdrop} onPress={props.onClose} accessibilityLabel={t('Close')} accessibilityRole="button" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.md }]}>
        {options.map((o) => (
          <Pressable
            key={o.key}
            onPress={() => {
              o.run();
              props.onClose();
            }}
            style={({ pressed }) => [styles.option, pressed && { backgroundColor: Colors.paper }]}
            accessibilityRole="button">
            <Ionicons name={o.icon} size={20} color={Colors.ink} />
            <Text style={styles.optionText}>{o.label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={props.onClose} style={styles.option} accessibilityRole="button">
          <Ionicons name="close" size={20} color={Colors.inkSoft} />
          <Text style={[styles.optionText, { color: Colors.inkSoft }]}>{t('Cancel')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
    backgroundColor: Colors.paper,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  headerTitlePlain: { color: Colors.ink, textShadowColor: 'transparent' },
  offline: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    borderRadius: Radius.pill,
  },
  endTitle: {
    color: Colors.ink,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  endBody: {
    color: Colors.inkSoft,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  endButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    backgroundColor: Colors.red,
  },
  endButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingTop: Spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
  },
  optionText: { color: Colors.ink, fontSize: 16, fontWeight: '700' },
}));
