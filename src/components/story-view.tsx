import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';

import { PLACE_TYPES, type StoryAction, type StoryType } from '@shared/stories/schema';

import { Radius, Spacing, themed } from '@/constants/theme';
import type { IconName } from '@/data/places';
import { tx, useT } from '@/lib/i18n';
import type { Story } from '@/lib/stories';

export const StoryTypeMeta: Record<StoryType, { label: string; color: string; icon: IconName }> = {
  culture_moment: {
    label: tx('Culture'),
    color: '#9E2F3C',
    icon: 'color-palette',
  },
  place_spotlight: {
    label: tx('Place to visit'),
    color: '#1D5F78',
    icon: 'location',
  },
  your_people_loved: {
    label: tx('Loved by people like you'),
    color: '#5B3F86',
    icon: 'people',
  },
  food_to_try: {
    label: tx('Food to try'),
    color: '#A8561A',
    icon: 'restaurant',
  },
  phrase_of_the_day: {
    label: tx('Phrase of the day'),
    color: '#24694C',
    icon: 'chatbubble-ellipses',
  },
  etiquette_tip: {
    label: tx('Etiquette'),
    color: '#334E70',
    icon: 'hand-left',
  },
  coming_up: { label: tx('Coming up'), color: '#A3172B', icon: 'calendar' },
  season_tip: {
    label: tx('Season tip'),
    color: '#0F6E78',
    icon: 'partly-sunny',
  },
  learn_how: { label: tx('Learn with Hao'), color: '#7A3E9D', icon: 'cut' },
};

const ACTION_ICONS: Record<StoryAction['kind'], IconName> = {
  navigate: 'navigate',
  save_place: 'bookmark',
  talk_to_staff: 'mic',
  find_food: 'search',
  practice_phrase: 'school',
  ask_more: 'chatbubbles',
  learn_with_hao: 'school',
};

type Props = {
  story: Story;
  height: number;
  /** Space the screen header and status bar cover at the top. */
  topInset: number;
  /** This story is the one on screen (it resets to the first slide when it comes back into view). */
  active: boolean;
  /** Tapped past the last slide, or before the first. */
  onNextStory: () => void;
  onPrevStory: () => void;
  onSlideChange: (index: number) => void;
  onAction: (action: StoryAction) => void;
  onMenu: () => void;
};

const SWIPE_PX = 40;

