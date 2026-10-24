import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { LanguagePicker } from '@/components/language-picker';
import { setTravellerLanguage, useTravellerLanguage } from '@/lib/language-store';
import { Languages, PopularLanguages } from '@/lib/languages';
import { tx, useT } from '@/lib/i18n';

const SLIDES = [
  {
    emoji: '🗣️',
    zh: '说',
    color: Colors.red,
    soft: Colors.redSoft,
    title: tx('Talk to anyone'),
    body: tx('Real-time translation for menus, taxis and new friends. Tap the mic and speak naturally.'),
  },
  {
    emoji: '🗺️',
    zh: '游',
    color: Colors.jade,
    soft: Colors.jadeSoft,
    title: tx('Discover places'),
    body: tx('Curated landmarks, temples and markets on the map — with opening hours and local tips.'),
  },
  {
    emoji: '🥟',
    zh: '吃',
    color: '#E08A1E',
    soft: Colors.goldSoft,
    title: tx('Find amazing food'),
    body: tx('Dish suggestions that fit your taste, spice tolerance and diet, with phrases to order.'),
  },
];

export default function OnboardingScreen() {
  const t = useT();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [index, setIndex] = useState(0);
  const language = useTravellerLanguage();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Keep the chosen language visible even when it isn't one of the quick picks.
  const quickPicks = PopularLanguages.slice(0, 6).some((l) => l.code === language.code)
    ? PopularLanguages.slice(0, 6)
    : [language, ...PopularLanguages.slice(0, 5)];
  const total = SLIDES.length + 1;
  const isLast = index === total - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * width, animated: true });
    setIndex(i);
  };

  const finish = () => router.replace('/sign-up');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.step}>
          {index + 1} / {total}
        </Text>
        {!isLast ? (
          <Pressable onPress={finish} hitSlop={12}>
            <Text style={styles.skip}>{t('Skip')}</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}>
        {SLIDES.map((s) => (
          <View key={s.title} style={[styles.slide, { width }]}>
            <View style={[styles.art, { backgroundColor: s.soft }]}>
              <Text style={[styles.artZh, { color: s.color }]}>{s.zh}</Text>
              <Text style={styles.artEmoji}>{s.emoji}</Text>
            </View>
            <Text style={styles.title}>{t(s.title)}</Text>
            <Text style={styles.body}>{t(s.body)}</Text>
          </View>
        ))}

        <View style={[styles.slide, { width }]}>
          <Text style={styles.title}>{t('What do you speak?')}</Text>
          <Text style={styles.body}>{t('Hao will translate between your language and Mandarin.')}</Text>
          <View style={styles.langGrid}>
            {quickPicks.map((l) => {
              const selected = l.code === language.code;
              return (
                <Pressable
                  key={l.code}
                  onPress={() => setTravellerLanguage(l)}
                  style={[styles.lang, selected && styles.langSelected]}>
                  <Text style={styles.langFlag}>{l.flag}</Text>
                  <Text style={[styles.langName, selected && { color: Colors.red }]} numberOfLines={1}>
                    {l.native}
                  </Text>
                  {selected ? <Ionicons name="checkmark-circle" size={18} color={Colors.red} /> : null}
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [styles.more, pressed && { opacity: 0.7 }]}>
            <Ionicons name="search" size={18} color={Colors.red} />
            <Text style={styles.moreText}>{t('Search {count}+ languages', { count: Languages.length })}</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
          </Pressable>
        </View>
      </ScrollView>

      <View style={styles.bottom}>
        <View style={styles.dots}>
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Pressable
          onPress={() => (isLast ? finish() : goTo(index + 1))}
          style={({ pressed }) => [styles.next, pressed && { opacity: 0.85 }]}>
          <Text style={styles.nextText}>{isLast ? t('Create account') : t('Next')}</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>
      </View>
      <LanguagePicker
        visible={pickerOpen}
        selected={language}
        onSelect={setTravellerLanguage}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  step: { fontSize: 14, fontWeight: '700', color: Colors.muted },
  skip: { fontSize: 15, fontWeight: '700', color: Colors.inkSoft },
  slide: { paddingHorizontal: Spacing.lg, justifyContent: 'center' },
  art: {
    aspectRatio: 1,
    maxHeight: 320,
    alignSelf: 'center',
    width: '100%',
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  artZh: { position: 'absolute', fontSize: 220, fontWeight: '900', opacity: 0.15 },
  artEmoji: { fontSize: 110 },
  title: { fontSize: 30, fontWeight: '800', color: Colors.ink, letterSpacing: -0.5 },
  body: { fontSize: 16, lineHeight: 24, color: Colors.inkSoft, marginTop: Spacing.sm },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.lg },
  lang: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  langSelected: { borderColor: Colors.red, backgroundColor: Colors.redSoft },
  langFlag: { fontSize: 22 },
  langName: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.ink },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.line,
  },
  moreText: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.ink },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.line },
  dotActive: { width: 24, backgroundColor: Colors.red },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.red,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    borderRadius: Radius.pill,
  },
  nextText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
