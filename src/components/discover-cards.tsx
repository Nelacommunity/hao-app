import Ionicons from '@expo/vector-icons/Ionicons';
import * as Speech from 'expo-speech';
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';

import { RAIL_WIDTH } from '@/components/discover-rail';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { CategoryMeta, type Place } from '@/data/places';
import type { Phrase } from '@/data/phrases';
import { useT } from '@/lib/i18n';

type Common = {
  height: number;
  topInset: number;
  active: boolean;
  /** The like / save / share / Hao rail. */
  rail: ReactNode;
};

/** A real place from AMap, full screen: its photos (tap through), what it is, and the way there. */
export function PlaceCard({ place, height, topInset, active, rail, onDirections, onAsk, onDetails }: Common & {
  place: Place;
  onDirections: () => void;
  onAsk: () => void;
  onDetails: () => void;
}) {
  const t = useT();
  const { width } = useWindowDimensions();
  const photos = place.photos.slice(0, 5);
  const [index, setIndex] = useState(0);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active && index !== 0) setIndex(0);
  }
  const meta = CategoryMeta[place.category];
  const onTap = (e: GestureResponderEvent) => {
    const next = index + (e.nativeEvent.locationX < width / 3 ? -1 : 1);
    if (next >= 0 && next < photos.length) setIndex(next);
  };

  return (
    <View style={{ height, width, backgroundColor: meta.color }}>
      <Pressable onPress={onTap} style={StyleSheet.absoluteFill} accessible={false}>
        {photos[index] ? (
          <Image source={{ uri: photos[index] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="disk" accessibilityIgnoresInvertColors />
        ) : null}
      </Pressable>

      <View style={[styles.top, { paddingTop: topInset }]} pointerEvents="none">
        {photos.length > 1 ? (
          <View style={styles.progress}>
            {photos.map((_, i) => (
              <View key={i} style={[styles.bar, i <= index && styles.barDone]} />
            ))}
          </View>
        ) : null}
        <View style={styles.labels}>
          <View style={styles.chip}>
            <Ionicons name={meta.icon} size={13} color="#fff" />
            <Text style={styles.chipText}>{t(meta.short)}</Text>
          </View>
          <View style={styles.chip}>
            <Ionicons name="camera" size={13} color="#fff" />
            <Text style={styles.chipText}>{t('Real photos from Amap')}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.panel, { right: Spacing.md + RAIL_WIDTH - Spacing.sm }]}>
        <Text style={styles.kicker}>{place.type || place.typeZh}</Text>
        <Text style={styles.heading}>{place.name}</Text>
        {place.nameZh && place.nameZh !== place.name ? <Text style={styles.zh}>{place.nameZh}</Text> : null}
        <View style={styles.meta}>
          {place.rating ? (
            <View style={styles.metaItem}>
              <Ionicons name="star" size={13} color={Colors.gold} />
              <Text style={styles.metaText}>{place.rating.toFixed(1)}</Text>
            </View>
          ) : null}
          <Text style={styles.metaText} numberOfLines={1}>
            {place.districtZh || place.cityZh}
          </Text>
          {place.cost ? <Text style={styles.metaText}>{t('About ¥{cost} per person', { cost: place.cost })}</Text> : null}
        </View>
        <Pressable onPress={onDirections} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="button">
          <Ionicons name="navigate" size={18} color="#1B1A1F" />
          <Text style={styles.primaryText}>{t('Directions')}</Text>
        </Pressable>
        <View style={styles.secondaryRow}>
          <Pressable onPress={onAsk} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} accessibilityRole="button">
            <Ionicons name="chatbubbles" size={16} color="#fff" />
            <Text style={styles.secondaryText}>{t('Ask Hao')}</Text>
          </Pressable>
          <Pressable onPress={onDetails} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} accessibilityRole="button">
            <Ionicons name="information-circle" size={16} color="#fff" />
            <Text style={styles.secondaryText}>{t('Details')}</Text>
          </Pressable>
        </View>
      </View>
      {rail}
    </View>
  );
}

/** Today's phrase: the Chinese, its pinyin and meaning, and a button to hear it said. */
export function PhraseCard({ phrase, group, height, topInset, rail, onPractice }: Common & { phrase: Phrase; group: string; onPractice: () => void }) {
  const t = useT();
  const { width } = useWindowDimensions();
  const listen = () => {
    Speech.stop();
    Speech.speak(phrase.zh, { language: 'zh-CN', rate: 0.8 });
  };
  return (
    <View style={{ height, width, backgroundColor: '#24694C' }}>
      <View style={styles.phraseBackdrop} pointerEvents="none">
        <Text style={styles.phraseGhost}>{phrase.zh.slice(0, 1)}</Text>
      </View>
      <View style={[styles.top, { paddingTop: topInset }]} pointerEvents="none">
        <View style={styles.labels}>
          <View style={styles.chip}>
            <Ionicons name="chatbubble-ellipses" size={13} color="#fff" />
            <Text style={styles.chipText}>{t('Phrase of the day')}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{t(group)}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.phraseCenter, { paddingRight: RAIL_WIDTH }]}>
        <Text style={styles.phraseZh} adjustsFontSizeToFit numberOfLines={2}>
          {phrase.zh}
        </Text>
        <Text style={styles.phrasePinyin}>{phrase.pinyin}</Text>
        <Text style={styles.phraseEn}>{t(phrase.en)}</Text>
        <Pressable onPress={listen} style={({ pressed }) => [styles.listen, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={t('Hear it in Chinese')}>
          <Ionicons name="volume-high" size={20} color="#1B1A1F" />
          <Text style={styles.primaryText}>{t('Hear it in Chinese')}</Text>
        </Pressable>
        <Pressable onPress={onPractice} style={({ pressed }) => [styles.secondary, { alignSelf: 'flex-start' }, pressed && styles.pressed]} accessibilityRole="button">
          <Ionicons name="school" size={16} color="#fff" />
          <Text style={styles.secondaryText}>{t('Practise with Hao')}</Text>
        </Pressable>
      </View>
      {rail}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: Spacing.md, gap: Spacing.sm },
  progress: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  barDone: { backgroundColor: '#fff' },
  labels: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.pill, backgroundColor: 'rgba(0,0,0,0.6)' },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  panel: { position: 'absolute', left: Spacing.md, bottom: Spacing.lg, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: 'rgba(12,10,14,0.86)', gap: 4 },
  kicker: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  heading: { color: '#fff', fontSize: 24, fontWeight: '900', lineHeight: 30 },
  zh: { color: 'rgba(255,255,255,0.85)', fontSize: 17, fontWeight: '600' },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 2, marginBottom: Spacing.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: Radius.pill, backgroundColor: '#fff', paddingHorizontal: Spacing.md },
  primaryText: { color: '#1B1A1F', fontSize: 16, fontWeight: '800' },
  secondaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  secondary: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: Radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  secondaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  phraseBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  phraseGhost: { fontSize: 320, color: 'rgba(255,255,255,0.07)', fontWeight: '900' },
  phraseCenter: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  phraseZh: { color: '#fff', fontSize: 64, fontWeight: '900', letterSpacing: 2 },
  phrasePinyin: { color: Colors.gold, fontSize: 24, fontWeight: '700' },
  phraseEn: { color: '#fff', fontSize: 20, lineHeight: 28, marginBottom: Spacing.md },
  listen: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: Radius.pill, backgroundColor: '#fff', paddingHorizontal: Spacing.lg, alignSelf: 'flex-start' },
}));
