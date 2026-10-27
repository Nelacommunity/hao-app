import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';

import { PLACE_TYPES, type Quiz, type Slide, type StoryAction, type StoryType } from '@shared/stories/schema';

import { CardPhoto } from '@/components/card-photo';
import { RAIL_WIDTH } from '@/components/discover-rail';
import { Radius, Spacing, themed } from '@/constants/theme';
import type { IconName } from '@/data/places';
import { tx, useT } from '@/lib/i18n';
import { getTravellerLanguage } from '@/lib/language-store';
import { Languages } from '@/lib/languages';
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
  did_you_know: { label: tx('Did you know?'), color: '#8A5A00', icon: 'help-circle' },
  painting: { label: tx('Painting'), color: '#5E4630', icon: 'brush' },
  home_and_china: { label: tx('Your country & China'), color: '#1F6B5C', icon: 'globe' },
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

/** What the reader did with a story's "Tried it / Want to try". */
export type TriedAnswer = 'loved' | 'want';

type Props = {
  story: Story;
  height: number;
  /** Space the screen header and status bar cover at the top. */
  topInset: number;
  /** This story is the one on screen (it resets to the first slide when it comes back into view). */
  active: boolean;
  /** Listen mode: Hao reads each page aloud and turns the page when done. */
  narrate?: boolean;
  /** Tapped past the last slide, or before the first. */
  onNextStory: () => void;
  onPrevStory: () => void;
  onSlideChange: (index: number) => void;
  onAction: (action: StoryAction) => void;
  onMenu: () => void;
  onQuiz?: (right: boolean) => void;
  onTried?: (answer: TriedAnswer) => void;
  /** The like / save / share / Hao rail on the right; the text panel leaves room for it. */
  rail?: ReactNode;
};

const SWIPE_PX = 40;
/** Pause between Hao finishing a page and turning it. */
const TURN_AFTER_MS = 700;

/** A story's pages: its slides, with the quiz before or after them. */
export type Page = { kind: 'slide'; slide: Slide } | { kind: 'quiz'; quiz: Quiz; slide: Slide };

export function storyPages(story: Story): Page[] {
  const slides: Page[] = story.slides.map((slide) => ({ kind: 'slide', slide }));
  const quiz = story.interaction?.quiz;
  if (!quiz) return slides;
  if (story.interaction?.quiz_at === 'start') return [{ kind: 'quiz', quiz, slide: story.slides[0] }, ...slides];
  return [...slides, { kind: 'quiz', quiz, slide: story.slides[story.slides.length - 1] }];
}

/** The device voice for a story's language: the traveller's own voice when it's their language. */
function speechTag(language: string) {
  const mine = getTravellerLanguage();
  if (mine.code.split('-')[0] === language) return mine.speech;
  return Languages.find((l) => l.code === language || l.code.split('-')[0] === language)?.speech ?? language;
}

const LETTERS = ['A', 'B', 'C'];

