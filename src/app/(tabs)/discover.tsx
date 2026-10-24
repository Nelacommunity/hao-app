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

import { StoryView } from '@/components/story-view';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { useTravellerLanguage } from '@/lib/language-store';
import { useCurrentLocation } from '@/lib/location';
import { runStoryAction } from '@/lib/story-actions';
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
const END = { id: 'end' } as const;
type Item = Story | typeof END;
/** How long to wait for a location fix before loading the feed for the profile city instead. */
const LOCATION_WAIT_MS = 1500;

/** Discover: today's set of short AI stories, one per screen; swipe up for the next, tap through the slides. */
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
  const ready = waited || !!location.coords || location.status === 'denied';
  const coords = ready ? location.coords : null;
  const languageCode = language.code.startsWith('custom:') ? 'en' : language.code.split('-')[0];

  const load = useCallback(
    (refresh = false) => {
      loadFeed({ language: languageCode, location: coords, refresh })
        .then(({ feed, offline }) => {
          setError(null);
          setStories(feed.stories);
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
  }, []);

  const items: Item[] = useMemo(() => (stories ? [...stories, END] : []), [stories]);

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
      const story = stories?.[index];
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
      if (stories) preloadImages(stories.slice(index + 1, index + 3));
    },
    [leaveStory, stories],
  );

  useEffect(() => {
    if (focused) enterStory(active);
    else leaveStory(false);
  }, [focused, active, enterStory, leaveStory]);

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

  const onLayout = (e: LayoutChangeEvent) => setHeight(Math.round(e.nativeEvent.layout.height));
  const topInset = insets.top + HEADER;
  const onStory = !!stories && active < stories.length;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {/* Stories are full-screen pictures (light text on dark); the end and loading screens follow the theme. */}
      {focused ? <StatusBar style={onStory ? 'light' : 'auto'} /> : null}

      {stories === null ? (
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
            item === END ? (
              <CaughtUp height={height} empty={!stories.length} />
            ) : (
              <StoryView
                story={item as Story}
                height={height}
                topInset={topInset}
                active={focused && index === active}
                onNextStory={() => scrollTo(index + 1)}
                onPrevStory={() => scrollTo(index - 1)}
                onSlideChange={(slide) => onSlideChange(item as Story, slide)}
                onAction={(action) => onAction(item as Story, action)}
                onMenu={() => setMenuFor(item as Story)}
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