/** One story, full screen: progress bars, the slide's picture (or colour and icon) and its text on a solid panel. */
export function StoryView({ story, height, topInset, active, onNextStory, onPrevStory, onSlideChange, onAction, onMenu }: Props) {
  const t = useT();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const meta = StoryTypeMeta[story.type];
  const slide = story.slides[index];
  const last = index === story.slides.length - 1;
  // "Real photos from Amap" only on place stories; other photos (e.g. Wikimedia Commons) carry their own credit.
  const amapPhotos = PLACE_TYPES.includes(story.type) && story.slides.some((s) => s.image_kind === 'real_photo' && s.image_url);
  const illustrated = slide.image_kind === 'ai_illustration' && !!slide.image_url;

  // Start from the first slide whenever the story comes (back) into view.
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active && index !== 0) setIndex(0);
  }
  useEffect(() => {
    if (active) onSlideChange(index);
    // onSlideChange is a new function every render; only slide changes matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index]);

  const go = (delta: number) => {
    const next = index + delta;
    if (next < 0) onPrevStory();
    else if (next >= story.slides.length) onNextStory();
    else setIndex(next);
  };
  // Clearly sideways drags change the slide; vertical ones scroll to the next story.
  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-18, 18])
    .failOffsetY([-14, 14])
    .onEnd((e) => {
      if (e.translationX <= -SWIPE_PX) go(1);
      else if (e.translationX >= SWIPE_PX) go(-1);
    });

  const onTap = (e: GestureResponderEvent) => go(e.nativeEvent.locationX < width / 3 ? -1 : 1);

  const secondary: StoryAction[] = [];
  if (story.action.kind === 'navigate') {
    secondary.push({
      kind: 'save_place',
      label: t('Save place'),
      payload: story.action.payload,
    });
    secondary.push({
      kind: 'talk_to_staff',
      label: t('Talk to staff'),
      payload: story.action.payload,
    });
  }
  if (story.action.kind !== 'ask_more') secondary.push({ kind: 'ask_more', label: t('Ask Hao more'), payload: {} });

  return (
    <GestureDetector gesture={swipe}>
      <View style={{ height, width, backgroundColor: meta.color }}>
        <Pressable
          onPress={onTap}
          onLongPress={onMenu}
          delayLongPress={450}
          accessible={false}
          importantForAccessibility="no"
          style={StyleSheet.absoluteFill}>
          {slide.image_url ? (
            <Image
              source={{ uri: slide.image_url }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={200}
              cachePolicy="disk"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={styles.iconBackdrop} pointerEvents="none">
              <Ionicons name={meta.icon} size={Math.min(220, width * 0.55)} color="rgba(255,255,255,0.16)" />
            </View>
          )}
        </Pressable>

        <View style={[styles.top, { paddingTop: topInset }]} pointerEvents="box-none">
          <View style={styles.progress} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {story.slides.map((_, i) => (
              <View key={i} style={[styles.bar, i <= index && styles.barDone]} />
            ))}
          </View>
          <View style={styles.labels} pointerEvents="box-none">
            <View style={styles.chip}>
              <Ionicons name={meta.icon} size={13} color="#fff" />
              <Text style={styles.chipText} maxFontSizeMultiplier={1.4}>
                {t(meta.label)}
              </Text>
            </View>
            <View style={styles.chip}>
              <Ionicons name="sparkles" size={13} color="#fff" />
              <Text style={styles.chipText} maxFontSizeMultiplier={1.4}>
                {t('Made by Hao AI')}
              </Text>
            </View>
            {amapPhotos ? (
              <View style={styles.chip}>
                <Ionicons name="camera" size={13} color="#fff" />
                <Text style={styles.chipText} maxFontSizeMultiplier={1.4}>
                  {t('Real photos from Amap')}
                </Text>
              </View>
            ) : illustrated ? (
              <View style={styles.chip}>
                <Ionicons name="brush" size={13} color="#fff" />
                <Text style={styles.chipText} maxFontSizeMultiplier={1.4}>
                  {t('AI illustration')}
                </Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={onMenu}
              hitSlop={12}
              style={styles.menuButton}
              accessibilityRole="button"
              accessibilityLabel={t('Story options')}>
              <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        <View style={[styles.panel, { maxHeight: height * 0.62 }]} pointerEvents="box-none">
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
            {/* One element for screen readers; swipe up/down (adjustable) moves between slides. */}
            <View
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={`${index === 0 ? `${story.title}. ` : ''}${slide.heading}. ${slide.body}`}
              accessibilityValue={{
                text: t('Slide {n} of {total}', {
                  n: index + 1,
                  total: story.slides.length,
                }),
              }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => go(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
              {index === 0 ? <Text style={styles.title}>{story.title}</Text> : null}
              <Text style={styles.heading}>{slide.heading}</Text>
              <Text style={styles.body}>{slide.body}</Text>
            </View>
            {slide.image_url && slide.image_credit ? <Text style={styles.credit}>{t('Photo: {credit}', { credit: slide.image_credit })}</Text> : null}
            {story.attribution && (index === 0 || last) ? <Text style={styles.credit}>{story.attribution}</Text> : null}

            {last ? (
              <View style={styles.actions}>
                <Pressable
                  onPress={() => onAction(story.action)}
                  style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel={story.action.label}>
                  <Ionicons name={ACTION_ICONS[story.action.kind]} size={18} color="#1B1A1F" />
                  <Text style={styles.primaryText}>{story.action.label}</Text>
                </Pressable>
                <View style={styles.secondaryRow}>
                  {secondary.map((a) => (
                    <Pressable
                      key={a.kind}
                      onPress={() => onAction(a)}
                      style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}
                      accessibilityRole="button"
                      accessibilityLabel={a.label}>
                      <Ionicons name={ACTION_ICONS[a.kind]} size={16} color="#fff" />
                      <Text style={styles.secondaryText}>{a.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <Text style={styles.hint} accessibilityElementsHidden importantForAccessibility="no">
                {t('Tap to continue')}
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = themed(() => StyleSheet.create({
  iconBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: '35%',
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  progress: { flexDirection: 'row', gap: 4 },
  bar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  barDone: { backgroundColor: '#fff' },
  labels: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  // Solid (not gradient) backgrounds keep the labels readable on any photo.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  menuButton: {
    padding: 6,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  panel: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    bottom: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(12,10,14,0.86)',
  },
  title: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  heading: { color: '#fff', fontSize: 24, fontWeight: '900', lineHeight: 30 },
  body: { color: '#fff', fontSize: 17, lineHeight: 25, marginTop: 6 },
  hint: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  credit: { color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 16 },
  actions: { gap: Spacing.sm, marginTop: Spacing.xs },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: Radius.pill,
    backgroundColor: '#fff',
    paddingHorizontal: Spacing.md,
  },
  primaryText: { color: '#1B1A1F', fontSize: 16, fontWeight: '800' },
  secondaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  secondaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
}));