/** One story, full screen: progress bars, the slide's picture (or colour and icon) and its text on a solid panel. */
export function StoryView({ story, height, topInset, active, narrate = false, onNextStory, onPrevStory, onSlideChange, onAction, onMenu, onQuiz, onTried, rail }: Props) {
  const t = useT();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const [tried, setTried] = useState<TriedAnswer | null>(null);
  const meta = StoryTypeMeta[story.type];
  const pages = storyPages(story);
  const page = pages[Math.min(index, pages.length - 1)];
  const slide = page.slide;
  const last = index === pages.length - 1;
  const quiz = page.kind === 'quiz' ? page.quiz : null;
  // "Real photos from Amap" only on place stories; other photos (e.g. Wikimedia Commons) carry their own credit.
  const amapPhotos = PLACE_TYPES.includes(story.type) && story.slides.some((s) => s.image_kind === 'real_photo' && s.image_url);
  const illustrated = slide.image_kind === 'ai_illustration' && !!slide.image_url;
  // A painting: whole on the first slide, then zoomed into and moved across.
  const slideNumber = story.slides.indexOf(slide);
  const pan = story.type === 'painting' && page.kind === 'slide' ? { step: slideNumber, of: story.slides.length } : null;

  // Start from the first slide (and a fresh quiz) whenever the story comes (back) into view.
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) {
      if (index !== 0) setIndex(0);
      setAnswer(null);
    }
  }
  useEffect(() => {
    if (active) onSlideChange(index);
    // onSlideChange is a new function every render; only slide changes matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index]);

  const go = (delta: number) => {
    const next = index + delta;
    if (next < 0) onPrevStory();
    else if (next >= pages.length) onNextStory();
    else setIndex(next);
  };
  // The narrator turns the page later, with whatever `go` is current then.
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });

  const choose = (i: number) => {
    if (!quiz || answer !== null) return;
    setAnswer(i);
    onQuiz?.(i === quiz.answer);
  };

  // ─── Listen mode: Hao reads the page, then turns it (a quiz waits for an answer first) ───
  const voice = speechTag(story.language);
  const text =
    page.kind === 'slide'
      ? `${index === 0 ? `${story.title}. ` : ''}${slide.heading}. ${slide.body}`
      : answer === null
        ? `${quiz!.question} ${quiz!.choices.map((c, i) => `${LETTERS[i]}: ${c}.`).join(' ')}`
        : `${answer === quiz!.answer ? t('That’s right!') : t('Not quite: it’s {answer}.', { answer: quiz!.choices[quiz!.answer] })} ${quiz!.why}`;
  const waitsForAnswer = page.kind === 'quiz' && answer === null;
  useEffect(() => {
    if (!narrate || !active) return;
    let turn: ReturnType<typeof setTimeout> | null = null;
    let current = true;
    Speech.stop();
    Speech.speak(text, {
      language: voice,
      rate: 0.95,
      // Only a page read to the end turns; a stop (another page, the guide, leaving) doesn't.
      onDone: () => {
        if (current && !waitsForAnswer && !last) turn = setTimeout(() => goRef.current(1), TURN_AFTER_MS);
      },
    });
    return () => {
      current = false;
      if (turn) clearTimeout(turn);
      Speech.stop();
    };
  }, [narrate, active, text, voice, waitsForAnswer, last]);

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

  const pickTried = (value: TriedAnswer) => {
    if (tried) return;
    setTried(value);
    onTried?.(value);
  };

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
            <CardPhoto uri={slide.image_url} pan={pan} />
          ) : (
            <View style={styles.iconBackdrop} pointerEvents="none">
              <Ionicons name={meta.icon} size={Math.min(220, width * 0.55)} color="rgba(255,255,255,0.16)" />
            </View>
          )}
        </Pressable>

        <View style={[styles.top, { paddingTop: topInset }]} pointerEvents="box-none">
          <View style={styles.progress} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {pages.map((_, i) => (
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

        <View style={[styles.panel, { maxHeight: height * 0.62 }, rail ? { right: Spacing.md + RAIL_WIDTH - Spacing.sm } : null]} pointerEvents="box-none">
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
            {quiz ? (
              <View style={{ gap: Spacing.sm }}>
                {index === 0 ? <Text style={styles.title}>{story.title}</Text> : null}
                <Text style={styles.kicker}>{story.interaction?.quiz_at === 'start' ? t('Did you know?') : t('Quick quiz')}</Text>
                <Text style={styles.heading} accessibilityRole="header">
                  {quiz.question}
                </Text>
                <View style={styles.choices} accessibilityRole="radiogroup">
                  {quiz.choices.map((choice, i) => {
                    const right = answer !== null && i === quiz.answer;
                    const wrong = answer === i && i !== quiz.answer;
                    return (
                      <Pressable
                        key={i}
                        onPress={() => choose(i)}
                        disabled={answer !== null}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: answer === i, disabled: answer !== null }}
                        style={({ pressed }) => [styles.choice, right && styles.choiceRight, wrong && styles.choiceWrong, pressed && { opacity: 0.8 }]}>
                        <Text style={styles.choiceLetter}>{LETTERS[i]}</Text>
                        <Text style={styles.choiceText}>{choice}</Text>
                        {right ? <Ionicons name="checkmark-circle" size={20} color="#fff" /> : wrong ? <Ionicons name="close-circle" size={20} color="#fff" /> : null}
                      </Pressable>
                    );
                  })}
                </View>
                {answer !== null ? (
                  <View accessibilityLiveRegion="polite">
                    <Text style={styles.verdict}>{answer === quiz.answer ? t('That’s right!') : t('Not quite: it’s {answer}.', { answer: quiz.choices[quiz.answer] })}</Text>
                    <Text style={styles.body}>{quiz.why}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              /* One element for screen readers; swipe up/down (adjustable) moves between slides. */
              <View
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={`${index === 0 ? `${story.title}. ` : ''}${slide.heading}. ${slide.body}`}
                accessibilityValue={{
                  text: t('Slide {n} of {total}', {
                    n: index + 1,
                    total: pages.length,
                  }),
                }}
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={(e) => go(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
                {index === 0 ? <Text style={styles.title}>{story.title}</Text> : null}
                <Text style={styles.heading}>{slide.heading}</Text>
                <Text style={styles.body}>{slide.body}</Text>
              </View>
            )}
            {slide.image_url && slide.image_credit ? <Text style={styles.credit}>{t('Photo: {credit}', { credit: slide.image_credit })}</Text> : null}
            {story.attribution && (index === 0 || last) ? <Text style={styles.credit}>{story.attribution}</Text> : null}

            {last && story.interaction?.tried ? (
              <View style={styles.triedRow}>
                {tried ? (
                  <Text style={styles.triedDone}>
                    <Ionicons name="checkmark-circle" size={15} color="#fff" /> {t('Added to your Hao DNA')}
                  </Text>
                ) : (
                  <>
                    <Pressable onPress={() => pickTried('loved')} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]} accessibilityRole="button">
                      <Ionicons name="heart" size={15} color="#fff" />
                      <Text style={styles.secondaryText}>{t('Tried it, loved it')}</Text>
                    </Pressable>
                    <Pressable onPress={() => pickTried('want')} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]} accessibilityRole="button">
                      <Ionicons name="sparkles" size={15} color="#fff" />
                      <Text style={styles.secondaryText}>{t('Want to try')}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            ) : null}

            {last && !waitsForAnswer ? (
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
                {waitsForAnswer ? t('Pick an answer, or tap to skip') : t('Tap to continue')}
              </Text>
            )}
          </ScrollView>
        </View>
        {rail}
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
  kicker: { color: '#F2C14E', fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  choices: { gap: 8 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  choiceRight: { backgroundColor: '#1E8A55', borderColor: '#1E8A55' },
  choiceWrong: { backgroundColor: '#B3261E', borderColor: '#B3261E' },
  choiceLetter: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '900', width: 16 },
  choiceText: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700', lineHeight: 21 },
  verdict: { color: '#fff', fontSize: 17, fontWeight: '900', marginTop: 2 },
  triedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  triedDone: { color: '#fff', fontSize: 14, fontWeight: '700' },
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
